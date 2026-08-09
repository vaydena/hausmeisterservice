import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { MaterialForm } from '../material-form';
import { createMaterialAction } from '../actions';

export const metadata: Metadata = { title: 'Neuer Artikel' };

export default async function NewMaterialPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('materials.create')) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neuer Artikel"
        description="Materialstamm anlegen — Bestand wird über Bewegungen aufgebaut."
      />
      <MaterialForm
        action={createMaterialAction}
        cancelHref="/materials"
        submitLabel="Artikel anlegen"
      />
    </div>
  );
}
