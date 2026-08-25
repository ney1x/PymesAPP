# Plataforma Inteligente de Gestión de Inventarios para PYMES

Sistema web para la administración de inventarios de pequeñas y medianas empresas, con un asistente conversacional impulsado por IA (Ollama + tool calling) y un motor de Machine Learning (LightGBM) para predicción de demanda.

---

# Características principales

- Autenticación mediante JWT, con verificación de correo al registrarse y recuperación de contraseña por código (ambos vía correo electrónico).
- Gestión de PYMES, cada una con múltiples sedes.
- Equipo y roles: invitá miembros por correo, asignales rol (Vendedor, Inventario, Analista, o combinados) y limitá su acceso a una sede específica. Cada rol tiene permisos distintos sobre productos, inventario, ventas y reportes financieros (ver [Roles y permisos](#roles-y-permisos)).
- Mensajería interna entre miembros del equipo (a una persona puntual o a todos los de un rol) y centro de notificaciones (invitaciones, respuestas, mensajes).
- Gestión de productos, con importación y exportación masiva por Excel/CSV.
- Gestión de inventario, con alertas de stock bajo y tablero de reposición ordenado por urgencia.
- Registro de ventas.
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
| Predicción de demanda | Python + FastAPI + LightGBM |
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

# Motor de predicción de demanda (LightGBM)

El sistema utiliza un modelo **LightGBM** entrenado inicialmente con el dataset **M5 Forecasting**.

El motor genera predicciones de demanda utilizando:

- histórico de ventas
- medias móviles
- lags
- variaciones de precio
- calendario
- variables temporales

Si el modelo LightGBM no está disponible, el servicio recurre automáticamente a un modelo Random Forest entrenado con datos propios y, en último caso, a un promedio móvil cuando no hay suficiente histórico.

Actualmente el modelo se encuentra integrado al botón **Generar Predicción** de la aplicación y a la herramienta `predecir_demanda` del asistente conversacional.

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
- Producto
- Inventario
- Venta
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
| **Inventario** | ✅ | ✅ | — | ✅ | — | ✅ | — | — |
| **Analista** | — | — | — | ✅ | ✅ | ✅ | — | — |

El acceso a cada rol puede además limitarse a una sede específica dentro de la PYME.

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

---

# Estado actual del proyecto

## Completado

- Autenticación con verificación de correo al registrarse y recuperación de contraseña por código.
- Gestión de PYMES multi-sede.
- Equipo: invitaciones, roles combinables (Vendedor / Inventario / Analista) y permisos por sede.
- Mensajería interna (personal o por rol) y centro de notificaciones.
- Gestión de productos, con importación/exportación por Excel/CSV.
- Inventario, con alertas de stock y tablero de reposición por urgencia.
- Registro de ventas.
- Dashboard.
- Perfil de usuario editable.
- Asistente conversacional con IA (Ollama + Qwen3:8B + tool calling) para stock, ventas, rentabilidad, rankings, reordenes, resumen y predicciones.
- Integración Backend ↔ IA (predicción).
- Integración LightGBM.
- Integración MySQL.
- Despliegue mediante Docker (incluye Ollama con soporte GPU).
- Predicción desde la interfaz web.

---

# Trabajo futuro

- Reentrenamiento del modelo utilizando datos reales de PYMES.
- Sincronización automática entre las ventas registradas y el motor de IA.
- Mejorar la precisión del modelo con histórico propio.
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

Adriano Aragon
Ney Salazar

Sistema Inteligente para Gestión y Predicción de Inventarios en PYMES utilizando Machine Learning.
