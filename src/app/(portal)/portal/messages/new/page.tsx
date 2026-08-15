import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getResidentContext } from '@/lib/portal/current';
import { PortalNewThreadForm } from './portal-new-thread-form';

export const metadata: Metadata = {
  title: 'Neue Nachricht · Bewohner-Portal',
};

export default async function PortalNewMessagePage() {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/messages"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← zurück zu meinen Nachrichten
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold">Neue Nachricht an die Hausverwaltung</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Ihre Nachricht geht an die zuständigen Mitarbeitenden Ihrer Hausverwaltung.
          Sie erhalten die Antworten hier im Portal.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-6">
        <PortalNewThreadForm />
      </div>
    </div>
  );
}
