# =====================================================
# ORDEN EXACTO DE FEATURES DEL MODELO
# =====================================================

MODEL_COLUMNS = [

    "item_id",
    "dept_id",
    "cat_id",
    "store_id",
    "state_id",

    "wm_yr_wk",

    "weekday",

    "wday",
    "month",
    "year",

    "event_name_1",
    "event_type_1",
    "event_name_2",
    "event_type_2",

    "snap_CA",
    "snap_TX",
    "snap_WI",

    "sell_price",

    "is_weekend",

    "lag_1",
    "lag_7",
    "lag_14",
    "lag_28",

    "rolling_mean_7",
    "rolling_mean_14",
    "rolling_mean_28",

    "rolling_std_7",
    "rolling_std_28",

    "previous_price",
    "price_change",
    "price_pct_change",

    "has_event"

]