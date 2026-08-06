import polars as pl

from utils.config import FORECAST_DAYS

from forecast.history import obtener_historial
from forecast.features import generar_features
from forecast.predictor import predict


# =====================================================
# MOTOR DE PREDICCIÓN RECURSIVO
# =====================================================

def forecast(
    product_id: str,
    warehouse_id: str,
    dias: int = FORECAST_DAYS
) -> pl.DataFrame:

    historial = obtener_historial(
        product_id,
        warehouse_id,
        dias=28
    )

    if historial.is_empty():
        raise ValueError("Producto no encontrado.")

    predicciones = []

    for _ in range(dias):

        # ==========================================
        # Generar features
        # ==========================================

        features = generar_features(historial)

        # ==========================================
        # Predicción
        # ==========================================

        venta = float(
            predict(features)[0]
        )

        if venta < 0:
            venta = 0.0

        # Convertir DataFrame -> diccionario
        fila = features.row(
            0,
            named=True
        )

        predicciones.append({

            "date": fila["date"],
            "prediction": venta

        })

        # ==========================================
        # Actualizar historial
        # ==========================================

        nueva = historial.tail(1).with_columns([

    pl.lit(fila["date"]).alias("date"),

    pl.lit(venta).alias("sales")

])

        historial = pl.concat([

            historial,

            nueva

        ])

        historial = historial.tail(28)

    return pl.DataFrame(predicciones)


# =====================================================
# PRUEBA
# =====================================================

if __name__ == "__main__":

    resultado = forecast(

        product_id="FOODS_1_001",

        warehouse_id="CA_1"

    )

    print(resultado)