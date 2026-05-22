import { LoginForm } from '@/modules/auth/components/login-form';

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>MedCRM</h1>
        <div className="muted">Вход в рабочее пространство клиники</div>
        <LoginForm />
      </section>
    </main>
  );
}

