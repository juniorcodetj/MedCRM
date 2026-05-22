import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const modules = [
  { code: 'auth', name: 'Auth/RBAC', version: '1.0.0', isCore: true, dependencies: [] },
  { code: 'organization-structure', name: 'Organization Structure', version: '1.0.0', isCore: false, dependencies: ['auth'] },
  { code: 'patient-crm', name: 'Patient CRM', version: '1.0.0', isCore: false, dependencies: ['auth', 'organization-structure'] },
  { code: 'smart-scheduling', name: 'Smart Scheduling', version: '1.0.0', isCore: false, dependencies: ['auth', 'organization-structure', 'patient-crm'] },
  { code: 'receptionist-workplace', name: 'Receptionist Workplace', version: '1.0.0', isCore: false, dependencies: ['auth', 'patient-crm', 'smart-scheduling'] },
  { code: 'communications', name: 'Communications', version: '1.0.0', isCore: false, dependencies: ['auth', 'patient-crm'] }
];

const permissions = [
  ['auth', 'auth.bootstrap.read', 'Read bootstrap payload'],
  ['auth', 'users.read', 'Read users'],
  ['auth', 'users.manage', 'Manage users'],
  ['auth', 'roles.manage', 'Manage roles'],
  ['organization-structure', 'organization.branches.read', 'Read branches'],
  ['organization-structure', 'organization.branches.manage', 'Manage branches'],
  ['organization-structure', 'organization.employees.read', 'Read employees'],
  ['organization-structure', 'organization.employees.manage', 'Manage employees'],
  ['patient-crm', 'patients.read', 'Read patients'],
  ['patient-crm', 'patients.create', 'Create patients'],
  ['patient-crm', 'patients.update', 'Update patients'],
  ['patient-crm', 'patients.contacts.read', 'Read patient contacts'],
  ['patient-crm', 'patients.contacts.manage', 'Manage patient contacts'],
  ['patient-crm', 'patients.export', 'Export patients'],
  ['smart-scheduling', 'scheduling.appointments.read', 'Read appointments'],
  ['smart-scheduling', 'scheduling.appointments.create', 'Create appointments'],
  ['smart-scheduling', 'scheduling.appointments.update', 'Update appointments'],
  ['smart-scheduling', 'scheduling.appointments.cancel', 'Cancel appointments'],
  ['smart-scheduling', 'scheduling.calendar.read', 'Read calendar'],
  ['smart-scheduling', 'scheduling.availability.read', 'Read availability'],
  ['receptionist-workplace', 'reception.dashboard.read', 'Read reception dashboard'],
  ['receptionist-workplace', 'reception.fast_booking.create', 'Create fast booking'],
  ['receptionist-workplace', 'reception.visit.checkin', 'Check in patients']
] as const;

async function main(): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { code: 'demo-clinic' },
    update: {},
    create: {
      code: 'demo-clinic',
      name: 'Demo Clinic',
      subscriptionPlan: 'enterprise',
      defaultLocale: 'ru',
      timezone: 'Europe/Moscow',
      status: 'active'
    }
  });

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'main' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'main',
      name: 'Main Branch',
      timezone: 'Europe/Moscow',
      status: 'active'
    }
  });

  const moduleByCode = new Map<string, string>();
  for (const item of modules) {
    const module = await prisma.systemModule.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        version: item.version,
        isCore: item.isCore,
        dependencies: item.dependencies
      },
      create: {
        code: item.code,
        name: item.name,
        version: item.version,
        isCore: item.isCore,
        dependencies: item.dependencies,
        status: 'active'
      }
    });
    moduleByCode.set(item.code, module.id);
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId: tenant.id, moduleId: module.id } },
      update: { enabled: true, activatedAt: new Date() },
      create: {
        tenantId: tenant.id,
        moduleId: module.id,
        enabled: true,
        activatedAt: new Date(),
        configurationJson: {}
      }
    });
  }

  const permissionIds: string[] = [];
  for (const [moduleCode, code, name] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name, moduleCode, moduleId: moduleByCode.get(moduleCode) },
      create: {
        code,
        name,
        moduleCode,
        moduleId: moduleByCode.get(moduleCode)
      }
    });
    permissionIds.push(permission.id);
  }

  const ownerRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'CLINIC_OWNER' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'CLINIC_OWNER',
      name: 'Clinic Owner',
      description: 'Full tenant administrator',
      isSystem: true
    }
  });

  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: ownerRole.id, permissionId } },
      update: {},
      create: { roleId: ownerRole.id, permissionId }
    });
  }

  const passwordHash = await argon2.hash('Admin123!');
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'admin@demo.clinic' } },
    update: { passwordHash, status: 'active' },
    create: {
      tenantId: tenant.id,
      email: 'admin@demo.clinic',
      passwordHash,
      firstName: 'Demo',
      lastName: 'Admin',
      language: 'ru',
      status: 'active',
      isSuperAdmin: false
    }
  });

  await prisma.userBranchRole.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      userId: admin.id,
      tenantId: tenant.id,
      branchId: branch.id,
      roleId: ownerRole.id,
      isPrimary: true
    }
  });

  await prisma.service.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'consultation' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'consultation',
      name: 'Консультация',
      durationMinutes: 30,
      color: '#0f766e',
      isOnlineBookable: true
    }
  });

  await prisma.service.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'procedure' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'procedure',
      name: 'Процедура',
      durationMinutes: 45,
      color: '#7c3aed',
      isOnlineBookable: true
    }
  });

  console.log('Seed completed');
  console.log('Tenant code: demo-clinic');
  console.log('Login: admin@demo.clinic');
  console.log('Password: Admin123!');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
