"""
Arma el dataset de entrenamiento a partir de Predict Future Sales (1C),
a nivel producto individual (item_id) x tienda (shop_id) x dia.

sales_train.csv es a nivel transaccion — primero se agrega a nivel dia,
despues se rellena con 0 los dias sin venta (informacion real: "no vendio
ese dia", no un dato faltante) SOLO para las series (tienda, producto)
con actividad suficiente como para tener una serie de demanda que valga
la pena modelar.
"""
import time
from pathlib import Path

import numpy as np
import pandas as pd

from columns_pfs import MODEL_COLUMNS_PFS

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "predict-future-sales"
OUT_DIR = Path(__file__).resolve().parent / "dataset"
OUT_DIR.mkdir(exist_ok=True)

LAGS = [1, 7, 14, 28]
ROLLING_WINDOWS = [7, 14, 28]
ROLLING_STD_WINDOWS = [7, 28]
HOLDOUT_DAYS = 15

# Sin esto, rellenar a diario cada combinacion (tienda, producto) da ~1.3M
# series x ~1000 dias = mas de mil millones de filas, la mayoria ceros sin
# informacion util. Nos quedamos con las series que realmente tienen
# suficiente actividad para que un lag/rolling signifique algo.
MIN_TRANSACCIONES = 60


def main():
    t0 = time.time()
    print("Cargando CSVs...")
    sales = pd.read_csv(DATA_DIR / "sales_train.csv", parse_dates=["date"], dayfirst=True)
    items = pd.read_csv(DATA_DIR / "items.csv")
    print(f"  sales_train.csv: {len(sales):,} filas (transaccion)")

    print("Agregando a nivel dia (tienda, producto, fecha)...")
    daily = (
        sales.groupby(["date", "shop_id", "item_id"], as_index=False)
        .agg(sales_qty=("item_cnt_day", "sum"), price=("item_price", "mean"))
    )
    daily["sales_qty"] = daily["sales_qty"].clip(lower=0)  # dias netos negativos (solo devoluciones) -> 0

    print(f"Filtrando series con al menos {MIN_TRANSACCIONES} transacciones en todo el periodo...")
    conteo = daily.groupby(["shop_id", "item_id"]).size()
    series_validas = conteo[conteo >= MIN_TRANSACCIONES].index
    print(f"  series (tienda,producto) validas: {len(series_validas):,} de {conteo.shape[0]:,} totales")

    daily = daily.set_index(["shop_id", "item_id"]).loc[list(series_validas)].reset_index()

    print("Rellenando dias sin venta con 0 (por serie)...")
    fecha_min, fecha_max = sales.date.min(), sales.date.max()
    calendario = pd.date_range(fecha_min, fecha_max, freq="D")

    piezas = []
    for (shop_id, item_id), g in daily.groupby(["shop_id", "item_id"]):
        g = g.set_index("date").reindex(calendario)
        g["shop_id"] = shop_id
        g["item_id"] = item_id
        g["sales_qty"] = g["sales_qty"].fillna(0.0)
        g["price"] = g["price"].ffill().bfill()
        piezas.append(g.reset_index().rename(columns={"index": "date"}))
    df = pd.concat(piezas, ignore_index=True)
    print(f"  filas tras rellenar calendario: {len(df):,}")

    print("Uniendo categoria de producto...")
    df = df.merge(items[["item_id", "item_category_id"]], on="item_id", how="left")

    print("Variables de calendario...")
    df["weekday"] = df["date"].dt.day_name()
    df["wday"] = df["date"].dt.weekday + 1
    df["month"] = df["date"].dt.month
    df["year"] = df["date"].dt.year
    df["is_weekend"] = (df["date"].dt.weekday >= 5).astype(int)

    print("Lags, rolling stats y precio por serie...")
    df.sort_values(["shop_id", "item_id", "date"], inplace=True)
    grp = df.groupby(["shop_id", "item_id"])["sales_qty"]

    for lag in LAGS:
        df[f"lag_{lag}"] = grp.shift(lag)
    for w in ROLLING_WINDOWS:
        df[f"rolling_mean_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).mean())
    for w in ROLLING_STD_WINDOWS:
        df[f"rolling_std_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).std())

    df["price_change"] = df.groupby(["shop_id", "item_id"])["price"].diff().fillna(0.0)

    df["target"] = df["sales_qty"]

    antes = len(df)
    df.dropna(subset=[f"lag_{max(LAGS)}", f"rolling_mean_{max(ROLLING_WINDOWS)}"], inplace=True)
    print(f"  filas descartadas por no tener {max(LAGS)} dias de historial previo: {antes - len(df):,}")

    cols = MODEL_COLUMNS_PFS + ["target", "date"]
    df = df[cols]

    corte = df["date"].max() - pd.Timedelta(days=HOLDOUT_DAYS)
    train_df = df[df["date"] <= corte]
    holdout_df = df[df["date"] > corte]

    train_df.to_parquet(OUT_DIR / "train_pfs.parquet", index=False)
    holdout_df.to_parquet(OUT_DIR / "holdout_pfs.parquet", index=False)

    print()
    print(f"Train: {len(train_df):,} filas ({train_df.date.min().date()} -> {train_df.date.max().date()})")
    print(f"Holdout: {len(holdout_df):,} filas ({holdout_df.date.min().date()} -> {holdout_df.date.max().date()})")
    print(f"% dias con venta > 0 en train: {(train_df.target > 0).mean()*100:.1f}%")
    print(f"Listo en {time.time()-t0:.1f}s -> {OUT_DIR}")


if __name__ == "__main__":
    main()
