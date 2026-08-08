# Plataforma Inteligente de Gestión de Inventarios para PYMES

Sistema web para la administración de inventarios de pequeñas y medianas empresas, con un motor de Inteligencia Artificial capaz de predecir la demanda de productos utilizando Machine Learning.

---

# Características principales

- Autenticación mediante JWT.
- Gestión de PYMES.
- Gestión de productos.
- Gestión de inventario.
- Registro de ventas.
- Predicción automática de demanda mediante IA.
- Dashboard con indicadores.
- Despliegue completo mediante Docker.

---

# Arquitectura

```
                React + Vite
                      │
                      ▼
             Backend (Node.js)
          Express + Prisma ORM
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
     MySQL                     ML Service
(ai_inventory)              FastAPI + Python
                                    │
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
| IA | Python + FastAPI + LightGBM |
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

# Motor de Inteligencia Artificial

El sistema utiliza un modelo **LightGBM** entrenado inicialmente con el dataset **M5 Forecasting**.

El motor genera predicciones de demanda utilizando:

- histórico de ventas
- medias móviles
- lags
- variaciones de precio
- calendario
- variables temporales

Actualmente el modelo se encuentra integrado al botón **Generar Predicción** de la aplicación.

---

# Base de datos

El proyecto utiliza una única base MySQL llamada:

```
ai_inventory
```

En ella conviven dos esquemas independientes:

### Aplicación

- User
- Pyme
- Producto
- Inventario
- Venta
- Prediccion

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

# Docker

Todo el sistema puede ejecutarse mediante Docker Compose.

Servicios incluidos:

- frontend
- backend
- ml-service
- mysql

Primer despliegue:

```bash
docker compose build

docker compose up -d
```

Inicializar la base de datos:

```bash
docker compose exec backend npx prisma db push
docker compose exec backend npm run seed
```

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

- Autenticación.
- Gestión de PYMES.
- Gestión de productos.
- Inventario.
- Registro de ventas.
- Dashboard.
- Integración Backend ↔ IA.
- Integración LightGBM.
- Integración MySQL.
- Despliegue mediante Docker.
- Predicción desde la interfaz web.

---

# Trabajo futuro

- Asistente conversacional para consulta de inventario mediante lenguaje natural.
- Reentrenamiento del modelo utilizando datos reales de PYMES.
- Sincronización automática entre las ventas registradas y el motor de IA.
- Mejorar la precisión del modelo con histórico propio.
- Reportes avanzados y analítica de negocio.

---

# Requisitos

- Docker Desktop
- Git

o, para desarrollo:

- Node.js 18+
- Python 3.10+
- MySQL 8+

---

# Autores

Ney Salazar

Sistema Inteligente para Gestión y Predicción de Inventarios en PYMES utilizando Machine Learning.