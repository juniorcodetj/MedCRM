import { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getBootstrap } from '@/shared/api/server-api';
import { Sidebar } from '@/modules/shell/components/sidebar';
import { AppQueryProvider } from '@/shared/query/query-provider';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const bootstrap = await getBootstrap();
  if (!bootstrap) {
    redirect('/auth/login');
  }

  const branch = bootstrap.branches[0];

  return (
    <div className="shell">
      <Sidebar bootstrap={bootstrap} />
      <main className="main">
        <header className="topbar">
          <div>
            <strong>{bootstrap.tenant.name}</strong>
            <div className="muted">{branch ? branch.name : 'Филиал не выбран'}</div>
          </div>
          <div className="muted">{bootstrap.tenant.subscriptionPlan}</div>
        </header>
        <AppQueryProvider>{children}</AppQueryProvider>
      </main>
    </div>
  );
}
