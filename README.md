# Plataforma Inteligente de Gestión de Inventarios para PYMES

Sistema web para la administración de inventarios de pequeñas y medianas empresas, con un asistente conversacional impulsado por IA (Ollama + tool calling) y un motor de Machine Learning (varios modelos LightGBM en cascada, con fallback a Random Forest y heurística) para predicción de demanda.

---

# Características principales

- Autenticación mediante JWT, con verificación de correo al registrarse y recuperación de contraseña por código (ambos vía correo electrónico).
- Gestión de PYMES, cada una con múltiples sedes. Un miembro invitado puede abandonar una PYME por su cuenta cuando quiera, sin depender del dueño; editar o eliminar una PYME es exclusivo del dueño (`OWNER`) — los demás roles ven su propio rol en vez de esos controles.
- Equipo y roles: invitá miembros por correo, asignales rol (Vendedor, Inventario, Analista, o combinados) y limitá su acceso a una sede específica. Cada rol tiene permisos distintos sobre productos, inventario, ventas y reportes financieros, y además tiene bloqueadas pantallas completas que no le corresponden — no solo funciones puntuales (ver [Roles y permisos](#roles-y-permisos)).
- Mensajería interna entre miembros del equipo (a una persona puntual o a todos los de un rol) y centro de notificaciones (invitaciones, respuestas, mensajes).
- Gestión de productos, con importación y exportación masiva por Excel/CSV.
- Presentación por caja opcional: un producto puede venderse por unidad y por caja a la vez (con su propio código de barras y precio), manteniendo **un solo stock en unidad base** — vender una caja descuenta `unidades por caja` del inventario, sin productos duplicados ni stock fantasma (ver [Presentaciones: unidad y caja](#presentaciones-unidad-y-caja)).
- Gestión de inventario, con alertas de stock bajo y tablero de reposición ordenado por urgencia.
- Registro de ventas, con cálculo automático de vuelto a partir de con cuánto pagó el cliente — la venta no se puede confirmar si el monto pagado no alcanza para cubrir el total.
- Asistente conversacional con IA para consultar el negocio en lenguaje natural: stock, ventas, rentabilidad, rankings, reordenes, resumen y predicciones.
- Predicción automática de demanda mediante IA.
- Dashboard con indicadores.
- Despliegue completo mediante Docker.

---

# Arquitectura

```
                React + Vite
              (incluye Asistente IA)
                      │
                      ▼
             Backend (Node.js)
          Express + Prisma ORM
                      │
        ┌─────────────┼──────────────┐
        ▼             ▼              ▼
     MySQL         Ollama         ML Service
(ai_inventory)   (Qwen3:8B +    FastAPI + Python
                 tool calling)         │
                                       ▼
                             Motor IA (LightGBM)
```

### Tecnologías

| Capa | Tecnología |
|------|------------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| ORM | Prisma |
| Base de datos | MySQL 8 |
| Asistente conversacional | Ollama (Qwen3:8B) + tool calling |
| Predicción de demanda | Python + FastAPI + LightGBM (cascada de modelos, con respaldo a Random Forest y heurística) |
| Contenedores | Docker + Docker Compose |

---

# Estructura del proyecto

```
PymesAPP
│
├── backend/
│
├── frontend/
│
├── ml-service/
│
├── docker-compose.yml
│
├── Dockerfiles
│
└── README.md
```

---

# Flujo de una predicción

```
Usuario
     │
     ▼
Frontend
     │
     ▼
Backend
     │
     ▼
ML Service
     │
     ▼
Motor LightGBM
     │
     ▼
Predicción
```

---

# Flujo de una venta

1. Registrar venta.
2. Actualizar inventario.
3. Guardar histórico.
4. Solicitar nueva predicción.
5. Guardar resultado.
6. Actualizar dashboard.

---

# Presentaciones: unidad y caja

Un mismo producto puede venderse **suelto y por caja** sin crear dos productos ni duplicar el stock.

### Principio

- **Un solo stock, en unidad base** (la unidad más chica). La caja es solo otra forma de vender/comprar.
- El **ticket** conserva lo que pidió el cliente: `1 caja` o `30 unidades`, cada uno con su precio.
- El **inventario, el ranking de unidades vendidas y el espejo al motor de IA** siempre razonan en unidad base: vender 1 caja de 40 descuenta 40 y el modelo registra 40.
- "Cajas disponibles" es un dato **calculado** (`stock ÷ unidades por caja`), nunca un segundo contador que se pueda desincronizar.

### Cómo se configura

En el formulario de producto (Productos o Inventario), sección **"Venta por caja (opcional)"**:

| Campo | Uso |
|---|---|
| `unidades por caja` | Cuántas unidades base trae una caja (≥ 2). Vacío = el producto solo se vende por unidad. |
| `código de barras de la caja` | Código propio de la caja; al escanearlo el POS agrega la línea como CAJA. No puede chocar con ningún otro código de la PYME. |
| `precio de la caja` | Precio de la presentación en caja (puede tener descuento). Por defecto: precio unitario × unidades. |
| `costo de la caja` | Costo de la caja. Por defecto: costo unitario × unidades. |

Los tres casos posibles:

1. **Solo por unidad** — no se completan los campos de caja (comportamiento por defecto de siempre).
2. **Por unidad y por caja** — se completan; el POS ofrece elegir presentación y el escáner distingue por código.
3. **Solo por caja** (six-pack indivisible) — se registra la caja/six-pack *como si fuera la unidad*, sin campos de caja.

### En la base de datos

- `producto`: `unidadesPorCaja`, `codigoCaja`, `precioCaja`, `costoCaja` (todos opcionales).
- `venta`: `presentacion` (`UNIDAD` | `CAJA`) y `factorPresentacion` (1 para unidad, `unidadesPorCaja` para caja). Unidades base de una línea = `cantidad × factorPresentacion`. Las ventas previas a esta funcionalidad quedan como `UNIDAD` / factor 1 sin migración de datos.

---

# Asistente conversacional (IA)

El backend expone un asistente de chat (`POST /api/chat`, `DELETE /api/chat/historial`) integrado en el frontend como un widget flotante disponible en cualquier pantalla autenticada.

### Cómo funciona

- Corre sobre **Ollama**, autoalojado, usando el modelo **Qwen3:8B**.
- El backend se comunica con Ollama mediante su endpoint compatible con OpenAI (`/v1/chat/completions`) usando **tool calling**: el modelo decide qué herramienta ejecutar según el mensaje del usuario.
- Cada herramienta consulta datos **reales** en MySQL (vía Prisma) — nunca respuestas inventadas por el modelo.
- Mantiene **contexto conversacional**: recuerda el último producto/consulta y resuelve preguntas de seguimiento ("¿y el menos?", "¿y cuánto queda?") sin perder el hilo. Los rankings pueden voltearse (más ↔ menos) dentro del mismo eje (ventas o rentabilidad) de forma determinista, sin volver a invocar al modelo cuando la continuación es inequívoca.

### Herramientas disponibles

| Herramienta | Qué responde |
|---|---|
| `consultar_stock` | Stock actual de un producto |
| `info_producto` | Ficha completa de un producto (precio, costo, margen, proveedor, stock) |
| `consultar_ventas_producto` | Historial de ventas de un producto |
| `producto_mas_vendido` / `producto_menos_vendido` | Ranking global de productos por unidades vendidas |
| `producto_mas_rentable` / `producto_menos_rentable` | Ranking global de productos por margen real (precio − costo) |
| `alertas_stock` | Productos con stock por debajo del mínimo |
| `sugerir_reorden` | Cantidades sugeridas de compra |
| `predecir_demanda` | Predicción de demanda de un producto (usa el motor LightGBM) |
| `resumen_dashboard` | Ingresos, margen, alertas de stock y rankings del negocio |

---

# Motor de predicción de demanda

El motor prueba varios modelos en cascada por cada predicción, del más específico al más genérico. Ningún paso bloquea el flujo: si uno falla o no aplica, cae automáticamente al siguiente.

1. **Store Sales V2 / PFS dos etapas** (LightGBM, entrenados con datasets de Kaggle re-escalados a LatAm — Store Sales Ecuador y Predict Future Sales). Es el primer intento: PFS dos etapas si el producto tiene suficiente historial propio (mejor para evitar quiebres de stock), si no Store Sales V2 (mejor exactitud con poco historial). Detalle completo del reentrenamiento, datasets y métricas en [`ml-service/retrain/RESULTADOS.md`](ml-service/retrain/RESULTADOS.md).
2. **Motor LightGBM vendorizado (`IA_INVENTARIO`)**, entrenado originalmente sobre el dataset **M5 Forecasting**. Se mantiene como respaldo cuando no hay historial suficiente para el paso 1 — requiere que el producto/tienda existan en el esquema del motor IA y al menos 28 días de historial diario.
3. **Random Forest** entrenado con datos propios (si el archivo del modelo existe).
4. **Heurística** (promedio móvil), cuando no hay datos suficientes para ningún modelo.

El motor usa histórico de ventas, medias móviles, lags, variaciones de precio, calendario y variables temporales, según el modelo. `backend/src/lib/iaSync.js` espeja cada venta real hacia el esquema que leen estos modelos, así que se alimentan de datos reales de la PYME (categoría, precio) además del historial de ventas.

Actualmente el motor se encuentra integrado al botón **Generar Predicción** de la aplicación y a la herramienta `predecir_demanda` del asistente conversacional.

---

# Base de datos

El proyecto utiliza una única base MySQL llamada:

```
ai_inventory
```

En ella conviven dos esquemas independientes:

### Aplicación

- User (incluye código y expiración de verificación de correo / recuperación de contraseña)
- Pyme
- Sede
- PymeMembresia / PymeMembresiaRol (equipo, roles, invitaciones por sede)
- Producto (incluye presentación por caja opcional: `unidadesPorCaja`, `codigoCaja`, `precioCaja`, `costoCaja`)
- Inventario (stock único en unidad base)
- Venta (`presentacion` UNIDAD/CAJA + `factorPresentacion`)
- Prediccion
- Mensaje (mensajería interna, personal o por rol)

### Motor IA

- productos
- bodegas
- ventas
- precios
- calendario
- inventario_actual
- compras

Esto permite mantener desacoplada la lógica del backend y la del motor de IA.

---

# Roles y permisos

Cada miembro de una PYME tiene un rol (o varios combinados) que determina qué puede hacer. El dueño (`OWNER`) tiene acceso total; los demás roles son acumulables — un miembro puede ser, por ejemplo, Vendedor + Analista a la vez.

| Rol | Productos | Inventario | Ventas | Costo del producto | Reportes financieros | Ver predicciones | Generar predicciones | Equipo / sedes |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Dueño (OWNER)** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Vendedor** | — | — | ✅ | — | — | — | — | — |
| **Inventario** | ✅ | ✅ | — | ✅ | — | — | — | — |
| **Analista** | — | — | — | ✅ | ✅ | ✅ | — | — |

El acceso a cada rol puede además limitarse a una sede específica dentro de la PYME.

Además de estos permisos por función, cada rol tiene **pantallas completas bloqueadas** (no solo botones o campos puntuales — la pantalla ni siquiera se muestra en el menú, y el backend rechaza el acceso directo por URL):

| Rol | Dashboard | Inventario | Ventas | Predicción |
|---|:---:|:---:|:---:|:---:|
| **Dueño (OWNER)** | ✅ | ✅ | ✅ | ✅ |
| **Vendedor** | — | — | ✅ | — |
| **Inventario** | — | ✅ | — | — |
| **Analista** | ✅ | ✅ | ✅ | ✅ |

La idea es que Ventas sea la única pantalla protagonista para un Vendedor, e Inventario la única para el rol Inventario — sin secciones de solo lectura que no les aportan nada.

---

# Docker

Todo el sistema puede ejecutarse mediante Docker Compose.

### Servicios

| Servicio | Origen | Puerto host (default) |
|---|---|---|
| mysql | `mysql:8.0` | 3307 → 3306 |
| ollama | `ollama/ollama` | 11434 |
| backend | `./backend` | 4000 |
| ml-service | `./ml-service` | 8000 |
| frontend | `./frontend` | 8080 |

El servicio `ollama` está configurado para usar **GPU NVIDIA** (`deploy.resources.reservations.devices`, `driver: nvidia`) cuando el host dispone de **NVIDIA Container Toolkit**. En Docker Desktop (Windows/Mac) con soporte GPU habilitado funciona sin pasos adicionales; en Linux es necesario tener el toolkit instalado.

Primer despliegue:

```bash
docker compose up -d --build
```

Al iniciar: el contenedor `ollama` descarga el modelo `qwen3:8b` (una sola vez; se conserva en el volumen `ollama_data` entre reinicios), y el contenedor `backend` aplica el esquema de Prisma y siembra datos de ejemplo automáticamente (`npx prisma db push && npm run seed`) antes de arrancar. No se requieren pasos manuales adicionales.

---

# Desarrollo local

## Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Backend

```bash
cd backend
npm install
npm run dev
```

Variables de entorno relevantes para el asistente conversacional (`backend/.env`):

| Variable | Default | Uso |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | Único proveedor soportado actualmente |
| `OLLAMA_URL` | `http://ollama:11434/v1` | Endpoint de Ollama (compatible OpenAI). Fuera de Docker usar `http://localhost:11434/v1` |
| `OLLAMA_MODEL` | `qwen2.5:3b` | En Docker Compose se sobreescribe a `qwen3:8b` |

Para desarrollo local fuera de Docker se necesita una instancia de Ollama corriendo con el modelo correspondiente ya descargado (`ollama pull qwen3:8b`).

Variables para el envío de correos (verificación de cuenta y recuperación de contraseña), vía Gmail SMTP:

| Variable | Uso |
|---|---|
| `GMAIL_USER` | Cuenta de Gmail que envía los correos |
| `GMAIL_APP_PASSWORD` | [App Password](https://myaccount.google.com/apppasswords) de esa cuenta (no la contraseña normal) |

El servicio `backend` en `docker-compose.yml` las toma de un `.env` en la **raíz** del proyecto (distinto del `backend/.env` de desarrollo local) — creá ese archivo con las mismas dos variables antes de levantar Docker.

---

## ML Service

```bash
cd ml-service

python -m venv .venv

pip install -r requirements.txt

uvicorn app.main:app --reload
```

> `requirements.txt` instala el motor vendorizado en modo editable desde una ruta local fija (`-e file:///C:/Users/USER/Desktop/IA_INVENTARIO`), pensada solo para este equipo de desarrollo — en cualquier otra máquina esa línea va a fallar. Docker no tiene este problema: usa `requirements.docker.txt`, que instala la copia vendorizada dentro del propio repo (`vendor/ia-inventario/`). Para desarrollar en otra máquina sin Docker, hay que apuntar esa línea a una ruta local válida o instalar `./vendor/ia-inventario` en su lugar.

---

# Estado actual del proyecto

## Completado

- Autenticación con verificación de correo al registrarse y recuperación de contraseña por código.
- Gestión de PYMES multi-sede, con salida voluntaria de un miembro invitado sin depender del dueño.
- Equipo: invitaciones, roles combinables (Vendedor / Inventario / Analista) y permisos por sede.
- Restricción de pantallas completas por rol (Dashboard / Inventario / Ventas / Predicción), no solo de funciones puntuales — bloqueada también del lado del backend, no solo escondida en el menú.
- Mensajería interna (personal o por rol) y centro de notificaciones.
- Gestión de productos, con importación/exportación por Excel/CSV.
- Presentación por caja opcional por producto (unidad + caja), con stock único en unidad base y sin productos duplicados (ver [Presentaciones: unidad y caja](#presentaciones-unidad-y-caja)).
- Inventario, con alertas de stock y tablero de reposición por urgencia.
- Registro de ventas, con cálculo de vuelto y bloqueo si el pago no alcanza.
- Dashboard.
- Perfil de usuario editable.
- Asistente conversacional con IA (Ollama + Qwen3:8B + tool calling) para stock, ventas, rentabilidad, rankings, reordenes, resumen y predicciones.
- Integración Backend ↔ IA: sincronización automática (best-effort) de cada venta registrada hacia el esquema del motor de IA, además de la integración de predicción.
- Reentrenamiento del motor de predicción con datasets reescalados a LatAm (Store Sales Ecuador + Predict Future Sales), integrado como primera prioridad delante del motor vendorizado M5 (ver [Motor de predicción de demanda](#motor-de-predicción-de-demanda)).
- Integración MySQL.
- Despliegue mediante Docker (incluye Ollama con soporte GPU).
- Predicción desde la interfaz web.

---

# Trabajo futuro

- Seguir mejorando la precisión del modelo con histórico real y propio de las PYMES que usen la app (sigue siendo la mejora de fondo más importante — ver conclusión en [`ml-service/retrain/RESULTADOS.md`](ml-service/retrain/RESULTADOS.md)).
- Feriados y promociones reales de Latam para el modelo Store Sales V2 (hoy quedan con placeholder neutro, no hay tabla poblada en el esquema real).
- Reportes avanzados y analítica de negocio.
- Tests automatizados para el resto del backend (hoy solo hay pruebas puntuales del asistente de chat, sin `npm test` configurado).

---

# Requisitos

- Docker Desktop
- Git
- (Opcional) GPU NVIDIA + NVIDIA Container Toolkit, para acelerar Qwen3:8B en Ollama

o, para desarrollo:

- Node.js 18+
- Python 3.10+
- MySQL 8+
- Ollama instalado localmente con el modelo configurado, para el asistente conversacional
- (Opcional) Cuenta de Gmail con [App Password](https://myaccount.google.com/apppasswords), para que funcionen la verificación de correo y la recuperación de contraseña

---

# Autores

Adriano Aragon, Santiago Perez, Pablo Arrieta, Ney Salazar

Sistema Inteligente para Gestión y Predicción de Inventarios en PYMES utilizando Machine Learning.
