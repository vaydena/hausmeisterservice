import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { PropertyForm } from '../property-form';
import { createPropertyAction } from '../actions';

export const metadata: Metadata = { title: 'Neues Objekt' };

export default async function NewPropertyPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('properties.create')) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neues Objekt"
        description="Legen Sie eine neue Liegenschaft an. Adresse und Hinweise können später ergänzt werden."
      />
      <PropertyForm
        action={createPropertyAction}
        cancelHref="/properties"
        submitLabel="Objekt anlegen"
      />
    </div>
  );
}
