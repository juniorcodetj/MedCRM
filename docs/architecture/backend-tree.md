# Backend Tree-схема

Целевая структура backend построена под NestJS monorepo: несколько приложений в `apps`, общее ядро в `core`, бизнес-модули в `modules`, Prisma и инфраструктура рядом с кодом.

```text
/backend
|
├── apps
│   ├── api-gateway
│   │   ├── src
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── rest
│   │   │   ├── graphql
│   │   │   └── websocket
│   │   └── test
│   ├── auth-service
│   │   ├── src
│   │   │   ├── authentication
│   │   │   ├── authorization
│   │   │   ├── rbac
│   │   │   ├── sessions
│   │   │   ├── tokens
│   │   │   ├── two-factor
│   │   │   ├── password-policy
│   │   │   ├── oauth-sso
│   │   │   └── audit
│   │   └── test
│   ├── notification-service
│   │   ├── src
│   │   └── test
│   ├── analytics-service
│   │   ├── src
│   │   └── test
│   └── integration-service
│       ├── src
│       └── test
|
├── core
│   ├── database
│   │   ├── prisma.service.ts
│   │   ├── transaction-manager.ts
│   │   └── tenant-context.middleware.ts
│   ├── security
│   │   ├── jwt
│   │   ├── oauth
│   │   ├── two-factor
│   │   └── guards
│   ├── tenancy
│   │   ├── tenant.resolver.ts
│   │   ├── tenant-context.ts
│   │   └── tenant.module.ts
│   ├── audit
│   │   ├── audit.service.ts
│   │   ├── audit.interceptor.ts
│   │   └── audit-event.entity.ts
│   ├── permissions
│   │   ├── rbac.service.ts
│   │   ├── acl.service.ts
│   │   ├── permission.guard.ts
│   │   └── permissions-map.builder.ts
│   ├── localization
│   │   ├── i18n.service.ts
│   │   └── locales
│   ├── cache
│   │   ├── redis.module.ts
│   │   └── cache.service.ts
│   ├── events
│   │   ├── event-bus.module.ts
│   │   ├── domain-event.interface.ts
│   │   └── event-handler.interface.ts
│   ├── modules-registry
│   │   ├── module-manifest.interface.ts
│   │   ├── module-registry.service.ts
│   │   └── module-guard.ts
│   ├── feature-flags
│   │   ├── feature-flag.service.ts
│   │   ├── feature-flag.guard.ts
│   │   └── rollout-strategy.ts
│   └── common
│       ├── decorators
│       ├── filters
│       ├── interceptors
│       ├── pipes
│       └── errors
|
├── modules
│   ├── patient-crm
│   │   ├── patient-crm.module.ts
│   │   ├── module.manifest.ts
│   │   ├── patient-profile
│   │   ├── contacts
│   │   ├── crm-segmentation
│   │   ├── lead-tracking
│   │   ├── family-relations
│   │   ├── legal-documents
│   │   ├── crm-history
│   │   ├── communication-tracking
│   │   ├── loyalty-foundation
│   │   ├── lifecycle-engine
│   │   ├── duplicate-detection
│   │   ├── patient-search
│   │   ├── permissions
│   │   ├── events
│   │   └── tests
│   ├── organization-structure
│   │   ├── organization-structure.module.ts
│   │   ├── module.manifest.ts
│   │   ├── branches
│   │   ├── departments
│   │   ├── employees
│   │   ├── positions
│   │   ├── rooms
│   │   ├── equipment
│   │   ├── schedules
│   │   ├── directories
│   │   ├── permissions
│   │   ├── events
│   │   └── tests
│   ├── smart-scheduling
│   │   ├── smart-scheduling.module.ts
│   │   ├── module.manifest.ts
│   │   ├── appointments
│   │   ├── calendars
│   │   ├── availability-engine
│   │   ├── conflict-engine
│   │   ├── waiting-list
│   │   ├── online-booking
│   │   ├── public-booking-api
│   │   ├── recurrence-engine
│   │   ├── reminders
│   │   ├── booking-rules
│   │   ├── resource-reservations
│   │   ├── permissions
│   │   ├── events
│   │   └── tests
│   ├── doctors-workplace
│   ├── receptionist-workplace
│   │   ├── receptionist-workplace.module.ts
│   │   ├── module.manifest.ts
│   │   ├── todays-board
│   │   ├── fast-booking
│   │   ├── patient-search
│   │   ├── queue-management
│   │   ├── call-handling
│   │   ├── visit-control
│   │   ├── invoice-preparation
│   │   ├── receptionist-timeline
│   │   ├── realtime-dashboard
│   │   ├── sticky-patient-context
│   │   ├── offline-sync
│   │   ├── permissions
│   │   ├── events
│   │   └── tests
│   ├── finance
│   ├── warehouse
│   ├── communications
│   ├── telephony
│   ├── laboratories
│   ├── analytics
│   ├── loyalty
│   ├── marketing
│   ├── documents
│   ├── files-storage
│   └── integrations
|
├── prisma
│   ├── schema.prisma
│   ├── migrations
│   └── seeds
│       ├── system-modules.seed.ts
│       ├── roles.seed.ts
│       └── feature-flags.seed.ts
|
├── shared
│   ├── types
│   ├── constants
│   ├── enums
│   ├── utils
│   └── interfaces
|
└── infrastructure
    ├── docker
    │   ├── Dockerfile.api
    │   ├── Dockerfile.worker
    │   └── compose.local.yml
    ├── kubernetes
    │   ├── base
    │   └── overlays
    ├── terraform
    ├── monitoring
    │   ├── prometheus
    │   ├── grafana
    │   └── loki
    └── ci-cd
        └── github-actions
```

## Backend правила модулей

Каждый backend-модуль обязан иметь:

- `module.manifest.ts` с кодом, версией, зависимостями и permissions;
- публичные DTO/contracts для межмодульного взаимодействия;
- собственные controllers/services/repositories;
- набор domain events;
- tests на application services и guards;
- миграции, если модуль владеет таблицами.

Модуль не должен:

- читать таблицы другого модуля напрямую без согласованного read contract;
- импортировать private services другого модуля;
- обходить tenant context;
- выполнять действие без проверки module enabled + permission.

## Пример module manifest

```ts
export const PatientCrmModuleManifest = {
  code: 'patient-crm',
  name: 'Patient CRM',
  version: '1.0.0',
  isCore: false,
  dependencies: ['auth', 'organization-structure', 'communications'],
  permissions: [
    'patients.read',
    'patients.create',
    'patients.update',
    'patients.archive',
    'patients.merge',
    'patients.contacts.read',
    'patients.contacts.manage',
    'patients.documents.read',
    'patients.documents.manage',
    'patients.tags.manage',
    'patients.family.manage',
    'patients.metrics.read',
    'patients.export',
  ],
  events: {
    publishes: ['patient.created', 'patient.updated', 'patient.deleted'],
    subscribes: ['appointment.confirmed', 'payment.completed'],
  },
} as const;
```
