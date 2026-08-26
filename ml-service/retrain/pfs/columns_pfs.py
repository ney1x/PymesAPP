MODEL_COLUMNS_PFS = [
    "item_id",
    "item_category_id",
    "shop_id",

    "weekday",
    "wday",
    "month",
    "year",
    "is_weekend",

    "price",
    "price_change",

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

CATEGORICAL_COLUMNS_PFS = ["item_id", "item_category_id", "shop_id", "weekday"]
