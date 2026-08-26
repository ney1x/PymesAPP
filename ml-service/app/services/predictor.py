"""Servicio de predicción de demanda.

Orden de intento:
1. Store Sales V2 / PFS dos etapas (ver retrain/RESULTADOS.md): PFS si el
   producto tiene >= UMBRAL_VENTAS_PFS ventas históricas (mejor para evitar
   quiebres de stock), si no Store Sales V2 (mejor exactitud con poco
   historial).
2. Motor LightGBM de IA_INVENTARIO (instalado como paquete editable,
   ver pyproject.toml en IA_INVENTARIO). Requiere que el producto/tienda
   existan en `ai_inventory` y que haya al menos 28 días de historial
   diario; si no, levanta ValueError y caemos al paso 3.
3. Random Forest entrenado (si existe) sobre la serie diaria construida
   a partir de las mismas ventas.
4. Heurística (promedio móvil) si no hay datos suficientes para nada más.

Nunca bloquea el flujo del backend: cualquier error de un paso cae al
siguiente.
"""

import os
from datetime import date

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from forecast.engine import forecast as ia_forecast
from db import repository as ia_repository

from app.models.features import build_daily_series, next_features
from app.models import features_v2

MODEL_PATH = os.getenv("MODEL_PATH", "app/models/demanda_rf.joblib")
MODEL_PATH_V2 = os.getenv("MODEL_PATH_V2", "app/models/modelo_lgb_v2.txt")
MODEL_PATH_PFS_CLF = os.getenv("MODEL_PATH_PFS_CLF", "app/models/modelo_clasificador_pfs.txt")
MODEL_PATH_PFS_REG = os.getenv("MODEL_PATH_PFS_REG", "app/models/modelo_regresor_pfs.txt")
MIN_VENTAS = int(os.getenv("MIN_VENTAS_PARA_ML", "5"))
UMBRAL_VENTAS_PFS = int(os.getenv("UMBRAL_VENTAS_PFS", "60"))
HORIZONTE = int(os.getenv("HORIZONTE_DIAS", "7"))
HISTORIAL_DIAS = 200  # cubre las 12 semanas de historial que necesita PFS dos etapas


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


def _confianza_v2_pfs(horizonte_dias, base):
    """Igual criterio que _confianza_lightgbm (a más días, más se acumula
    el error), con un techo más bajo porque el MAPE documentado de estos
    modelos (ver retrain/RESULTADOS.md) es peor que el motor vendor."""
    if horizonte_dias <= 7:
        return base
    if horizonte_dias <= 30:
        return round(base * 0.75, 2)
    return round(base * 0.5, 2)


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

        self.modelo_v2 = self._cargar_booster(MODEL_PATH_V2)
        self.clasificador_pfs = self._cargar_booster(MODEL_PATH_PFS_CLF)
        self.regresor_pfs = self._cargar_booster(MODEL_PATH_PFS_REG)

    def _cargar(self, path):
        if os.path.exists(path):
            try:
                data = joblib.load(path)
                self.modelo = data.get("modelo")
                self.metricas = data.get("metricas", {})
            except Exception as err:  # pragma: no cover
                print(f"[ml] No se pudo cargar el modelo: {err}")

    def _cargar_booster(self, path):
        if not os.path.exists(path):
            return None
        try:
            return lgb.Booster(model_file=path)
        except Exception as err:  # pragma: no cover
            print(f"[ml] No se pudo cargar el booster '{path}': {err}")
            return None

    def _obtener_categoria(self, item_id):
        try:
            producto = ia_repository.fetch_producto(item_id)
        except Exception as err:  # pragma: no cover
            print(f"[ml] No se pudo obtener producto '{item_id}': {err}")
            return None
        return producto.get("cat_id") if producto else None

    def _obtener_precio_actual(self, item_id, store_id, fecha_limite):
        try:
            precios = ia_repository.fetch_precios(item_id, store_id, fecha_limite)
        except Exception as err:  # pragma: no cover
            print(f"[ml] No se pudo obtener precios de '{item_id}/{store_id}': {err}")
            return np.nan, 0.0

        if not precios:
            return np.nan, 0.0
        if len(precios) == 1:
            return precios[-1]["sell_price"], 0.0
        return precios[-1]["sell_price"], precios[-1]["sell_price"] - precios[-2]["sell_price"]

    def _intentar_v2_o_pfs(self, item_id, store_id, state_id, historical, horizonte_dias):
        """Store Sales V2 (mejor exactitud general) vs PFS dos etapas (mejor
        para evitar quiebres de stock), elegido por umbral de ventas
        históricas — ver retrain/RESULTADOS.md."""
        if not historical:
            raise ValueError("Sin historial para V2/PFS")

        categoria = self._obtener_categoria(item_id)

        if len(historical) >= UMBRAL_VENTAS_PFS and self.clasificador_pfs and self.regresor_pfs:
            try:
                fecha_limite = date.fromisoformat(str(historical[-1]["fecha"])[:10])
                price, price_change = self._obtener_precio_actual(item_id, store_id, fecha_limite)
                demanda = features_v2.predecir_pfs_dos_etapas(
                    self.clasificador_pfs, self.regresor_pfs, historical,
                    item_id, store_id, horizonte_dias,
                    categoria=categoria, price=price, price_change=price_change,
                )
                return {
                    "demandaPredicha": round(demanda),
                    "nivelConfianza": _confianza_v2_pfs(horizonte_dias, 0.55),
                    "metodo": "ml_pfs_dos_etapas",
                }
            except ValueError:
                pass  # historial insuficiente en semanas -> cae a Store Sales V2 abajo

        if not self.modelo_v2:
            raise ValueError("Modelo Store Sales V2 no disponible")

        demanda = features_v2.predecir_store_sales_v2(
            self.modelo_v2, historical, categoria, store_id, state_id, horizonte_dias,
        )
        return {
            "demandaPredicha": round(demanda),
            "nivelConfianza": _confianza_v2_pfs(horizonte_dias, 0.7),
            "metodo": "ml_store_sales_v2",
        }

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
        ventas = ia_repository.fetch_ventas(item_id, store_id, HISTORIAL_DIAS)
        historical = [
            {"fecha": v["fecha"].isoformat(), "cantidad": v["unidades"]}
            for v in ventas
        ]

        bodega = ia_repository.fetch_bodega(store_id)
        state_id = bodega.get("state_id") if bodega else None

        try:
            return self._intentar_v2_o_pfs(item_id, store_id, state_id, historical, horizonte_dias)
        except ValueError as err:
            print(f"[ml] Store Sales V2 / PFS no aplica para {item_id}/{store_id}: {err}")
        except Exception as err:  # no bloquear el flujo por errores inesperados
            print(f"[ml] Error inesperado en motor V2/PFS: {err}")

        try:
            return self._intentar_lightgbm(item_id, store_id, horizonte_dias)
        except ValueError as err:
            print(f"[ml] LightGBM no aplica para {item_id}/{store_id}: {err}")
        except Exception as err:  # no bloquear el flujo por errores inesperados
            print(f"[ml] Error inesperado en motor LightGBM: {err}")

        return self._fallback_random_forest_o_heuristica(historical, horizonte_dias)


predictor = Predictor()
