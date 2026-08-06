# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite frontend, Node + Express backend, MySQL or SQLite database, and Python + FastAPI ML service using RandomForest. SQLite is used for development; MySQL is the intended production database.

## Users

The primary user is a retail small-business merchant who needs to decide which products to stock, invest in, reduce, or stop selling. The product is aimed at PYMES minoristas that need practical inventory and demand guidance without a dedicated analytics team.

Secondary roles include administrators who can access role-based flows.

## Product Purpose

The platform uses machine learning to predict product demand and tell the merchant which products to invest in and which products to stop selling. Its purpose is to help small retailers reduce losses, avoid poor stock decisions, and maximize profit.

Success means a merchant can understand inventory status, product demand, and sales implications clearly enough to make better purchasing and selling decisions.

## Positioning

The product combines inventory management, sales tracking, stock alerts, and demand prediction in one web workflow for small retailers. Its meaningful mechanism is turning product, inventory, and sales data into merchant-facing investment and discontinuation guidance, rather than only reporting stock counts.

## Operating Context

The product is used as a web app by merchants managing a small retail business. Current seeded context includes one PYME named "Tienda La Esquina", products such as Arroz, Aceite, Gaseosa, and Panela, and test users for admin and merchant roles.

Built modules include login and registration, inventory management, demand prediction, profile, about page, and adding products. Demand prediction currently works through a heuristic fallback while the ML service scaffold is ready for training.

## Capabilities and Constraints

Confirmed capabilities:

- Login and registration with JWT and roles.
- Inventory CRUD with stock alerts.
- Inventory table with pagination and search.
- Demand prediction through the backend, with frontend graph and daily table.
- Profile endpoint and editable profile form.
- Informational "Sobre nosotros" page.
- Add product flow through a modal.
- ML service scaffold in FastAPI with RandomForest planned.

Confirmed constraints and open decisions:

- The ML model still needs training with real or synthetic data.
- Python must be installed in the target environment for the ML service to run directly; current behavior may rely on fallback.
- MySQL is the intended database, while SQLite is development-only.
- Dashboard metrics, prediction history, low-stock notifications, tests, Docker, deployment, and production environment variables remain future work.

## Brand Commitments

Future visual work must preserve the product truth: a serious merchant tool for inventory optimization and demand guidance. The specific visual identity is not finalized in this record.

Confirmed future visual inputs include colors, logo, icons, typography, wireframe spacing, positions, and exact colors from Figma. Those belong in design work or DESIGN.md, not in this product record.

## Evidence on Hand

Repository evidence:

- `README.md` describes the platform, architecture, modules, setup, and roadmap.
- `frontend/` contains the React + Vite web app.
- `backend/` contains the Node + Express API with Prisma.
- `ml-service/` contains the FastAPI ML service scaffold.

Test credentials:

- Email: `comerciante@pymes.com`
- Password: `password123`

Seed data:

- PYME: "Tienda La Esquina"
- Products: Arroz, Aceite, Gaseosa, Panela
- Users: admin and comerciante

No confirmed production testimonials, case studies, press, benchmarks, or real customer proof are available yet. Future work must not fabricate them.

## Product Principles

1. Make inventory decisions actionable, not merely visible.
2. Explain demand and profitability in language a merchant can trust quickly.
3. Preserve operational clarity over decorative complexity.
4. Keep development and production assumptions explicit, especially around database and ML readiness.
5. Do not claim model accuracy or business impact beyond available evidence.

## Accessibility & Inclusion

The product should remain usable for merchants working in everyday retail contexts, with clear labels, readable tables, understandable alerts, and predictable web interactions. No additional product-specific accessibility standard has been confirmed yet.
