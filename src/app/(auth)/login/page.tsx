import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Anmelden',
};

type LoginSearchParams = { next?: string; error?: string; info?: string };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>;
}) {
  return <LoginContent searchParams={searchParams} />;
}

async function LoginContent({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Willkommen zurück</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Melden Sie sich mit Ihrer E-Mail-Adresse an.
        </p>
      </div>
      {params.info && (
        <p
          role="status"
          className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3 text-sm text-[var(--color-success)]"
        >
          {params.info}
        </p>
      )}
      {params.error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3 text-sm text-[var(--color-destructive)]"
        >
          {params.error}
        </p>
      )}
      <LoginForm nextPath={params.next ?? '/dashboard'} />
    </div>
  );
}
