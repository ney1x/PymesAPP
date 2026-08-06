"""Feature engineering para series de demanda.

A partir de la serie diaria de unidades vendidas se construyen:
- variables de calendario (día de la semana, mes, día del mes)
- rezagos (lag 1, 2, 3, 7)
- medias móviles (7 y 14 días)
- días desde la última venta
"""

import numpy as np


def build_daily_series(historical, fecha_key="fecha", cantidad_key="cantidad"):
    """Convierte el histórico de ventas en una serie diaria de demanda.

    `historical` es una lista de dicts con al menos `fecha` (ISO) y `cantidad`.
    Los días sin ventas se rellenan con 0.
    """
    if not historical:
        return []

    fechas = {}
    for venta in historical:
        dia = str(venta[fecha_key])[:10]
        fechas[dia] = fechas.get(dia, 0) + int(venta[cantidad_key])

    dias_ordenados = sorted(fechas)
    inicio = dias_ordenados[0]
    from datetime import date, timedelta

    y, m, d = map(int, inicio.split("-"))
    actual = date(y, m, d)
    ultimo = actual

    serie = []
    indice = 0
    while actual <= ultimo or indice < len(dias_ordenados):
        clave = actual.isoformat()
        if clave in fechas:
            serie.append({"fecha": clave, "demanda": fechas[clave]})
            ultimo = actual
            indice += 1
        else:
            serie.append({"fecha": clave, "demanda": 0})
        actual += timedelta(days=1)
        if indice >= len(dias_ordenados) and actual > ultimo:
            break

    return serie


def _calendario(fecha_iso):
    from datetime import date

    y, m, d = map(int, fecha_iso.split("-"))
    f = date(y, m, d)
    return {
        "dia_semana": f.weekday(),
        "dia_mes": f.day,
        "mes": f.month,
    }


def _dias_desde_ultima_venta(serie, i):
    for j in range(i - 1, -1, -1):
        if serie[j]["demanda"] > 0:
            return i - j
    return 30


def make_row(serie, i, lags=(1, 2, 3, 7), ventanas=(7, 14)):
    """Construye el vector de features para el día `i` (para predecir futuro)."""
    demanda = [s["demanda"] for s in serie]
    row = dict(_calendario(serie[i]["fecha"]))

    for lag in lags:
        row[f"lag_{lag}"] = demanda[i - lag] if i - lag >= 0 else 0.0

    for w in ventanas:
        desde = max(0, i - w + 1)
        ventana = demanda[desde : i + 1]
        row[f"media_{w}"] = float(np.mean(ventana)) if ventana else 0.0

    row["dias_sin_venta"] = _dias_desde_ultima_venta(serie, i)

    return row


def build_dataset(serie, horizonte=7, lags=(1, 2, 3, 7), ventanas=(7, 14)):
    """Crea X (features por día) e y (demanda de los próximos `horizonte` días)."""
    X, y = [], []
    demanda = [s["demanda"] for s in serie]
    n = len(serie)

    for i in range(max(lags), n):
        if i + horizonte > n:
            break
        X.append(make_row(serie, i, lags, ventanas))
        y.append(sum(demanda[i : i + horizonte]))

    return X, y


def next_features(serie, lags=(1, 2, 3, 7), ventanas=(7, 14)):
    """Features del siguiente día (el que sigue al último de la serie)."""
    if not serie:
        raise ValueError("Serie vacía")

    from datetime import date, timedelta

    ultima_fecha = serie[-1]["fecha"]
    y, m, d = map(int, ultima_fecha.split("-"))
    proxima = (date(y, m, d) + timedelta(days=1)).isoformat()

    # Completamos con ceros los días que falten al final para que los rezagos
    # apunten siempre al día observado más reciente.
    demanda = [s["demanda"] for s in serie]
    idx = len(demanda) - 1

    row = dict(_calendario(proxima))

    for lag in lags:
        row[f"lag_{lag}"] = demanda[idx - lag + 1] if idx - lag + 1 >= 0 else 0.0

    for w in ventanas:
        desde = max(0, len(demanda) - w)
        ventana = demanda[desde:]
        row[f"media_{w}"] = float(np.mean(ventana)) if ventana else 0.0

    row["dias_sin_venta"] = _dias_desde_ultima_venta(serie, idx)

    return row
