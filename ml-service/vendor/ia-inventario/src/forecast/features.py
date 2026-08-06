import polars as pl
from datetime import timedelta
from utils.config import LAGS
from utils.config import ROLLING_WINDOWS
from utils.config import ROLLING_STD_WINDOWS


# =====================================================
# GENERAR FEATURES PARA EL SIGUIENTE DÍA
# =====================================================

def generar_features(historial: pl.DataFrame) -> pl.DataFrame:
    """
    Genera las features necesarias para predecir
    el siguiente día.
    """

    if historial.height < 28:
        raise ValueError(
            "Se requieren al menos 28 días de historial."
        )

    historial = historial.sort("date")

    ventas = historial["sales"].to_list()

    ultima = historial.tail(1)

    ultima_fecha = ultima["date"][0]

    siguiente_fecha = ultima_fecha + timedelta(days=1)

    # =====================================================
    # VARIABLES TEMPORALES
    # =====================================================

    wday = siguiente_fecha.weekday() + 1
    
    weekday = wday

    month = siguiente_fecha.month

    year = siguiente_fecha.year

    is_weekend = 1 if wday >= 6 else 0

    # =====================================================
    # LAGS
    # =====================================================

    lags = {}
    for lag in LAGS:
        lags[f"lag_{lag}"] = ventas[-lag]



    # =====================================================
    # ROLLING
    # =====================================================
    
    rolling = {}
    for window in ROLLING_WINDOWS:
        rolling[f"rolling_mean_{window}"] = (
        sum(ventas[-window:]) / window
    )

    # =====================================================
    # ROLLING STD
    # =====================================================

    for window in ROLLING_STD_WINDOWS:
        ventana = ventas[-window:]
        media = sum(ventana) / window
        varianza = sum((v - media) ** 2 for v in ventana) / (window - 1)
        rolling[f"rolling_std_{window}"] = varianza ** 0.5

    # =====================================================
    # PRECIO
    # =====================================================

    sell_price = ultima["sell_price"][0]

    previous_price = ultima["previous_price"][0]

    price_change = sell_price - previous_price

    if previous_price == 0:
        price_pct_change = 0.0
    else:
        price_pct_change = (
            price_change / previous_price
        )

    # =====================================================
    # EVENTOS
    # =====================================================

    has_event = ultima["has_event"][0]

    event_name_1 = ultima["event_name_1"][0]

    event_type_1 = ultima["event_type_1"][0]

    event_name_2 = ultima["event_name_2"][0]

    event_type_2 = ultima["event_type_2"][0]

    snap_CA = ultima["snap_CA"][0]

    snap_TX = ultima["snap_TX"][0]

    snap_WI = ultima["snap_WI"][0]

    wm_yr_wk = ultima["wm_yr_wk"][0]

    # =====================================================
    # VARIABLES DEL PRODUCTO
    # =====================================================

    item_id = ultima["item_id"][0]

    dept_id = ultima["dept_id"][0]

    cat_id = ultima["cat_id"][0]

    store_id = ultima["store_id"][0]

    state_id = ultima["state_id"][0]

    # =====================================================
    # VECTOR FINAL
    # =====================================================

    features = {

    "item_id": item_id,
    "dept_id": dept_id,
    "cat_id": cat_id,
    "store_id": store_id,
    "state_id": state_id,

    "date": siguiente_fecha,

    "wm_yr_wk": wm_yr_wk,

    "weekday": weekday,
    "wday": wday,
    "month": month,
    "year": year,

    "event_name_1": event_name_1,
    "event_type_1": event_type_1,
    "event_name_2": event_name_2,
    "event_type_2": event_type_2,

    "snap_CA": snap_CA,
    "snap_TX": snap_TX,
    "snap_WI": snap_WI,

    "sell_price": sell_price,

    "is_weekend": is_weekend,

    "previous_price": previous_price,
    "price_change": price_change,
    "price_pct_change": price_pct_change,

    "has_event": has_event

}
    features.update(lags)
    features.update(rolling)

    return pl.DataFrame([features])