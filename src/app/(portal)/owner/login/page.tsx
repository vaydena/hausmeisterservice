import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { OwnerLoginForm } from './owner-login-form';

export const metadata: Metadata = {
  title: 'Eigentümer-Portal · Anmelden',
};

/**
 * Info-/Error-Banner wie im Bewohnerportal: der Reset-Flow landet nach
 * erfolgreichem Passwort-Update hier mit ?info=…, bei abgelaufenem Link
 * mit ?error=… (gesetzt von /reset-password/{confirm,new} via owner=1).
 */
export default async function OwnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string; error?: string }>;
}) {
  const ctx = await getOwnerContext();
  if (ctx) redirect('/owner/dashboard');

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Willkommen im Eigentümer-Portal</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Melden Sie sich mit Ihrer E-Mail-Adresse an, die Sie in der Einladung
          erhalten haben.
        </p>
      </div>
      {params.info && (
        <p
          role="status"
          className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/5 p-3 text-sm text-[var(--color-success)]"
        >
          {params.info}
        </p>
      )}
      {params.error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 p-3 text-sm text-[var(--color-destructive)]"
        >
          {params.error}
        </p>
      )}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <OwnerLoginForm />
      </div>
    </div>
  );
}
