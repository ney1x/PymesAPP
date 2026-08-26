import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from columns_pfs_weekly import MODEL_COLUMNS_PFS_WEEKLY, CATEGORICAL_COLUMNS_PFS_WEEKLY

DATASET_DIR = Path(__file__).resolve().parent / "dataset"


def mape(y_true, y_pred, eps=1.0):
    return np.mean(np.abs(y_true - y_pred) / np.maximum(y_true, eps)) * 100


def main():
    train = pd.read_parquet(DATASET_DIR / "train_pfs_weekly.parquet")
    holdout = pd.read_parquet(DATASET_DIR / "holdout_pfs_weekly.parquet")

    for col in CATEGORICAL_COLUMNS_PFS_WEEKLY:
        train[col] = train[col].astype("category")
        holdout[col] = pd.Categorical(holdout[col], categories=train[col].cat.categories)

    X_train, y_train = train[MODEL_COLUMNS_PFS_WEEKLY], train["target"]
    X_holdout, y_holdout = holdout[MODEL_COLUMNS_PFS_WEEKLY], holdout["target"]
    y = y_holdout.values
    con_venta = y > 0

    resultados = []
    for vp in [1.05, 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.9]:
        t0 = time.time()
        ds_train = lgb.Dataset(X_train, label=y_train, categorical_feature=CATEGORICAL_COLUMNS_PFS_WEEKLY)
        ds_valid = lgb.Dataset(X_holdout, label=y_holdout, reference=ds_train)
        params = {
            "objective": "tweedie",
            "tweedie_variance_power": vp,
            "metric": "mae",
            "num_leaves": 63,
            "learning_rate": 0.05,
            "feature_fraction": 0.8,
            "bagging_fraction": 0.8,
            "bagging_freq": 5,
            "min_data_in_leaf": 30,
            "verbose": -1,
        }
        modelo = lgb.train(
            params, ds_train, num_boost_round=2000,
            valid_sets=[ds_valid], valid_names=["holdout"],
            callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
        )
        pred = np.clip(modelo.predict(X_holdout, num_iteration=modelo.best_iteration), 0, None)

        mape_venta = mape(y[con_venta], pred[con_venta])
        miss = np.mean((pred[con_venta] < 0.5)) * 100
        dur = time.time() - t0
        resultados.append((vp, mape_venta, miss, modelo.best_iteration, dur))
        print(f"variance_power={vp:<5} MAPE(venta real)={mape_venta:6.2f}%  miss={miss:5.1f}%  "
              f"best_iter={modelo.best_iteration:<5} ({dur:.1f}s)")

    print()
    mejor = min(resultados, key=lambda r: r[1])
    print(f"=> Mejor MAPE: variance_power={mejor[0]} con {mejor[1]:.2f}%")


if __name__ == "__main__":
    main()
