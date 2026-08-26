MODEL_COLUMNS_PFS_WEEKLY = [
    "item_id",
    "item_category_id",
    "shop_id",

    "week_of_year",
    "month",
    "year",

    "price",
    "price_change",
    "weeks_since_last_sale",
    "item_avg_weekly",
    "shop_avg_weekly",

    "lag_1",
    "lag_2",
    "lag_4",
    "lag_8",

    "rolling_mean_4",
    "rolling_mean_8",
    "rolling_mean_12",

    "rolling_std_4",
    "rolling_std_12",
]

CATEGORICAL_COLUMNS_PFS_WEEKLY = ["item_id", "item_category_id", "shop_id"]
