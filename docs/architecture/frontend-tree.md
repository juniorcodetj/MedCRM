# Frontend Tree-схема

Frontend строится на Next.js 16 App Router и организуется по feature/module-first подходу. Маршруты в `app` отвечают за страницы и layouts, бизнес-логика модулей живет в `modules`, переиспользуемые UI и API-клиенты - в `shared`.

```text
/frontend
|
├── app
│   ├── [locale]
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── auth
│   │   │   ├── login
│   │   │   ├── callback
│   │   │   └── two-factor
│   │   ├── dashboard
│   │   ├── reception
│   │   ├── patients
│   │   ├── schedule
│   │   ├── finance
│   │   ├── analytics
│   │   ├── settings
│   │   └── integrations
│   ├── api
│   ├── manifest.ts
│   └── service-worker.ts
|
├── modules
│   ├── patient-crm
│   │   ├── api
│   │   ├── components
│   │   │   ├── patient-card
│   │   │   ├── patient-timeline
│   │   │   ├── family-widget
│   │   │   ├── legal-alerts
│   │   │   └── duplicate-warning
│   │   ├── hooks
│   │   ├── stores
│   │   ├── schemas
│   │   ├── permissions
│   │   ├── routes.ts
│   │   └── module.manifest.ts
│   ├── organization-structure
│   │   ├── api
│   │   ├── components
│   │   ├── hooks
│   │   ├── stores
│   │   ├── schemas
│   │   ├── permissions
│   │   ├── routes.ts
│   │   └── module.manifest.ts
│   ├── smart-scheduling
│   │   ├── api
│   │   ├── components
│   │   │   ├── calendar-view
│   │   │   ├── appointment-card
│   │   │   ├── availability-panel
│   │   │   ├── waiting-list-panel
│   │   │   └── resource-conflict-dialog
│   │   ├── hooks
│   │   ├── stores
│   │   ├── schemas
│   │   ├── permissions
│   │   ├── routes.ts
│   │   └── module.manifest.ts
│   ├── receptionist-workplace
│   │   ├── api
│   │   ├── components
│   │   │   ├── todays-board
│   │   │   ├── fast-booking-command
│   │   │   ├── visit-card
│   │   │   ├── queue-panel
│   │   │   ├── call-popup
│   │   │   ├── mini-crm-card
│   │   │   ├── invoice-draft-panel
│   │   │   └── receptionist-timeline
│   │   ├── hooks
│   │   ├── stores
│   │   ├── schemas
│   │   ├── permissions
│   │   ├── routes.ts
│   │   └── module.manifest.ts
│   ├── finance
│   ├── communications
│   ├── analytics
│   ├── telephony
│   └── laboratories
|
├── shared
│   ├── ui
│   │   ├── button
│   │   ├── dialog
│   │   ├── form
│   │   ├── table
│   │   └── toast
│   ├── hooks
│   ├── api
│   │   ├── http-client.ts
│   │   ├── graphql-client.ts
│   │   └── query-client.ts
│   ├── stores
│   │   ├── auth.store.ts
│   │   ├── tenant.store.ts
│   │   └── feature-flags.store.ts
│   ├── utils
│   ├── constants
│   ├── permissions
│   │   ├── can.ts
│   │   └── permission-map.ts
│   └── i18n
│       ├── routing.ts
│       ├── ru.json
│       └── tj.json
|
├── widgets
│   ├── charts
│   ├── calendars
│   ├── tables
│   └── dashboards
|
├── entities
│   ├── patient
│   ├── doctor
│   ├── appointment
│   ├── invoice
│   └── clinic
|
└── processes
    ├── patient-booking
    ├── patient-payment
    ├── doctor-appointment
    └── notifications
```

## Frontend правила модулей

Каждый frontend-модуль обязан иметь:

- `module.manifest.ts` с кодом модуля, routes, permissions и feature flags;
- API слой модуля;
- Zod schemas для форм и входных данных;
- компоненты, не зависящие от private API других модулей;
- permission checks на уровне маршрутов и действий;
- graceful empty state, если модуль выключен.

## Runtime логика

После login frontend получает bootstrap payload:

```ts
type TenantBootstrap = {
  tenant: {
    id: string;
    code: string;
    name: string;
    locale: 'ru' | 'tj';
    subscriptionPlan: string;
  };
  enabledModules: string[];
  permissions: string[];
  featureFlags: Record<string, boolean | string | number>;
};
```

Frontend использует эти данные для:

- построения sidebar/navigation;
- защиты routes;
- скрытия недоступных кнопок и действий;
- настройки TanStack Query keys с учетом tenant;
- выбора локали;
- включения PWA и realtime возможностей.

## Пример frontend module manifest

```ts
export const patientCrmFrontendManifest = {
  code: 'patient-crm',
  routes: ['/patients'],
  requiredPermissions: ['patients.read'],
  featureFlags: ['patient-crm.enabled', 'patients.merge.enabled'],
  navigation: {
    labelKey: 'navigation.patients',
    href: '/patients',
    order: 20,
  },
} as const;
```
