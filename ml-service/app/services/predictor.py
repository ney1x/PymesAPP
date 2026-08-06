"""Servicio de predicción de demanda.

Orden de intento:
1. Motor LightGBM de IA_INVENTARIO (instalado como paquete editable,
   ver pyproject.toml en IA_INVENTARIO). Requiere que el producto/tienda
   existan en `ai_inventory` y que haya al menos 28 días de historial
   diario; si no, levanta ValueError y caemos al paso 2.
2. Random Forest entrenado (si existe) sobre la serie diaria construida
   a partir de las mismas ventas.
3. Heurística (promedio móvil) si no hay datos suficientes para nada más.

Nunca bloquea el flujo del backend: cualquier error de un paso cae al
siguiente.
"""

import os

import joblib
import pandas as pd

from forecast.engine import forecast as ia_forecast
from db import repository as ia_repository

from app.models.features import build_daily_series, next_features

MODEL_PATH = os.getenv("MODEL_PATH", "app/models/demanda_rf.joblib")
MIN_VENTAS = int(os.getenv("MIN_VENTAS_PARA_ML", "5"))
HORIZONTE = int(os.getenv("HORIZONTE_DIAS", "7"))
HISTORIAL_DIAS = 90


def _confianza_lightgbm(horizonte_dias):
    """El forecast es recursivo (cada día usa la predicción del anterior):
    a más días, más se acumula el error. MAPE documentado (ver IA_Train.md)
    21.62% en horizonte de 1 día -> ~0.78 de base, se penaliza en horizontes
    largos."""
    if horizonte_dias <= 7:
        return 0.75
    if horizonte_dias <= 30:
        return 0.6
    return 0.4

COLUMNAS = [
    "dia_semana",
    "dia_mes",
    "mes",
    "lag_1",
    "lag_2",
    "lag_3",
    "lag_7",
    "media_7",
    "media_14",
    "dias_sin_venta",
]


def heuristica(historical, horizonte=HORIZONTE):
    """Promedio diario de los últimos días multiplicado por el horizonte."""
    total = sum(int(v["cantidad"]) for v in historical)
    dias = max(1, len(historical))
    promedio_diario = total / dias
    confianza = min(0.95, 0.3 + len(historical) / 100)
    return {
        "demandaPredicha": round(promedio_diario * horizonte),
        "nivelConfianza": round(confianza, 2),
        "metodo": "heuristica",
    }


class Predictor:
    def __init__(self, model_path=MODEL_PATH):
        self.modelo = None
        self.metricas = None
        self._cargar(model_path)

    def _cargar(self, path):
        if os.path.exists(path):
            try:
                data = joblib.load(path)
                self.modelo = data.get("modelo")
                self.metricas = data.get("metricas", {})
            except Exception as err:  # pragma: no cover
                print(f"[ml] No se pudo cargar el modelo: {err}")

    def _intentar_lightgbm(self, item_id, store_id, horizonte_dias):
        predicciones = ia_forecast(item_id, store_id, dias=horizonte_dias)
        demanda = float(predicciones["prediction"].sum())
        return {
            "demandaPredicha": round(max(0, demanda)),
            "nivelConfianza": _confianza_lightgbm(horizonte_dias),
            "metodo": "ml_lightgbm",
        }

    def _fallback_random_forest_o_heuristica(self, historical, horizonte_dias):
        if not historical:
            return {"demandaPredicha": 0, "nivelConfianza": 0.0, "metodo": "sin_datos"}

        if len(historical) < MIN_VENTAS:
            return heuristica(historical, horizonte_dias)

        serie = build_daily_series(historical)

        if len(serie) < 14:
            return heuristica(historical, horizonte_dias)

        if self.modelo is None:
            return {**heuristica(historical, horizonte_dias), "metodo": "fallback"}

        try:
            features = pd.DataFrame([next_features(serie)])[COLUMNAS]
            # El modelo se entrena para un target de HORIZONTE (7) días;
            # se escala proporcionalmente para otros horizontes.
            demanda = float(self.modelo.predict(features)[0]) * (horizonte_dias / HORIZONTE)

            r2 = self.metricas.get("r2")
            n = self.metricas.get("n_muestras", 0)
            confianza = 0.5 + 0.45 * (max(0.0, float(r2) if r2 is not None else 0.5))
            confianza = min(0.95, confianza * min(1.0, n / 50))
            confianza = max(0.1, confianza)
            if horizonte_dias != HORIZONTE:
                confianza *= 0.8  # el escalado lineal es una aproximación

            return {
                "demandaPredicha": round(max(0, demanda)),
                "nivelConfianza": round(confianza, 2),
                "metodo": "ml_random_forest",
            }
        except Exception as err:
            print(f"[ml] Error durante la predicción RF: {err}")
            return {**heuristica(historical, horizonte_dias), "metodo": "fallback"}

    def predict(self, item_id: str, store_id: str, horizonte_dias: int = HORIZONTE):
        try:
            return self._intentar_lightgbm(item_id, store_id, horizonte_dias)
        except ValueError as err:
            print(f"[ml] LightGBM no aplica para {item_id}/{store_id}: {err}")
        except Exception as err:  # no bloquear el flujo por errores inesperados
            print(f"[ml] Error inesperado en motor LightGBM: {err}")

        ventas = ia_repository.fetch_ventas(item_id, store_id, HISTORIAL_DIAS)
        historical = [
            {"fecha": v["fecha"].isoformat(), "cantidad": v["unidades"]}
            for v in ventas
        ]
        return self._fallback_random_forest_o_heuristica(historical, horizonte_dias)


predictor = Predictor()
