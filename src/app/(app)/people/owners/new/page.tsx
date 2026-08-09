import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { OwnerForm } from '../owner-form';
import { createOwnerAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Eigentümer' };

export default async function NewOwnerPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('owners.create')) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neuer Eigentümer"
        description="Stammdaten für Privatperson, Firma oder Hausverwaltung anlegen."
      />
      <OwnerForm
        action={createOwnerAction}
        cancelHref="/people/owners"
        submitLabel="Eigentümer anlegen"
      />
    </div>
  );
}
