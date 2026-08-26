# Reentrenamiento del motor de predicción — resultados

Registro del trabajo de reentrenamiento hecho fuera de la app (`ml-service/retrain/`), sin tocar producción todavía. Objetivo original: usar datasets de Kaggle para mejorar las predicciones de demanda de PymesAPP.

## Punto de partida

El modelo LightGBM en producción (`ml-service/vendor/ia-inventario/modelo/modelo_lgb.txt`) estaba **roto**: corrupción de line-endings (CRLF) al clonar en Windows hacía que `lightgbm.Booster` fallara al cargarlo, y la app caía silenciosamente al fallback de Random Forest / heurística sin avisar. Se arregló (ver `.gitattributes`) y se confirmó que el modelo entrenado sí era legítimo (2400 árboles, apoyado 32% en `rolling_mean_7` — patrón sano, no memorización).

Pero el esquema de features del motor (`vendor/ia-inventario/src/utils/columns.py`) está **hardcodeado a M5/Walmart EE.UU.**: `snap_CA/TX/WI`, `wm_yr_wk`, `item_id="FOODS_1_001"`. No aplica a PYMES de Ecuador/LatAm sin reescribir el esquema.

## Experimento 1 — Store Sales (Ecuador), nivel categoría

**Dataset:** [Store Sales - Time Series Forecasting](https://www.kaggle.com/competitions/store-sales-time-series-forecasting) (Kaggle). 3M filas, 2013-2017, 54 tiendas × 33 categorías de producto, feriados y promoción de Ecuador.

**Esquema nuevo:** `columns_v2.py` — sin columnas de EE.UU., con feriados nacional/regional/local reales y señal de promoción.

| Versión | MAPE | RMSE |
|---|---|---|
| Heurística actual (promedio móvil 7d) | 44.54% | 302.78 |
| LightGBM V2 (target normal) | 44.38% | 220.97 |
| **LightGBM V2 (target log1p)** | **32.12%** | **214.54** |

El cambio a `log1p(ventas)` fue el que más impactó (las ventas están muy sesgadas: media 357, máximo 124,717).

**Veredicto: listo para producción** — dato denso, mejora clara y consistente sobre la heurística actual, usa señales que el modelo viejo no tenía (feriados de Ecuador, promoción). **Integrado** (ver sección "Integración a producción" al final).

Archivo: `retrain/modelo_lgb_v2_log.txt`

## Experimento 2 — Predict Future Sales (Rusia, 1C), nivel producto individual

Motivación: Store Sales es a nivel *categoría*, no *producto* — no resuelve el caso real de una PYME con productos específicos. Se buscó un dataset a nivel SKU.

**Dataset:** [Predict Future Sales](https://www.kaggle.com/competitions/competitive-data-science-predict-future-sales) (Kaggle/Coursera). 2.9M transacciones, 21,807 productos, 60 tiendas, con precio real por venta.

### v1 — diario, log1p

Serie diaria por (tienda, producto), mismas features que Store Sales V2. Resultado: **muy disperso** (90% de los días sin venta por producto individual) — la métrica general (6.18% MAPE) era un espejismo inflado por los ceros.

Evaluado **solo en días con venta real** (la métrica que importa):

| | MAPE (solo ventas) | % veces que predijo 0 habiendo venta |
|---|---|---|
| Heurística | 83.73% | — |
| LightGBM diario | 76.30% | 72.2% |

### v2 — semanal, Tweedie, features nuevas

Agregación semanal (menos ruido de ceros: 40.3% de semanas con venta vs 10.4% diario) + objetivo `tweedie` (diseñado para datos zero-inflated) + features `weeks_since_last_sale`, `item_avg_weekly`, `shop_avg_weekly`.

| | MAPE (solo ventas) | Miss rate |
|---|---|---|
| v1 diario | 76.30% | 72.2% |
| Semanal + log1p | 59.88% | 43.6% |
| **Semanal + Tweedie + features** | **56.40%** | **31.8%** |

Se probó bajar el umbral mínimo de actividad por serie (60→20 transacciones) para sumar más productos: **empeoró** (63.69% MAPE, 52.8% miss) — más series con poco historial diluye la señal, no ayuda.

### v3 — modelo de dos etapas (clasificador + regresor)

Técnica estándar para demanda intermitente: separar "¿va a vender esta semana?" (clasificador binario) de "¿cuánto?" (regresor Tweedie, entrenado solo sobre semanas con venta).

- Clasificador: **AUC 0.9051** — separa bien ambas clases.
- Barrido de umbral de decisión (no hay óptimo matemático — es un trade-off de negocio entre miss rate y falsos positivos):

| Umbral | MAPE (solo ventas) | Miss rate | Falsos positivos |
|---|---|---|---|
| 0.02 | 45.87% | 0.4% | 60.6% (demasiado alto) |
| 0.10 | 47.94% | 3.1% | 40.0% |
| **0.15 (elegido)** | **50.62%** | **6.5%** | **32.6%** |
| 0.25 | 58.40% | 16.6% | 21.3% |

Bajar el umbral mejora el MAPE indefinidamente porque el clasificador empieza a decir "sí" a casi todo — no es una mejora real pasado cierto punto, es la métrica dejando de significar lo que importa. **Se eligió 0.15** como balance: reduce los quiebres de stock no anticipados (6.5% de misses, contra 31.8% del modelo de una sola etapa) sin disparar los falsos positivos a niveles inútiles.

**Veredicto: mejor resultado del experimento para evitar quiebres de stock.** **Integrado** como motor de primera prioridad cuando hay suficiente historial propio del producto (ver sección "Integración a producción" al final); sigue habiendo margen de pulido (precio real, categoría real) para más adelante.

Archivos: `retrain/pfs/modelo_clasificador_pfs.txt`, `retrain/pfs/modelo_regresor_pfs.txt`

## Resumen final

| Experimento | Nivel | Mejor resultado | Estado |
|---|---|---|---|
| Store Sales V2 | Categoría | 32.12% MAPE | Listo, no integrado |
| PFS dos etapas (umbral 0.15) | Producto individual | 50.62% MAPE / 6.5% miss (solo semanas con venta) | Mejor resultado, sigue en pulido |

### ¿Cuál rinde mejor? Depende de qué se mida

Los dos MAPE de arriba **no son comparables directamente** — Store Sales V2 se reportó en general (todas las filas); PFS dos etapas se reportó solo en semanas con venta real. Con el mismo criterio (MAPE general, todas las semanas):

| Modelo | MAPE general |
|---|---|
| **Store Sales V2** | **32.12%** |
| PFS dos etapas (umbral 0.15) | 51.16% |
| Heurística de PFS (referencia) | 43.27% |

Con este criterio, **Store Sales V2 gana con claridad**, y el PFS de dos etapas incluso queda peor que su propia heurística simple — el umbral 0.15 se eligió a propósito para minimizar los "no lo vi venir" (misses), aceptando 32.6% de falsos positivos; esos falsos positivos cobran caro quando se mide el promedio general.

**Conclusión honesta:** no hay un "mejor" absoluto, hay dos modelos optimizados para objetivos distintos:
- **Store Sales V2** → mejor exactitud promedio. Elegir si el objetivo es "predecir bien en general".
- **PFS dos etapas** → mejor para no quedarse sin stock (miss rate bajo), a costa de exactitud promedio. Elegir si el objetivo es "nunca perderme una venta real", aceptando sobre-stockear ocasionalmente.

No se pueden ensamblar/combinar numéricamente porque no comparten país, granularidad (diario vs. semanal), esquema de columnas, ni ningún dato en común — cualquier promedio entre sus predicciones sería un número sin significado real. Lo que sí es válido para más adelante es una **regla de decisión por producto** en el motor de inferencia (no un ensemble de modelos): usar el enfoque tipo PFS para productos con suficiente historial propio, y caer al patrón general tipo Store Sales V2 cuando no lo hay. Eso recién se puede probar con datos reales de PYMES.

## Intentos que NO mejoraron (documentados para no repetirlos)

- **Bajar el umbral mínimo de series** (60→20 transacciones): empeoró (63.69% MAPE, 52.8% miss) — más series con poco historial diluye la señal.
- **`price_relative` (precio del producto vs. promedio de su categoría)**: sin efecto (51.07% vs 50.62% MAPE, dentro del ruido) — no aparece ni en el top 8 de importancia del modelo. Probablemente el precio varía poco por producto en este dataset como para que la comparación con la categoría aporte información nueva.
- **`shop_trend` (¿la tienda está creciendo o cayendo en ventas totales, todas las semanas 4 vs. 4 anteriores)**: sin efecto (51.31% vs 50.62% MAPE) — 0.42% de importancia, casi el último feature. El modelo ya captura el comportamiento de cada tienda vía `shop_id` + `shop_avg_weekly`; la tendencia adicional no sumó información nueva.

## Qué queda pendiente

- Más historial real de PYMES usando la app — sigue siendo la mejora de fondo más importante, ningún dataset externo la reemplaza del todo.
- Feriados y promociones reales de Ecuador (Store Sales V2) — no hay tabla poblada para esto en el esquema real, ver sección siguiente.

## Integración a producción

Ambos modelos quedaron conectados en `app/services/predictor.py` con la regla de decisión descrita arriba, como **primer paso** del flujo (antes del motor vendor M5, que sigue existiendo como fallback):

- `len(historial) >= UMBRAL_VENTAS_PFS` (default 60, mismo `MIN_TRANSACCIONES` usado para entrenar y validar PFS) → **PFS dos etapas**.
- Si no, o si no hay al menos 12 semanas de historial para calcular `rolling_std_12` → **Store Sales V2**.
- Si no hay historial en absoluto → cae al motor vendor M5 y de ahí a Random Forest/heurística, igual que antes.

Los `item_id`/`store_id`/`shop_id` reales de la app no coinciden con el vocabulario de Kaggle usado al entrenar — esto no rompe nada porque LightGBM guarda ese vocabulario dentro del `.txt` del modelo y `Booster.predict()` convierte automáticamente cualquier valor no visto a "missing" (tratado igual que un valor faltante real).

`backend/src/lib/iaSync.js` espeja cada venta real hacia el esquema que lee `ia_repository` (`productos`/`bodegas`/`precios`/`ventas`), así que sí hay datos reales disponibles más allá de las ventas: la categoría real del producto (`producto.categoria`, espejada en `productos.cat_id`) alimenta el `item_id`/`item_category_id` de ambos modelos (que en su esquema de entrenamiento representa la categoría, no el SKU), y el precio real (`precios`) alimenta `price`/`price_change` de PFS. Quedan con placeholder neutro (documentado en `app/models/features_v2.py`) solo feriados y promociones de Ecuador — no existe esa tabla poblada en el esquema real hoy.
