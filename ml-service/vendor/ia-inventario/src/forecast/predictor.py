from pathlib import Path
from utils.config import MODEL_PATH
from utils.columns import MODEL_COLUMNS
import lightgbm as lgb
import numpy as np
import polars as pl


_model = lgb.Booster(
    model_file=str(MODEL_PATH)
)


def predict(df: pl.DataFrame):

    X = df.select(MODEL_COLUMNS).to_numpy().astype(np.float32)

    return _model.predict(X)