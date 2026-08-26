"""
Modelo de dos etapas para demanda intermitente:
  1) Clasificador: "esta serie (tienda, producto) va a vender esta semana?"
  2) Regresor (Tweedie): "cuanto?", entrenado SOLO sobre semanas con venta real.

Prediccion final = P(venta) > umbral ? prediccion del regresor : 0.
Esto ataca directo el problema encontrado (el regresor solo predice casi
siempre 0 porque el 80% de la serie es cero) separando "va a vender" de
"cuanto" en dos decisiones distintas.
"""
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from columns_pfs_weekly import MODEL_COLUMNS_PFS_WEEKLY, CATEGORICAL_COLUMNS_PFS_WEEKLY

DATASET_DIR = Path(__file__).resolve().parent / "dataset"
SUFIJO = f"_min{sys.argv[1]}" if len(sys.argv) > 1 else "_min60"


def mape(y_true, y_pred, eps=1.0):
    return np.mean(np.abs(y_true - y_pred) / np.maximum(y_true, eps)) * 100


def main():
    t0 = time.time()
    train = pd.read_parquet(DATASET_DIR / f"train_pfs_weekly{SUFIJO}.parquet")
    holdout = pd.read_parquet(DATASET_DIR / f"holdout_pfs_weekly{SUFIJO}.parquet")

    for col in CATEGORICAL_COLUMNS_PFS_WEEKLY:
        train[col] = train[col].astype("category")
        holdout[col] = pd.Categorical(holdout[col], categories=train[col].cat.categories)

    X_train = train[MODEL_COLUMNS_PFS_WEEKLY]
    X_holdout = holdout[MODEL_COLUMNS_PFS_WEEKLY]
    y_train, y_holdout = train["target"], holdout["target"]

    # ===== Etapa 1: clasificador (hubo venta esta semana?) =====
    print("Etapa 1/2 — clasificador de 'hubo venta'...")
    y_train_clf = (y_train > 0).astype(int)
    y_holdout_clf = (y_holdout > 0).astype(int)

    ds_train_clf = lgb.Dataset(X_train, label=y_train_clf, categorical_feature=CATEGORICAL_COLUMNS_PFS_WEEKLY)
    ds_valid_clf = lgb.Dataset(X_holdout, label=y_holdout_clf, reference=ds_train_clf)
    params_clf = {
        "objective": "binary",
        "metric": "auc",
        "num_leaves": 63,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_data_in_leaf": 30,
        "verbose": -1,
    }
    clf = lgb.train(
        params_clf, ds_train_clf, num_boost_round=2000,
        valid_sets=[ds_valid_clf], valid_names=["holdout"],
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
    )
    print(f"  AUC holdout: {clf.best_score['holdout']['auc']:.4f}  (mejor_iter={clf.best_iteration})")

    # ===== Etapa 2: regresor (cuanto?), solo sobre semanas CON venta =====
    print("Etapa 2/2 — regresor de cantidad, solo semanas con venta...")
    mask_train_venta = y_train > 0
    ds_train_reg = lgb.Dataset(
        X_train[mask_train_venta], label=y_train[mask_train_venta],
        categorical_feature=CATEGORICAL_COLUMNS_PFS_WEEKLY,
    )
    mask_holdout_venta = y_holdout > 0
    ds_valid_reg = lgb.Dataset(
        X_holdout[mask_holdout_venta], label=y_holdout[mask_holdout_venta], reference=ds_train_reg,
    )
    params_reg = {
        "objective": "tweedie",
        "tweedie_variance_power": 1.2,
        "metric": "mae",
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.8,
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "min_data_in_leaf": 15,
        "verbose": -1,
    }
    reg = lgb.train(
        params_reg, ds_train_reg, num_boost_round=2000,
        valid_sets=[ds_valid_reg], valid_names=["holdout"],
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
    )
    print(f"  mejor_iter regresor: {reg.best_iteration}")
    print(f"Entrenamiento (2 etapas) listo en {time.time()-t0:.1f}s")

    # ===== Combinar: clasificador decide SI, regresor decide CUANTO =====
    p_venta = clf.predict(X_holdout, num_iteration=clf.best_iteration)
    cantidad = np.clip(reg.predict(X_holdout, num_iteration=reg.best_iteration), 0, None)

    y = y_holdout.values
    con_venta = y > 0

    print()
    print("=== Barrido de umbral de decision del clasificador ===")
    for umbral in [0.15]:
        pred = np.where(p_venta > umbral, cantidad, 0.0)
        mape_venta = mape(y[con_venta], pred[con_venta])
        miss = np.mean(pred[con_venta] < 0.5) * 100
        falsos_positivos = np.mean((pred[~con_venta] > 0.5)) * 100
        print(f"  umbral={umbral}  MAPE(venta real)={mape_venta:6.2f}%  miss={miss:5.1f}%  "
              f"falsos positivos={falsos_positivos:5.1f}%")

    print()
    print("(Referencia — modelo de una sola etapa: MAPE=56.40%, miss=31.8%)")

    clf.save_model(str(Path(__file__).resolve().parent / "modelo_clasificador_pfs.txt"))
    reg.save_model(str(Path(__file__).resolve().parent / "modelo_regresor_pfs.txt"))
    print("\nModelos guardados: modelo_clasificador_pfs.txt, modelo_regresor_pfs.txt")


if __name__ == "__main__":
    main()
