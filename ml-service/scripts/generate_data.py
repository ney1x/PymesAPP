"""Genera un CSV de ventas sintéticas para entrenar y probar el modelo.

Uso:
    python scripts/generate_data.py --dias 365 --productos 5 --out data/raw/ventas_demo.csv
"""

import argparse
import random
from datetime import date, timedelta

import pandas as pd


def generar(dias=365, productos=5):
    filas = []
    random.seed(42)

    perfiles = [
        {"nombre": "Arroz 1kg", "base": 8, "precio": 4500, "costo": 3200},
        {"nombre": "Aceite 1L", "base": 4, "precio": 12500, "costo": 9800},
        {"nombre": "Gaseosa 1.5L", "base": 12, "precio": 6800, "costo": 5100},
        {"nombre": "Panela x5", "base": 3, "precio": 9800, "costo": 7400},
        {"nombre": "Leche 1L", "base": 10, "precio": 4200, "costo": 3000},
    ]

    inicio = date.today() - timedelta(days=dias)

    for p in range(productos):
        perfil = perfiles[p % len(perfiles)]
        # Tendencia + estacionalidad semanal
        for d in range(dias):
            fecha = inicio + timedelta(days=d)
            dia_semana = fecha.weekday()
            estacional = 1.4 if dia_semana in (5, 6) else 0.9
            tendencia = 1 + 0.001 * d
            esperado = perfil["base"] * estacional * tendencia
            cantidades = random.poisson(esperado)
            for _ in range(cantidades):
                filas.append(
                    {
                        "fecha": fecha.isoformat(),
                        "producto_id": p + 1,
                        "producto": perfil["nombre"],
                        "cantidad": random.randint(1, 3),
                        "precio_unitario": perfil["precio"],
                        "costo_unitario": perfil["costo"],
                    }
                )

    return pd.DataFrame(filas)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dias", type=int, default=365)
    parser.add_argument("--productos", type=int, default=5)
    parser.add_argument("--out", default="data/raw/ventas_demo.csv")
    args = parser.parse_args()

    df = generar(args.dias, args.productos)
    df.to_csv(args.out, index=False)
    print(f"Generadas {len(df)} ventas en {args.out}")


if __name__ == "__main__":
    main()
