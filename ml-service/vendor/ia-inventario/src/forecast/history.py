import polars as pl

from db.adapter import obtener_historial as _obtener_historial_db


# =====================================================
# OBTENER HISTORIAL
# =====================================================

def obtener_historial(
    product_id: str,
    warehouse_id: str,
    dias: int = 28
) -> pl.DataFrame:
    """
    Devuelve el historial más reciente
    de un producto en una tienda.
    """

    return _obtener_historial_db(
        product_id,
        warehouse_id,
        dias
    )


# =====================================================
# PRUEBA
# =====================================================

if __name__ == "__main__":

    df = obtener_historial(
        product_id="FOODS_1_001",
        warehouse_id="CA_1",
        dias=28
    )

    print(df)