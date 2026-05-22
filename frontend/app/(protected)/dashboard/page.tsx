import { getBootstrap } from '@/shared/api/server-api';

export default async function DashboardPage() {
  const bootstrap = await getBootstrap();

  return (
    <section className="content-panel">
      <h1>Операционная панель</h1>
      <p className="muted">Bootstrap payload получен, tenant isolation и permission-aware shell активны.</p>
      <pre>{JSON.stringify({ modules: bootstrap?.enabledModules, permissions: bootstrap?.permissions.length }, null, 2)}</pre>
    </section>
  );
}

