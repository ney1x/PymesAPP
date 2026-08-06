from inventario.stock import analizar_stock


def calcular_reorden(
    stock_actual: float,
    product_id: str,
    warehouse_id: str,
    dias_forecast: int = 30,
    lead_time: int = 7,
    stock_seguridad: float = 0,
    objetivo_dias: int = 30
):
    """
    Calcula si debe realizarse una compra y
    cuántas unidades ordenar.
    """

    analisis = analizar_stock(
        stock_actual=stock_actual,
        product_id=product_id,
        warehouse_id=warehouse_id,
        dias=dias_forecast,
        stock_seguridad=stock_seguridad
    )

    demanda_total = analisis["demanda_esperada"]

    demanda_diaria = (
        demanda_total / dias_forecast
        if dias_forecast > 0 else 0
    )

    punto_reorden = (
        demanda_diaria * lead_time
        + stock_seguridad
    )

    comprar = stock_actual <= punto_reorden

    stock_objetivo = (
        demanda_diaria * objetivo_dias
        + stock_seguridad
    )

    cantidad = max(
        0,
        round(stock_objetivo - stock_actual)
    )

    return {

        "comprar": comprar,

        "cantidad": cantidad,

        "punto_reorden": round(
            punto_reorden,
            2
        ),

        "stock_objetivo": round(
            stock_objetivo,
            2
        ),

        "demanda_diaria": round(
            demanda_diaria,
            2
        ),

        "lead_time": lead_time

    }


if __name__ == "__main__":

    resultado = calcular_reorden(

        stock_actual=120,

        product_id="FOODS_1_001",

        warehouse_id="CA_1",

        lead_time=7,

        stock_seguridad=20

    )

    print(resultado)