"""
Arma el dataset de entrenamiento a partir de los CSV de Store Sales
(Kaggle: store-sales-time-series-forecasting), con el esquema de
columnas V2 (columns_v2.py) — sin columnas de M5/EE.UU.

Uso: python prepare_dataset.py
Salida: dataset/train_v2.parquet, dataset/holdout_v2.parquet
"""
import time
from pathlib import Path

import numpy as np
import pandas as pd

from columns_v2 import MODEL_COLUMNS_V2

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "store-sales"
OUT_DIR = Path(__file__).resolve().parent / "dataset"
OUT_DIR.mkdir(exist_ok=True)

LAGS = [1, 7, 14, 28]
ROLLING_WINDOWS = [7, 14, 28]
ROLLING_STD_WINDOWS = [7, 28]
HOLDOUT_DAYS = 15  # mismo horizonte que test.csv de la competencia


def cargar_feriados():
    """Resuelve holidays_events.csv a un mapa fecha -> (tipo, alcance).
    Reglas del dataset (ver Data Description de Kaggle):
      - transferred=True: el feriado se movió, ese día NO es feriado real.
      - type='Transfer': es el día donde el feriado SÍ se celebra.
      - locale='National' aplica a todo el país; 'Regional' a un estado
        (locale_name = nombre del estado); 'Local' a una ciudad.
    """
    h = pd.read_csv(DATA_DIR / "holidays_events.csv", parse_dates=["date"])
    h = h[~h["transferred"]]  # se descartan los movidos; el 'Transfer' ya cubre el día real
    return h[["date", "type", "locale", "locale_name"]]


def aplicar_feriados(df, feriados):
    nacional = feriados[feriados.locale == "National"][["date", "type"]].rename(
        columns={"type": "type_nat"}
    )
    regional = feriados[feriados.locale == "Regional"][["date", "locale_name", "type"]].rename(
        columns={"locale_name": "state_id", "type": "type_reg"}
    )
    local = feriados[feriados.locale == "Local"][["date", "locale_name", "type"]].rename(
        columns={"locale_name": "city", "type": "type_loc"}
    )

    df = df.merge(nacional.drop_duplicates("date"), on="date", how="left")
    df = df.merge(regional.drop_duplicates(["date", "state_id"]), on=["date", "state_id"], how="left")
    df = df.merge(local.drop_duplicates(["date", "city"]), on=["date", "city"], how="left")

    df["holiday_type"] = df["type_nat"].fillna(df["type_reg"]).fillna(df["type_loc"]).fillna("Ninguno")
    df["is_holiday"] = (df["holiday_type"] != "Ninguno").astype(int)
    df.drop(columns=["type_nat", "type_reg", "type_loc"], inplace=True)
    return df


def main():
    t0 = time.time()
    print("Cargando CSVs...")
    train = pd.read_csv(DATA_DIR / "train.csv", parse_dates=["date"])
    stores = pd.read_csv(DATA_DIR / "stores.csv")
    print(f"  train.csv: {len(train):,} filas | stores.csv: {len(stores)} tiendas")

    print("Agregando por (tienda, categoria, fecha) y uniendo metadata de tienda...")
    df = train.merge(stores, on="store_nbr", how="left")
    df.rename(
        columns={
            "family": "item_id",
            "store_nbr": "store_id",
            "state": "state_id",
            "type": "store_type",
            "cluster": "store_cluster",
        },
        inplace=True,
    )

    print("Aplicando feriados (nacional > regional > local)...")
    feriados = cargar_feriados()
    df = aplicar_feriados(df, feriados)

    print("Variables de calendario...")
    df["weekday"] = df["date"].dt.day_name()
    df["wday"] = df["date"].dt.weekday + 1
    df["month"] = df["date"].dt.month
    df["year"] = df["date"].dt.year
    df["is_weekend"] = (df["date"].dt.weekday >= 5).astype(int)

    print("Lags y rolling stats por serie (tienda, categoria)...")
    df.sort_values(["store_id", "item_id", "date"], inplace=True)
    grp = df.groupby(["store_id", "item_id"])["sales"]

    for lag in LAGS:
        df[f"lag_{lag}"] = grp.shift(lag)

    for w in ROLLING_WINDOWS:
        df[f"rolling_mean_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).mean())

    for w in ROLLING_STD_WINDOWS:
        df[f"rolling_std_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).std())

    print("Target = venta del dia (prediccion a 1 dia, igual que el motor recursivo actual)...")
    df["target"] = df["sales"]

    antes = len(df)
    df.dropna(subset=[f"lag_{max(LAGS)}", f"rolling_mean_{max(ROLLING_WINDOWS)}"], inplace=True)
    print(f"  filas descartadas por no tener {max(LAGS)} dias de historial previo: {antes - len(df):,}")

    cols = MODEL_COLUMNS_V2 + ["target", "date"]
    df = df[cols]

    corte = df["date"].max() - pd.Timedelta(days=HOLDOUT_DAYS)
    train_df = df[df["date"] <= corte]
    holdout_df = df[df["date"] > corte]

    train_df.to_parquet(OUT_DIR / "train_v2.parquet", index=False)
    holdout_df.to_parquet(OUT_DIR / "holdout_v2.parquet", index=False)

    print()
    print(f"Train: {len(train_df):,} filas ({train_df.date.min().date()} -> {train_df.date.max().date()})")
    print(f"Holdout: {len(holdout_df):,} filas ({holdout_df.date.min().date()} -> {holdout_df.date.max().date()})")
    print(f"Listo en {time.time()-t0:.1f}s -> {OUT_DIR}")


if __name__ == "__main__":
    main()
