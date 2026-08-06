# Plataforma de Optimización de Inventarios para PYMES

Plataforma web que usa **aprendizaje automático** para predecir la demanda
y clasificar la **rentabilidad** de los productos de pequeñas empresas
minoristas, ayudándolas a decidir en qué productos invertir.

## Arquitectura

| Capa        | Tecnología                        | Carpeta      |
| ----------- | --------------------------------- | ------------ |
| Frontend    | React + Vite                      | `frontend/`  |
| Backend     | Node.js + Express + Prisma        | `backend/`   |
| Base de datos| MySQL                            | —            |
| ML          | Python + FastAPI + scikit-learn   | `ml-service/`|

Comunicación: `Frontend -> Backend (REST) -> MySQL` y `Backend -> ML (REST)`.

## Módulos

1. Autenticación (JWT; roles: COMERCIANTE, ADMIN).
2. Gestión de PYMES.
3. Gestión de Productos.
4. Inventario (alerta cuando `stock_actual <= stock_minimo`).
5. Registro de Ventas (actualiza inventario y dispara predicción).
6. Predicciones (Random Forest / Gradient Boosting).
7. Dashboard con métricas, gráficas y alertas.

## Requisitos

- Node.js >= 18
- MySQL 8+
- Python >= 3.10 (solo para el servicio ML)

## Puesta en marcha

### 1. Base de datos (MySQL)

Crea la base de datos y configura las credenciales en `backend/.env`:

```env
DATABASE_URL="mysql://usuario:clave@localhost:3306/inventario_pymes"
```

> Si instalas Docker, hay un `docker-compose.yml` en la raíz con una imagen
> MySQL lista: `docker compose up -d`.

### 2. Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init   # crea tablas
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre `http://localhost:5173`.

### 4. Servicio ML

```bash
cd ml-service
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Estructura del proyecto

```
├── backend/          # API REST (Express + Prisma)
│   ├── prisma/       # schema.prisma (modelo de datos)
│   └── src/
│       ├── config/       # variables de entorno
│       ├── controllers/  # capa HTTP
│       ├── services/     # lógica de negocio
│       ├── routes/       # rutas REST
│       ├── middlewares/  # auth + errores
│       ├── lib/          # cliente Prisma
│       └── utils/        # helpers (JWT, manejo de errores)
├── frontend/         # SPA React + Vite
│   └── src/
│       ├── api/          # cliente HTTP (axios)
│       ├── components/   # UI reutilizable
│       ├── context/      # AuthContext
│       ├── hooks/        # hooks personalizados
│       ├── pages/        # pantallas
│       └── routes/       # rutas protegidas
└── ml-service/       # API ML (FastAPI)
    ├── app/
    │   ├── api/          # endpoints (/predict, /health)
    │   ├── models/       # entrenamiento y modelos
    │   ├── services/     # lógica de predicción
    │   └── data/         # datasets (raw/processed)
```

## Flujo de una venta

1. Guardar venta.
2. Actualizar stock del producto.
3. Consultar histórico de ventas.
4. Solicitar predicción al servicio ML.
5. Guardar predicción.
6. Actualizar dashboard.

## Roadmap

- [x] Estructura base del proyecto
- [ ] Autenticación
- [ ] CRUD PYMES
- [ ] CRUD Productos
- [ ] Inventario
- [ ] Ventas
- [ ] Dashboard
- [ ] Integración ML
- [ ] Alertas
- [ ] Pruebas
