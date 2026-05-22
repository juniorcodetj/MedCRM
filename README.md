# MedCRM

Production-oriented SaaS CRM/MIS platform for private clinics.

MedCRM is designed as a cloud-first, multi-tenant medical CRM foundation with modular business domains, RBAC, audit logging, Patient CRM, Smart Scheduling, and a Receptionist Workplace MVP.

## Current Status

This repository contains the implementation bootstrap and the first vertical slice:

- authentication and tenant bootstrap;
- Patient CRM MVP;
- Smart Scheduling MVP;
- Reception Dashboard MVP;
- Prisma/PostgreSQL baseline;
- Docker Compose infrastructure;
- Next.js protected frontend shell.

The system currently supports the core demo flow:

```text
Login
  -> Create/search patient
  -> Create appointment
  -> See appointment on reception dashboard
  -> Change appointment status with realtime updates
```

## Architecture

The project follows a **Modular Monolith + Microservice-ready** approach.

For MVP speed, the initial backend runtime hosts the core modules in a NestJS monorepo-style application while preserving clear module boundaries. The structure is prepared for future extraction into independent services.

```text
backend/
  apps/
    api-gateway/
    auth-service/
  core/
    audit/
    cache/
    database/
    realtime/
    security/
    tenancy/
  prisma/
  infrastructure/

frontend/
  app/
  modules/
    auth/
    patient-crm/
    smart-scheduling/
    reception/
    shell/
  shared/
```

Full architecture documents are available in [docs/architecture](./docs/architecture).

## Tech Stack

### Backend

- Node.js 24
- NestJS
- TypeScript strict mode
- Prisma ORM
- PostgreSQL
- Redis
- Socket.IO
- BullMQ foundation
- Swagger/OpenAPI
- Zod validation
- JWT access/refresh authentication
- RBAC guards
- Audit logging

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript strict mode
- TanStack Query
- Zustand-ready structure
- Zod
- Socket.IO Client
- Permission-aware navigation

### Infrastructure

- Docker Compose
- PostgreSQL 17
- Redis 7
- MinIO
- API Gateway
- Auth/Domain backend service
- Frontend container

## Implemented Modules

### Auth / RBAC

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/bootstrap`
- JWT access tokens
- refresh token rotation
- session records
- RBAC guard
- tenant/branch context payload
- audit events

### Patient CRM

- `GET /patients`
- `POST /patients`
- `GET /patients/:id`
- `PATCH /patients/:id`
- `GET /patients/search`
- patient contacts baseline
- duplicate detection baseline
- branch-aware filtering
- audit events
- frontend patient list, create form, search, details page

### Smart Scheduling

- `GET /appointments`
- `POST /appointments`
- `PATCH /appointments/:id`
- `POST /appointments/:id/confirm`
- `POST /appointments/:id/check-in`
- `POST /appointments/:id/cancel`
- `GET /availability`
- `POST /slots/reserve`
- appointment conflict baseline
- appointment status history
- appointment resources
- reminder queue foundation
- frontend calendar and appointment creation flow

### Reception Dashboard

- `GET /reception/dashboard`
- Today Board grouped by appointment statuses
- drag/drop status changes
- queue panel baseline
- Socket.IO updates

## Getting Started

### Prerequisites

- Node.js 24+
- npm
- Docker and Docker Compose

### Environment

Copy the example environment:

```bash
cp .env.example .env
```

Default demo credentials are seeded automatically:

```text
tenantCode: demo-clinic
email: admin@demo.clinic
password: Admin123!
```

### Install Dependencies

```bash
npm install
```

### Generate Prisma Client

```bash
npm --workspace backend run prisma:generate
```

### Run With Docker Compose

```bash
docker compose up --build
```

Services:

- Frontend: [http://localhost:3002](http://localhost:3002)
- API Gateway: [http://localhost:3000](http://localhost:3000)
- API Gateway Swagger: [http://localhost:3000/docs](http://localhost:3000/docs)
- Auth Service Swagger: [http://localhost:3001/docs](http://localhost:3001/docs)
- MinIO Console: [http://localhost:9001](http://localhost:9001)

## Local Development

Start backend services locally:

```bash
npm --workspace backend run start:dev:auth
npm --workspace backend run start:dev:gateway
```

Start frontend:

```bash
npm --workspace frontend run dev
```

Run migrations and seed manually:

```bash
npm --workspace backend run prisma:migrate
npm --workspace backend run prisma:seed
```

## Validation

The current codebase has been checked with:

```bash
npm --workspace backend run prisma:generate
npm --workspace backend run typecheck
npm --workspace frontend run typecheck
npm --workspace backend run build
npm --workspace frontend run build
```

## Example API Requests

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenantCode":"demo-clinic","email":"admin@demo.clinic","password":"Admin123!"}'
```

### Create Patient

```bash
curl -X POST http://localhost:3000/patients \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Иван","lastName":"Иванов","phone":"+992900000000","registrationBranchId":"<branch_id>"}'
```

### Create Appointment

```bash
curl -X POST http://localhost:3000/appointments \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId":"<branch_id>",
    "patientId":"<patient_id>",
    "employeeId":"<doctor_user_id>",
    "serviceId":"<service_id>",
    "startAt":"2026-05-22T10:00:00.000Z",
    "endAt":"2026-05-22T10:30:00.000Z"
  }'
```

## Security Baseline

Implemented:

- JWT access tokens;
- refresh token rotation;
- stateful session records;
- RBAC guards;
- branch-aware application filtering;
- audit events for auth, patient, and appointment changes;
- PostgreSQL RLS migration baseline;
- HTTP security headers through Helmet;
- strict TypeScript.

Known hardening items before production:

- enforce DB tenant context on every request;
- add transactional resource locking/exclusion constraints for scheduling conflicts;
- enforce appointment status state machine transitions;
- validate realtime sessions against active server-side sessions;
- add granular permission checks for every frontend action;
- add test coverage for race conditions and RBAC boundaries.

## Roadmap

Next vertical slices:

- Patient CRM hardening: contacts API, family ties, legal documents, timeline.
- Smart Scheduling hardening: room/equipment resources, resource locks, waiting list.
- Reception Workplace: call handling, invoice preparation, queue terminals.
- Finance Foundation.
- EMR/Doctor Workplace.
- Communications and telephony integrations.
- BI analytics.

## Repository Layout

```text
.
├── backend
│   ├── apps
│   ├── core
│   ├── prisma
│   └── infrastructure
├── frontend
│   ├── app
│   ├── modules
│   └── shared
├── docs
│   └── architecture
├── docker-compose.yml
└── .env.example
```

## License

Private project. All rights reserved unless a license is added by the repository owner.

