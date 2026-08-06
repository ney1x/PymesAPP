import polars as pl

from db import repository

# =====================================================
# ADAPTADOR MySQL -> polars.DataFrame
#
# Unica capa que conoce el esquema de MySQL y el esquema
# que espera el motor de IA (forecast/history.py). El
# resto del core (features.py, predictor.py, engine.py)
# no importa nada de este modulo.
#
# NOTA: item_id/dept_id/cat_id/store_id/state_id fueron
# codificados como enteros arbitrarios de M5 al entrenar
# modelo_lgb.txt (ver generar_dataset.py). Ese mapeo no
# quedo guardado y no es reconstruible. Productos/tiendas
# reales que no existian en M5 no tienen codigo valido:
# el modelo correra sin error pero la prediccion no sera
# confiable. Pendiente: reentrenar con datos reales de
# MySQL una vez existan ventas suficientes.
# =====================================================

_PRECIOS_SCHEMA = {"fecha_inicio": pl.Date, "sell_price": pl.Float64}

_CALENDARIO_SCHEMA = {
    "fecha": pl.Date,
    "weekday": pl.Int64,
    "month": pl.Int64,
    "year": pl.Int64,
    "snap": pl.Int64,
    "event_name": pl.Utf8,
    "event_type": pl.Utf8,
}


def obtener_historial(product_id: str, warehouse_id: str, dias: int = 28) -> pl.DataFrame:
    producto = repository.fetch_producto(product_id)
    bodega = repository.fetch_bodega(warehouse_id)

    if producto is None:
        raise ValueError(f"Producto no encontrado: {product_id}")
    if bodega is None:
        raise ValueError(f"Bodega no encontrada: {warehouse_id}")

    ventas = repository.fetch_ventas(product_id, warehouse_id, dias)
    if not ventas:
        return pl.DataFrame()

    ventas_df = pl.DataFrame(ventas).sort("fecha")

    fecha_min = ventas_df["fecha"].min()
    fecha_max = ventas_df["fecha"].max()

    precios = repository.fetch_precios(product_id, warehouse_id, fecha_max)
    precios_df = (
        pl.DataFrame(precios, schema=_PRECIOS_SCHEMA).sort("fecha_inicio")
        if precios
        else pl.DataFrame(schema=_PRECIOS_SCHEMA)
    )

    calendario = repository.fetch_calendario(fecha_min, fecha_max)
    calendario_df = (
        pl.DataFrame(calendario, schema=_CALENDARIO_SCHEMA).sort("fecha")
        if calendario
        else pl.DataFrame(schema=_CALENDARIO_SCHEMA)
    )

    historial = ventas_df.join_asof(
        precios_df,
        left_on="fecha",
        right_on="fecha_inicio",
        strategy="backward",
    ).join(
        calendario_df,
        on="fecha",
        how="left",
    )

    # item_id/dept_id/cat_id/store_id/state_id/event_name_1/event_type_1 fueron
    # codificados a Int16 arbitrarios de M5 al entrenar (ver generar_dataset.py);
    # ese mapeo no es recuperable. Se usa un mismo codigo constante (0) para que
    # el vector siga siendo numerico (el modelo lo trata como no informativo,
    # la senal real viene de lags/rolling/precio). event_name_2/event_type_2
    # tampoco se completan (M5 casi nunca tiene 2 eventos el mismo dia).
    PLACEHOLDER = pl.lit(0, dtype=pl.Int16)

    historial = historial.with_columns(
        pl.col("sell_price").shift(1).alias("previous_price"),
        pl.col("event_name").is_not_null().cast(pl.Int8).alias("has_event"),
        PLACEHOLDER.alias("event_name_1"),
        PLACEHOLDER.alias("event_type_1"),
        PLACEHOLDER.alias("event_name_2"),
        PLACEHOLDER.alias("event_type_2"),
        pl.col("snap").cast(pl.Int8).alias("snap_CA"),
        pl.col("snap").cast(pl.Int8).alias("snap_TX"),
        pl.col("snap").cast(pl.Int8).alias("snap_WI"),
        pl.col("fecha").dt.strftime("%G%V").cast(pl.Int32).alias("wm_yr_wk"),
        PLACEHOLDER.alias("item_id"),
        PLACEHOLDER.alias("dept_id"),
        PLACEHOLDER.alias("cat_id"),
        PLACEHOLDER.alias("store_id"),
        PLACEHOLDER.alias("state_id"),
        pl.col("fecha").alias("date"),
        pl.col("unidades").alias("sales"),
    )

    return historial.select(
        "item_id",
        "dept_id",
        "cat_id",
        "store_id",
        "state_id",
        "date",
        "sales",
        "sell_price",
        "previous_price",
        "has_event",
        "event_name_1",
        "event_type_1",
        "event_name_2",
        "event_type_2",
        "snap_CA",
        "snap_TX",
        "snap_WI",
        "wm_yr_wk",
    )
