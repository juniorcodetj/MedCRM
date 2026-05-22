import Link from 'next/link';
import { BootstrapPayload } from '@/shared/types/bootstrap';
import { can, moduleEnabled } from '@/shared/permissions/can';

type NavItem = {
  href: string;
  label: string;
  module: string;
  permission: string;
};

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    module: 'auth',
    permission: 'auth.bootstrap.read'
  },
  {
    href: '/patients',
    label: 'Пациенты',
    module: 'patient-crm',
    permission: 'patients.read'
  },
  {
    href: '/schedule',
    label: 'Расписание',
    module: 'smart-scheduling',
    permission: 'scheduling.calendar.read'
  },
  {
    href: '/reception',
    label: 'Регистратура',
    module: 'receptionist-workplace',
    permission: 'reception.dashboard.read'
  }
];

export function Sidebar({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const visibleItems = navItems.filter((item) => moduleEnabled(bootstrap, item.module) && can(bootstrap, item.permission));

  return (
    <aside className="sidebar">
      <h2>MedCRM</h2>
      <nav className="nav">
        {visibleItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

