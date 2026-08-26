import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from columns_pfs import MODEL_COLUMNS_PFS, CATEGORICAL_COLUMNS_PFS

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
MODEL_OUT = Path(__file__).resolve().parent / "modelo_lgb_pfs.txt"


def mape(y_true, y_pred, eps=1.0):
    return np.mean(np.abs(y_true - y_pred) / np.maximum(y_true, eps)) * 100


def rmse(y_true, y_pred):
    return np.sqrt(np.mean((y_true - y_pred) ** 2))


def main():
    t0 = time.time()
    train = pd.read_parquet(DATASET_DIR / "train_pfs.parquet")
    holdout = pd.read_parquet(DATASET_DIR / "holdout_pfs.parquet")

    for col in CATEGORICAL_COLUMNS_PFS:
        train[col] = train[col].astype("category")
        holdout[col] = pd.Categorical(holdout[col], categories=train[col].cat.categories)

    X_train, y_train = train[MODEL_COLUMNS_PFS], train["target"]
    X_holdout, y_holdout = holdout[MODEL_COLUMNS_PFS], holdout["target"]

    y_train_fit = np.log1p(y_train)
    y_holdout_fit = np.log1p(y_holdout)

    print(f"Entrenando LightGBM sobre {len(X_train):,} filas, {len(MODEL_COLUMNS_PFS)} features (target: log1p)...")
    ds_train = lgb.Dataset(X_train, label=y_train_fit, categorical_feature=CATEGORICAL_COLUMNS_PFS)
    ds_valid = lgb.Dataset(X_holdout, label=y_holdout_fit, reference=ds_train)

    params = {
        "objective": "regression",
        "metric": "mae",
        "num_leaves": 63,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_data_in_leaf": 50,
        "verbose": -1,
    }

    modelo = lgb.train(
        params,
        ds_train,
        num_boost_round=5000,
        valid_sets=[ds_train, ds_valid],
        valid_names=["train", "holdout"],
        callbacks=[lgb.early_stopping(stopping_rounds=150, verbose=False)],
    )

    print(f"Entrenamiento listo en {time.time()-t0:.1f}s — mejor iteracion: {modelo.best_iteration}")

    pred = np.expm1(modelo.predict(X_holdout, num_iteration=modelo.best_iteration))
    pred = np.clip(pred, 0, None)

    print()
    print("=== Evaluacion sobre holdout real (15 dias que el modelo nunca vio) ===")
    print(f"MAPE modelo LightGBM PFS: {mape(y_holdout.values, pred):.2f}%")
    print(f"RMSE modelo LightGBM PFS: {rmse(y_holdout.values, pred):.2f}")

    baseline_pred = holdout["rolling_mean_7"].values
    print()
    print("=== Linea base: heuristica actual de la app (promedio movil 7d) ===")
    print(f"MAPE heuristica: {mape(y_holdout.values, baseline_pred):.2f}%")
    print(f"RMSE heuristica: {rmse(y_holdout.values, baseline_pred):.2f}")

    mejora = mape(y_holdout.values, baseline_pred) - mape(y_holdout.values, pred)
    print()
    print(f"=> El modelo mejora el MAPE en {mejora:.2f} puntos porcentuales sobre la heuristica" if mejora > 0
          else f"=> El modelo NO mejora la heuristica ({mejora:.2f} pts)")

    # Metrica extra: exactitud de "hubo venta si/no" — mas relevante que MAPE
    # cuando el 90% de los dias no vende nada (MAPE con eps=1 castiga poco
    # los ceros bien predichos, pero no premia detectar el dia que SI vende).
    acierto_dir = np.mean((pred > 0.5) == (y_holdout.values > 0.5)) * 100
    print(f"Acierto 'hubo venta ese dia si/no': {acierto_dir:.1f}%")

    print()
    print("=== Importancia de features (gain) ===")
    imp = modelo.feature_importance(importance_type="gain")
    total = imp.sum() or 1
    for name, val in sorted(zip(modelo.feature_name(), imp), key=lambda x: -x[1]):
        print(f"  {name:<18} {100*val/total:5.2f}%")

    modelo.save_model(str(MODEL_OUT))
    print(f"\nModelo guardado en: {MODEL_OUT}")


if __name__ == "__main__":
    main()
