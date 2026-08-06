from forecast.engine import forecast


def simular_escenario(
    stock_actual: float,
    product_id: str,
    warehouse_id: str,
    dias: int = 30,
    incremento_demanda: float = 0.0,
    compra_extra: float = 0.0,
    lead_time: int = 0
):
    """
    Simula un escenario de inventario.

    incremento_demanda:
        0.20 = +20%
       -0.10 = -10%

    compra_extra:
        Unidades adicionales recibidas.

    lead_time:
        Días en los que no llega la compra.
    """

    pred = forecast(
        product_id,
        warehouse_id,
        dias
    )

    stock = float(stock_actual)

    historial = []

    compra_recibida = False

    for i, fila in enumerate(pred.iter_rows(named=True), start=1):

        demanda = fila["prediction"]

        demanda *= (1 + incremento_demanda)

        if (
            not compra_recibida
            and i > lead_time
        ):
            stock += compra_extra
            compra_recibida = True

        stock -= demanda

        historial.append({

            "dia": i,

            "fecha": fila["date"],

            "demanda": round(demanda, 2),

            "stock": round(stock, 2),

            "quiebre": stock <= 0

        })

    return historial


if __name__ == "__main__":

    resultado = simular_escenario(

        stock_actual=500,

        product_id="FOODS_1_001",

        warehouse_id="CA_1",

        dias=30,

        incremento_demanda=0.15,

        compra_extra=300,

        lead_time=10

    )

    for fila in resultado:

        print(fila)