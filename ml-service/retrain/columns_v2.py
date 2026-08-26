# =====================================================
# Esquema de features V2 — reemplaza a utils/columns.py del
# motor vendorizado (M5/Walmart) por uno genérico, sin columnas
# atadas a EE.UU. (snap_CA/TX/WI, wm_yr_wk, sell_price de M5).
#
# Motivo: el modelo original solo puede predecir usando categorías
# que existían en el dataset de entrenamiento (M5). item_id="FOODS_1_001"
# o state_id="CA" no significan nada fuera de ese dataset. Este
# esquema usa conceptos que sí existen en cualquier PYME: categoría
# de producto, tienda, calendario, feriados, promoción.
# =====================================================

MODEL_COLUMNS_V2 = [
    "item_id",       # categoría de producto (family en Store Sales)
    "store_id",      # tienda (store_nbr)
    "state_id",      # estado/provincia de la tienda
    "store_type",    # tipo de tienda (stores.csv: A-E)
    "store_cluster",  # cluster de tiendas similares (stores.csv)

    "weekday",
    "wday",
    "month",
    "year",

    "is_weekend",
    "is_holiday",     # hay feriado/evento ese día (nacional, regional o local)
    "holiday_type",   # Holiday / Event / Bridge / Transfer / Additional / Work Day / Ninguno

    "onpromotion",    # cantidad de items en promoción ese día

    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",

    "rolling_mean_7",
    "rolling_mean_14",
    "rolling_mean_28",

    "rolling_std_7",
    "rolling_std_28",
]

CATEGORICAL_COLUMNS_V2 = ["item_id", "store_id", "state_id", "store_type", "holiday_type", "weekday"]
