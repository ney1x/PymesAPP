from forecast.engine import forecast


def analizar_stock(
    stock_actual: float,
    product_id: str,
    warehouse_id: str,
    dias: int = 30,
    stock_seguridad: float = 0
):
    """
    Analiza el estado del inventario usando
    las predicciones de demanda.
    """

    pred = forecast(
        product_id,
        warehouse_id,
        dias
    )

    demanda = float(
        pred["prediction"].sum()
    )

    dias_cobertura = (
        stock_actual /
        (demanda / dias)
        if demanda > 0 else 999
    )

    return {

        "stock_actual": stock_actual,

        "demanda_esperada": round(
            demanda,
            2
        ),

        "dias_cobertura": round(
            dias_cobertura,
            2
        ),

        "stock_seguridad": stock_seguridad,

        "riesgo_quiebre":
            stock_actual < (
                demanda +
                stock_seguridad
            )

    }