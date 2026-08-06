from datetime import date

from db.connection import get_cursor


def fetch_producto(item_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT item_id, dept_id, cat_id, nombre, unidad, "
            "lead_time_dias, stock_seguridad "
            "FROM productos WHERE item_id = %s",
            (item_id,),
        )
        return cur.fetchone()


def fetch_bodega(store_id: str) -> dict | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT store_id, state_id, nombre "
            "FROM bodegas WHERE store_id = %s",
            (store_id,),
        )
        return cur.fetchone()


def fetch_ventas(item_id: str, store_id: str, dias: int) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT fecha, unidades FROM ventas "
            "WHERE item_id = %s AND store_id = %s "
            "ORDER BY fecha DESC LIMIT %s",
            (item_id, store_id, dias),
        )
        filas = cur.fetchall()

    filas.reverse()
    for f in filas:
        f["unidades"] = float(f["unidades"])
    return filas


def fetch_precios(item_id: str, store_id: str, fecha_limite: date) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT fecha_inicio, sell_price FROM precios "
            "WHERE item_id = %s AND store_id = %s AND fecha_inicio <= %s "
            "ORDER BY fecha_inicio ASC",
            (item_id, store_id, fecha_limite),
        )
        filas = cur.fetchall()

    for f in filas:
        f["sell_price"] = float(f["sell_price"])
    return filas


def fetch_calendario(fecha_inicio: date, fecha_fin: date) -> list[dict]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT fecha, weekday, month, year, snap, event_name, event_type "
            "FROM calendario WHERE fecha BETWEEN %s AND %s "
            "ORDER BY fecha ASC",
            (fecha_inicio, fecha_fin),
        )
        return cur.fetchall()


def fetch_stock_actual(item_id: str, store_id: str) -> float | None:
    with get_cursor() as cur:
        cur.execute(
            "SELECT stock_actual FROM inventario_actual "
            "WHERE item_id = %s AND store_id = %s",
            (item_id, store_id),
        )
        fila = cur.fetchone()

    return float(fila["stock_actual"]) if fila else None
