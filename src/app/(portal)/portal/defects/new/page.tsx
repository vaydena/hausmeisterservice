import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { PortalDefectForm } from './portal-defect-form';

export const metadata: Metadata = {
  title: 'Neue Meldung · Bewohner-Portal',
};

export default async function NewPortalDefectPage() {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/defects"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← zurück
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Neue Meldung erstellen</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Ihre Meldung geht an die Hausverwaltung von{' '}
          <strong className="font-medium text-[var(--color-foreground)]">
            {ctx.propertyName ?? 'Ihrem Objekt'}
          </strong>
          {ctx.unitCode ? ` (Einheit ${ctx.unitCode})` : ''}.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <PortalDefectForm />
      </div>
    </div>
  );
}
