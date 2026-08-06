from pathlib import Path

# =====================================================
# PATHS
# =====================================================

ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = ROOT / "modelo" / "modelo_lgb.txt"

TRAIN_PATH = ROOT / "dataset" / "dataset_train.parquet"

TEST_PATH = ROOT / "dataset" / "dataset_test.parquet"

CALENDAR_PATH = ROOT / "datasets" / "calendar.csv"

PRICES_PATH = ROOT / "datasets" / "sell_prices.csv"

# =====================================================
# FORECAST
# =====================================================

FORECAST_DAYS = 30

# =====================================================
# FEATURES
# =====================================================

LAGS = [

    1,
    7,
    14,
    28

]

ROLLING_WINDOWS = [

    7,
    14,
    28

]

ROLLING_STD_WINDOWS = [

    7,
    28

]

# =====================================================
# INVENTARIO
# =====================================================

SERVICE_LEVEL = 0.95

LEAD_TIME = 7

SAFETY_FACTOR = 1.65