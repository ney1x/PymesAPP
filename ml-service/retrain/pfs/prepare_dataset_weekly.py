"""
Version semanal del dataset PFS: agrega item_cnt_day a nivel semana en vez
de dia, para reducir el ruido de ceros que domina la version diaria (90%
de los dias sin venta por producto individual).
"""
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

from columns_pfs_weekly import MODEL_COLUMNS_PFS_WEEKLY

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "predict-future-sales"
OUT_DIR = Path(__file__).resolve().parent / "dataset"
OUT_DIR.mkdir(exist_ok=True)

LAGS = [1, 2, 4, 8]
ROLLING_WINDOWS = [4, 8, 12]
ROLLING_STD_WINDOWS = [4, 12]
HOLDOUT_WEEKS = 8
MIN_TRANSACCIONES = int(sys.argv[1]) if len(sys.argv) > 1 else 60


def main():
    t0 = time.time()
    print("Cargando CSVs...")
    sales = pd.read_csv(DATA_DIR / "sales_train.csv", parse_dates=["date"], dayfirst=True)
    items = pd.read_csv(DATA_DIR / "items.csv")

    sales["week"] = sales["date"].dt.to_period("W-SUN").dt.start_time

    print(f"Filtrando series con al menos {MIN_TRANSACCIONES} transacciones (mismo criterio que la version diaria)...")
    conteo = sales.groupby(["shop_id", "item_id"]).size()
    series_validas = conteo[conteo >= MIN_TRANSACCIONES].index
    sales = sales.set_index(["shop_id", "item_id"]).loc[list(series_validas)].reset_index()
    print(f"  series validas: {len(series_validas):,}")

    print("Agregando a nivel semana (lunes de cada semana como fecha)...")
    weekly = (
        sales.groupby(["week", "shop_id", "item_id"], as_index=False)
        .agg(sales_qty=("item_cnt_day", "sum"), price=("item_price", "mean"))
    )
    weekly["sales_qty"] = weekly["sales_qty"].clip(lower=0)

    print("Rellenando semanas sin venta con 0 (por serie)...")
    semana_min, semana_max = weekly.week.min(), weekly.week.max()
    calendario = pd.date_range(semana_min, semana_max, freq="W-MON")

    piezas = []
    for (shop_id, item_id), g in weekly.groupby(["shop_id", "item_id"]):
        g = g.set_index("week").reindex(calendario)
        g["shop_id"] = shop_id
        g["item_id"] = item_id
        g["sales_qty"] = g["sales_qty"].fillna(0.0)
        g["price"] = g["price"].ffill().bfill()
        piezas.append(g.reset_index().rename(columns={"index": "week"}))
    df = pd.concat(piezas, ignore_index=True)
    print(f"  filas tras rellenar calendario semanal: {len(df):,}")

    df = df.merge(items[["item_id", "item_category_id"]], on="item_id", how="left")

    df["week_of_year"] = df["week"].dt.isocalendar().week.astype(int)
    df["month"] = df["week"].dt.month
    df["year"] = df["week"].dt.year

    print("Lags, rolling stats y precio por serie (en semanas)...")
    df.sort_values(["shop_id", "item_id", "week"], inplace=True)
    grp = df.groupby(["shop_id", "item_id"])["sales_qty"]

    for lag in LAGS:
        df[f"lag_{lag}"] = grp.shift(lag)
    for w in ROLLING_WINDOWS:
        df[f"rolling_mean_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).mean())
    for w in ROLLING_STD_WINDOWS:
        df[f"rolling_std_{w}"] = grp.transform(lambda s: s.shift(1).rolling(w).std())

    df["price_change"] = df.groupby(["shop_id", "item_id"])["price"].diff().fillna(0.0)

    print("Popularidad global de producto y tienda (promedio semanal en train)...")
    corte_train = df["week"].max() - pd.Timedelta(weeks=HOLDOUT_WEEKS)
    solo_train = df[df["week"] <= corte_train]
    item_avg = solo_train.groupby("item_id")["sales_qty"].mean().rename("item_avg_weekly")
    shop_avg = solo_train.groupby("shop_id")["sales_qty"].mean().rename("shop_avg_weekly")
    df = df.merge(item_avg, on="item_id", how="left").merge(shop_avg, on="shop_id", how="left")

    print("Semanas desde la ultima venta (senal clave para demanda intermitente)...")
    tuvo_venta = df["sales_qty"].shift(1) > 0
    # id que cambia cada vez que hay una venta -> contar filas desde ese cambio
    grupo_id = df.groupby(["shop_id", "item_id"])
    df["_marca"] = tuvo_venta.groupby([df["shop_id"], df["item_id"]]).cumsum()
    df["weeks_since_last_sale"] = df.groupby(["shop_id", "item_id", "_marca"]).cumcount()
    df.loc[df["_marca"] == 0, "weeks_since_last_sale"] = 99  # nunca vendio antes en la ventana visible
    df.drop(columns=["_marca"], inplace=True)

    df["target"] = df["sales_qty"]

    antes = len(df)
    df.dropna(subset=[f"lag_{max(LAGS)}", f"rolling_mean_{max(ROLLING_WINDOWS)}"], inplace=True)
    print(f"  filas descartadas por no tener {max(LAGS)} semanas de historial previo: {antes - len(df):,}")

    cols = MODEL_COLUMNS_PFS_WEEKLY + ["target", "week"]
    df = df[cols]

    corte = df["week"].max() - pd.Timedelta(weeks=HOLDOUT_WEEKS)
    train_df = df[df["week"] <= corte]
    holdout_df = df[df["week"] > corte]

    sufijo = f"_min{MIN_TRANSACCIONES}"
    train_df.to_parquet(OUT_DIR / f"train_pfs_weekly{sufijo}.parquet", index=False)
    holdout_df.to_parquet(OUT_DIR / f"holdout_pfs_weekly{sufijo}.parquet", index=False)

    print()
    print(f"Train: {len(train_df):,} filas ({train_df.week.min().date()} -> {train_df.week.max().date()})")
    print(f"Holdout: {len(holdout_df):,} filas ({holdout_df.week.min().date()} -> {holdout_df.week.max().date()})")
    print(f"% semanas con venta > 0 en train: {(train_df.target > 0).mean()*100:.1f}%")
    print(f"Listo en {time.time()-t0:.1f}s -> {OUT_DIR}")


if __name__ == "__main__":
    main()
