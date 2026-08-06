# Servicio de Machine Learning

API de predicción de demanda con **Random Forest** (scikit-learn) servida
con FastAPI. El backend de Node la consume en `POST /predict`.

## Endpoints

| Método | Ruta      | Descripción                                              |
| ------ | --------- | -------------------------------------------------------- |
| GET    | `/health` | Estado del servicio                                      |
| POST   | `/predict`| Recibe `{ "historical": [...] }` y devuelve la predicción |

### Ejemplo `/predict`

```json
{
  "historical": [
    { "fecha": "2026-06-01", "cantidad": 12, "precioUnitario": 4500, "costoUnitario": 3200 },
    { "fecha": "2026-06-02", "cantidad": 9,  "precioUnitario": 4500, "costoUnitario": 3200 }
  ]
}
```

Respuesta:

```json
{
  "demandaPredicha": 64,
  "nivelConfianza": 0.42,
  "metodo": "ml_random_forest"
}
```

Si aún no hay modelo entrenado o hay pocos datos, devuelve una estimación
por heurística (`metodo: "heuristica"` o `"fallback"`) para no bloquear
el flujo de ventas.

## Entrenar el modelo

Sin datos reales puedes generar un dataset de prueba:

```bash
python scripts/generate_data.py --dias 365 --productos 5 --out data/raw/ventas_demo.csv
```

Con tu CSV real (columnas: `fecha,producto_id,cantidad,precio_unitario,costo_unitario`):

```bash
python -m app.models.trainer --data data/raw/ventas.csv --out app/models/demanda_rf.joblib
```

> El modelo se entrena **por producto**. El paso siguiente es agregar una
> columna de `producto_id` al endpoint y mantener un modelo por producto,
> o entrenar un modelo multiclase con el producto como feature.

## Ejecutar

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Variables de entorno (`.env`)

| Variable            | Default                          |
| ------------------- | -------------------------------- |
| `PORT`              | `8000`                           |
| `MODEL_PATH`        | `app/models/demanda_rf.joblib`   |
| `MIN_VENTAS_PARA_ML`| `5`                              |
| `HORIZONTE_DIAS`    | `7`                              |
