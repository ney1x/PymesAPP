"""
Entrena el LightGBM V2 sobre el dataset de Store Sales y lo evalua
contra el holdout real (ultimos 15 dias), comparando contra una
heuristica de linea base (promedio movil de 7 dias) para saber si
el modelo realmente aporta sobre "no hacer nada inteligente".
"""
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from columns_v2 import MODEL_COLUMNS_V2, CATEGORICAL_COLUMNS_V2

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
# Las ventas estan muy sesgadas (media 357, max 124717) — entrenar en
# log1p(ventas) evita que el modelo optimice casi todo su esfuerzo en
# los pocos valores gigantes a costa del resto de la serie.
LOG_TARGET = True
MODEL_OUT = Path(__file__).resolve().parent / ("modelo_lgb_v2_log.txt" if LOG_TARGET else "modelo_lgb_v2.txt")


def mape(y_true, y_pred, eps=1.0):
    # eps evita dividir por cero en dias sin venta (frecuentes: 25% de las filas)
    return np.mean(np.abs(y_true - y_pred) / np.maximum(y_true, eps)) * 100


def rmse(y_true, y_pred):
    return np.sqrt(np.mean((y_true - y_pred) ** 2))


def main():
    t0 = time.time()
    train = pd.read_parquet(DATASET_DIR / "train_v2.parquet")
    holdout = pd.read_parquet(DATASET_DIR / "holdout_v2.parquet")

    for col in CATEGORICAL_COLUMNS_V2:
        train[col] = train[col].astype("category")
        holdout[col] = pd.Categorical(holdout[col], categories=train[col].cat.categories)

    X_train, y_train = train[MODEL_COLUMNS_V2], train["target"]
    X_holdout, y_holdout = holdout[MODEL_COLUMNS_V2], holdout["target"]

    y_train_fit = np.log1p(y_train) if LOG_TARGET else y_train
    y_holdout_fit = np.log1p(y_holdout) if LOG_TARGET else y_holdout

    print(f"Entrenando LightGBM sobre {len(X_train):,} filas, {len(MODEL_COLUMNS_V2)} features "
          f"(target: {'log1p(ventas)' if LOG_TARGET else 'ventas'})...")
    ds_train = lgb.Dataset(X_train, label=y_train_fit, categorical_feature=CATEGORICAL_COLUMNS_V2)
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

    evals = {}
    modelo = lgb.train(
        params,
        ds_train,
        num_boost_round=5000,
        valid_sets=[ds_train, ds_valid],
        valid_names=["train", "holdout"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=150, verbose=False),
            lgb.record_evaluation(evals),
        ],
    )

    print(f"Entrenamiento listo en {time.time()-t0:.1f}s — mejor iteracion: {modelo.best_iteration}")
    metric_key = next(iter(evals["train"]))
    print(f"MAE train: {evals['train'][metric_key][modelo.best_iteration-1]:.3f}")
    print(f"MAE holdout: {evals['holdout'][metric_key][modelo.best_iteration-1]:.3f}")

    pred = modelo.predict(X_holdout, num_iteration=modelo.best_iteration)
    if LOG_TARGET:
        pred = np.expm1(pred)
    pred = np.clip(pred, 0, None)

    print()
    print("=== Evaluacion sobre holdout real (15 dias que el modelo nunca vio) ===")
    print(f"MAPE modelo LightGBM V2: {mape(y_holdout.values, pred):.2f}%")
    print(f"RMSE modelo LightGBM V2: {rmse(y_holdout.values, pred):.2f}")

    # Linea base: lo que ya hace el fallback actual de la app (promedio
    # movil de 7 dias, ver ml-service/app/services/predictor.py::heuristica)
    baseline_pred = holdout["rolling_mean_7"].values
    print()
    print("=== Linea base: heuristica actual de la app (promedio movil 7d) ===")
    print(f"MAPE heuristica: {mape(y_holdout.values, baseline_pred):.2f}%")
    print(f"RMSE heuristica: {rmse(y_holdout.values, baseline_pred):.2f}")

    mejora = mape(y_holdout.values, baseline_pred) - mape(y_holdout.values, pred)
    print()
    print(f"=> El modelo mejora el MAPE en {mejora:.2f} puntos porcentuales sobre la heuristica" if mejora > 0
          else f"=> El modelo NO mejora la heuristica ({mejora:.2f} pts) - revisar features/hparams")

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
