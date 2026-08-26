"""Features de producción para Store Sales V2 y PFS dos etapas.

Ambos modelos se entrenaron sobre datasets de Kaggle (Ecuador / Rusia) cuyos
`item_id`/`store_id`/`shop_id` no tienen relación con los IDs reales de esta
app. Esto no bloquea su uso: LightGBM guarda el vocabulario categórico
(`pandas_categorical`) dentro del propio `.txt` al hacer `save_model()`, y
`Booster.predict()` sobre un DataFrame de pandas lo vuelve a aplicar solo —
cualquier valor no visto en entrenamiento (como nuestros IDs reales) se
convierte en "missing", que el árbol enruta por la rama aprendida para
valores faltantes. Por eso alcanza con pasar los IDs reales (o None donde no
hay dato real) con el mismo nombre/orden de columna que en entrenamiento, sin
reconstruir el vocabulario original.

Categoría real de producto (`productos.cat_id`, espejada desde `producto.categoria`
por backend/src/lib/iaSync.js) y precio real (`precios`, vía `fetch_precios`)
sí existen en el esquema real y se usan abajo. No hay tabla de feriados ni de
promociones de Ecuador — esas columnas quedan con un placeholder neutro
documentado en cada función.
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.models.features import build_daily_series

MODEL_COLUMNS_V2 = [
    "item_id", "store_id", "state_id", "store_type", "store_cluster",
    "weekday", "wday", "month", "year",
    "is_weekend", "is_holiday", "holiday_type",
    "onpromotion",
    "lag_1", "lag_7", "lag_14", "lag_28",
    "rolling_mean_7", "rolling_mean_14", "rolling_mean_28",
    "rolling_std_7", "rolling_std_28",
]

MODEL_COLUMNS_PFS_WEEKLY = [
    "item_id", "item_category_id", "shop_id",
    "week_of_year", "month", "year",
    "price", "price_change", "weeks_since_last_sale",
    "item_avg_weekly", "shop_avg_weekly",
    "lag_1", "lag_2", "lag_4", "lag_8",
    "rolling_mean_4", "rolling_mean_8", "rolling_mean_12",
    "rolling_std_4", "rolling_std_12",
]

# Deben coincidir exactamente con columns_v2.py / columns_pfs_weekly.py de
# retrain/: LightGBM guarda cuántas columnas categóricas tenía el dataset de
# entrenamiento, y Booster.predict() exige que un DataFrame nuevo declare el
# mismo número de columnas como dtype "category" de pandas para poder
# remapearlas (cualquier valor no visto -> NaN); si llegan como texto plano
# no las cuenta como categóricas y la predicción falla.
CATEGORICAL_COLUMNS_V2 = ["item_id", "store_id", "state_id", "store_type", "holiday_type", "weekday"]
CATEGORICAL_COLUMNS_PFS_WEEKLY = ["item_id", "item_category_id", "shop_id"]

UMBRAL_CLASIFICADOR_PFS = 0.15
MIN_SEMANAS_PFS = 12  # necesarias para rolling_std_12


def _lag(demanda, idx, lag):
    pos = idx - lag
    return float(demanda[pos]) if pos >= 0 else 0.0


def _rolling(demanda, idx, ventana, std=False):
    desde = max(0, idx - ventana)
    valores = demanda[desde:idx]
    if not valores:
        return 0.0
    return float(np.std(valores)) if std else float(np.mean(valores))


def _v2_fila(serie, fecha, categoria, store_id, state_id):
    demanda = [s["demanda"] for s in serie]
    idx = len(demanda)

    return {
        # "item_id" en este esquema representa la categoría/familia del
        # producto (ver retrain/columns_v2.py), no el SKU individual.
        "item_id": categoria,
        "store_id": store_id,
        "state_id": state_id,
        "store_type": None,
        "store_cluster": np.nan,  # numérica (no categórica) -> debe ser float, no None
        "weekday": fecha.strftime("%A"),
        "wday": fecha.weekday() + 1,
        "month": fecha.month,
        "year": fecha.year,
        "is_weekend": int(fecha.weekday() >= 5),
        # Sin tabla de feriados/promociones de Ecuador en el esquema real.
        "is_holiday": 0,
        "holiday_type": "Ninguno",
        "onpromotion": 0,
        "lag_1": _lag(demanda, idx, 1),
        "lag_7": _lag(demanda, idx, 7),
        "lag_14": _lag(demanda, idx, 14),
        "lag_28": _lag(demanda, idx, 28),
        "rolling_mean_7": _rolling(demanda, idx, 7),
        "rolling_mean_14": _rolling(demanda, idx, 14),
        "rolling_mean_28": _rolling(demanda, idx, 28),
        "rolling_std_7": _rolling(demanda, idx, 7, std=True),
        "rolling_std_28": _rolling(demanda, idx, 28, std=True),
    }


def predecir_store_sales_v2(modelo, historical, categoria, store_id, state_id, horizonte_dias):
    """Forecast recursivo día a día (el propio train.py documenta que el
    target es "venta del día, igual que el motor recursivo actual")."""
    serie = build_daily_series(historical)
    if not serie:
        raise ValueError("Sin historial para Store Sales V2")

    ultima_fecha = date.fromisoformat(serie[-1]["fecha"])
    total = 0.0

    for _ in range(horizonte_dias):
        ultima_fecha += timedelta(days=1)
        fila = _v2_fila(serie, ultima_fecha, categoria, store_id, state_id)
        X = pd.DataFrame([fila])[MODEL_COLUMNS_V2]
        for col in CATEGORICAL_COLUMNS_V2:
            X[col] = X[col].astype("category")
        pred = float(np.expm1(modelo.predict(X)[0]))
        pred = max(0.0, pred)
        total += pred
        serie.append({"fecha": ultima_fecha.isoformat(), "demanda": pred})

    return total


def build_weekly_series(historical):
    """Agrega ventas diarias a semanas (lunes=inicio, igual que
    prepare_dataset_weekly.py: pd.Period('W-SUN').start_time)."""
    if not historical:
        return []

    por_semana = {}
    for venta in historical:
        fecha = date.fromisoformat(str(venta["fecha"])[:10])
        inicio_semana = fecha - timedelta(days=fecha.weekday())
        por_semana[inicio_semana] = por_semana.get(inicio_semana, 0.0) + float(venta["cantidad"])

    if not por_semana:
        return []

    semanas_ordenadas = sorted(por_semana)
    inicio, fin = semanas_ordenadas[0], semanas_ordenadas[-1]

    serie = []
    actual = inicio
    while actual <= fin:
        serie.append({"semana": actual, "demanda": por_semana.get(actual, 0.0)})
        actual += timedelta(days=7)

    return serie


def _pfs_fila(serie_semanal, proxima_semana, item_id, store_id, categoria, price, price_change):
    demanda = [s["demanda"] for s in serie_semanal]
    idx = len(demanda)

    con_venta = [d for d in demanda if d > 0]
    item_avg_weekly = float(np.mean(demanda)) if demanda else 0.0
    shop_avg_weekly = item_avg_weekly  # misma serie: no hay agregación multi-producto real disponible

    semanas_sin_venta = 99
    for offset, d in enumerate(reversed(demanda), start=1):
        if d > 0:
            semanas_sin_venta = offset - 1
            break

    return {
        "item_id": item_id,
        "item_category_id": categoria,
        "shop_id": store_id,
        "week_of_year": proxima_semana.isocalendar()[1],
        "month": proxima_semana.month,
        "year": proxima_semana.year,
        "price": price,
        "price_change": price_change,
        "weeks_since_last_sale": semanas_sin_venta,
        "item_avg_weekly": item_avg_weekly,
        "shop_avg_weekly": shop_avg_weekly,
        "lag_1": _lag(demanda, idx, 1),
        "lag_2": _lag(demanda, idx, 2),
        "lag_4": _lag(demanda, idx, 4),
        "lag_8": _lag(demanda, idx, 8),
        "rolling_mean_4": _rolling(demanda, idx, 4),
        "rolling_mean_8": _rolling(demanda, idx, 8),
        "rolling_mean_12": _rolling(demanda, idx, 12),
        "rolling_std_4": _rolling(demanda, idx, 4, std=True),
        "rolling_std_12": _rolling(demanda, idx, 12, std=True),
    }, len(con_venta)


def predecir_pfs_dos_etapas(clasificador, regresor, historical, item_id, store_id, horizonte_dias,
                             categoria=None, price=0.0, price_change=0.0):
    serie_semanal = build_weekly_series(historical)
    if len(serie_semanal) < MIN_SEMANAS_PFS:
        raise ValueError("Historial insuficiente en semanas para PFS dos etapas")

    proxima_semana = serie_semanal[-1]["semana"] + timedelta(days=7)
    fila, _ = _pfs_fila(serie_semanal, proxima_semana, item_id, store_id, categoria, price, price_change)

    X = pd.DataFrame([fila])[MODEL_COLUMNS_PFS_WEEKLY]
    for col in CATEGORICAL_COLUMNS_PFS_WEEKLY:
        X[col] = X[col].astype("category")
    p_venta = float(clasificador.predict(X)[0])
    cantidad = max(0.0, float(regresor.predict(X)[0]))

    demanda_semana = cantidad if p_venta > UMBRAL_CLASIFICADOR_PFS else 0.0

    # El modelo predice una semana; para otros horizontes se escala
    # proporcionalmente (misma aproximación que ya usa el fallback RF).
    return demanda_semana * (horizonte_dias / 7)
