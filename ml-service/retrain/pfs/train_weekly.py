import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from columns_pfs_weekly import MODEL_COLUMNS_PFS_WEEKLY, CATEGORICAL_COLUMNS_PFS_WEEKLY

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
SUFIJO = f"_min{sys.argv[1]}" if len(sys.argv) > 1 else "_min60"
MODEL_OUT = Path(__file__).resolve().parent / f"modelo_lgb_pfs_weekly{SUFIJO}.txt"


def mape(y_true, y_pred, eps=1.0):
    return np.mean(np.abs(y_true - y_pred) / np.maximum(y_true, eps)) * 100


def rmse(y_true, y_pred):
    return np.sqrt(np.mean((y_true - y_pred) ** 2))


def main():
    t0 = time.time()
    train = pd.read_parquet(DATASET_DIR / f"train_pfs_weekly{SUFIJO}.parquet")
    holdout = pd.read_parquet(DATASET_DIR / f"holdout_pfs_weekly{SUFIJO}.parquet")

    for col in CATEGORICAL_COLUMNS_PFS_WEEKLY:
        train[col] = train[col].astype("category")
        holdout[col] = pd.Categorical(holdout[col], categories=train[col].cat.categories)

    X_train, y_train = train[MODEL_COLUMNS_PFS_WEEKLY], train["target"]
    X_holdout, y_holdout = holdout[MODEL_COLUMNS_PFS_WEEKLY], holdout["target"]

    # Tweedie: pensado justo para esto (muchos ceros + resto sesgado a la
    # derecha) — entrena directo sobre la escala real, sin el truco de log1p.
    ds_train = lgb.Dataset(X_train, label=y_train, categorical_feature=CATEGORICAL_COLUMNS_PFS_WEEKLY)
    ds_valid = lgb.Dataset(X_holdout, label=y_holdout, reference=ds_train)

    print(f"Entrenando LightGBM (tweedie) sobre {len(X_train):,} filas semanales, {len(MODEL_COLUMNS_PFS_WEEKLY)} features...")
    params = {
        "objective": "tweedie",
        "tweedie_variance_power": 1.2,
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
        params, ds_train, num_boost_round=5000,
        valid_sets=[ds_train, ds_valid], valid_names=["train", "holdout"],
        callbacks=[lgb.early_stopping(stopping_rounds=150, verbose=False)],
    )
    print(f"Entrenamiento listo en {time.time()-t0:.1f}s — mejor iteracion: {modelo.best_iteration}")

    pred = np.clip(modelo.predict(X_holdout, num_iteration=modelo.best_iteration), 0, None)
    y = y_holdout.values

    print()
    print("=== General (todas las semanas del holdout) ===")
    print(f"MAPE: {mape(y, pred):.2f}%  | RMSE: {rmse(y, pred):.2f}")
    baseline = holdout["rolling_mean_4"].values
    print(f"MAPE heuristica (promedio movil 4 semanas): {mape(y, baseline):.2f}%")

    con_venta = y > 0
    print()
    print(f"=== Solo semanas CON venta real ({con_venta.sum():,} de {len(y):,}, {100*con_venta.mean():.1f}%) ===")
    print(f"MAPE: {mape(y[con_venta], pred[con_venta]):.2f}%  | MAE: {np.mean(np.abs(y[con_venta]-pred[con_venta])):.2f} unidades")
    print(f"MAPE heuristica (mismo subset): {mape(y[con_venta], baseline[con_venta]):.2f}%")
    print(f"Venta semanal promedio real (en semanas con venta): {y[con_venta].mean():.2f} unidades")

    fn = con_venta & (pred < 0.5)
    print(f"Semanas con venta real que el modelo predijo en 0: {fn.sum()} de {con_venta.sum()} ({100*fn.sum()/con_venta.sum():.1f}%)")

    print()
    print("=== Importancia de features (gain) ===")
    imp = modelo.feature_importance(importance_type="gain")
    total = imp.sum() or 1
    for name, val in sorted(zip(modelo.feature_name(), imp), key=lambda x: -x[1]):
        print(f"  {name:<16} {100*val/total:5.2f}%")

    modelo.save_model(str(MODEL_OUT))
    print(f"\nModelo guardado en: {MODEL_OUT}")


if __name__ == "__main__":
    main()
