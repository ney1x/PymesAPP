"""Entrenamiento del modelo de predicción de demanda (Random Forest).

Uso:
    python -m app.models.trainer --data data/raw/ventas.csv --out app/models/demanda_rf.joblib

El CSV debe tener las columnas: fecha,producto_id,cantidad,precio_unitario,costo_unitario
"""

import argparse
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import cross_val_score

from .features import build_daily_series, build_dataset

MIN_SAMPLES = 10


def train(ventas_df, horizonte=7):
    """Entrena un RandomForest con las ventas de un producto y devuelve (modelo, métricas)."""
    historico = ventas_df.to_dict("records")
    serie = build_daily_series(historico)

    X, y = build_dataset(serie, horizonte=horizonte)
    if len(X) < MIN_SAMPLES:
        raise ValueError(
            f"Datos insuficientes: se necesitan al menos {MIN_SAMPLES} filas, hay {len(X)}"
        )

    X = pd.DataFrame(X)
    modelo = RandomForestRegressor(
        n_estimators=200,
        max_depth=10,
        random_state=42,
        n_jobs=-1,
    )
    modelo.fit(X, y)

    try:
        r2 = cross_val_score(modelo, X, y, cv=min(5, len(X)), scoring="r2").mean()
    except Exception:
        r2 = float("nan")

    return modelo, {"r2": float(r2), "n_muestras": len(X), "entrenado": datetime.utcnow().isoformat()}


def main():
    parser = argparse.ArgumentParser(description="Entrena el modelo de demanda")
    parser.add_argument("--data", required=True, help="Ruta al CSV de ventas")
    parser.add_argument("--out", default="app/models/demanda_rf.joblib", help="Ruta de salida")
    parser.add_argument("--horizonte", type=int, default=7, help="Días a predecir")
    args = parser.parse_args()

    df = pd.read_csv(args.data, parse_dates=["fecha"])
    modelo, metricas = train(df, horizonte=args.horizonte)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    joblib.dump(
        {
            "modelo": modelo,
            "metricas": metricas,
            "columnas": [
                "dia_semana", "dia_mes", "mes",
                "lag_1", "lag_2", "lag_3", "lag_7",
                "media_7", "media_14", "dias_sin_venta",
            ],
        },
        args.out,
    )

    print(f"Modelo guardado en {args.out}")
    print(f"Métricas: R² = {metricas['r2']:.3f}, muestras = {metricas['n_muestras']}")


if __name__ == "__main__":
    main()
