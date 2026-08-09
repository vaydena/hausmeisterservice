import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { PortalLoginForm } from './portal-login-form';

export const metadata: Metadata = {
  title: 'Bewohner-Portal · Anmelden',
};

export default async function PortalLoginPage() {
  const ctx = await getResidentContext();
  if (ctx) redirect('/portal/dashboard');

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6 flex flex-col gap-1 text-center">
        <h1 className="text-xl font-semibold">Willkommen im Bewohner-Portal</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Melden Sie sich mit Ihrer E-Mail-Adresse an, die Sie in der Einladung
          erhalten haben.
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
        <PortalLoginForm />
      </div>
    </div>
  );
}
