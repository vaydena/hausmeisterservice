import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { PortalLoginForm } from './portal-login-form';

export const metadata: Metadata = {
  title: 'Bewohner-Portal · Anmelden',
};

/**
 * Sprint 39: Info-/Error-Banner rendern, damit der Reset-Flow einen
 * sauberen Rueckweg hat — nach erfolgreichem Passwort-Update landet
 * der Resident hier mit ?info=…, bei abgelaufenem Link mit ?error=…
 * (beides gesetzt von /reset-password/{confirm,new}).
 */
export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ info?: string; error?: string }>;
}) {
  const ctx = await getResidentContext();
  if (ctx) redirect('/portal/dashboard');

  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Willkommen im Bewohner-Portal</h1>
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
        <PortalLoginForm />
      </div>
    </div>
  );
}
