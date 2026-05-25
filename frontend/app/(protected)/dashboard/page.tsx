import { redirect } from 'next/navigation';
import { getBootstrap } from '@/shared/api/server-api';
import { DashboardView } from './dashboard-view';

export default async function DashboardPage() {
  const bootstrap = await getBootstrap();
  if (!bootstrap) {
    redirect('/auth/login');
  }

  return <DashboardView bootstrap={bootstrap} />;
}
