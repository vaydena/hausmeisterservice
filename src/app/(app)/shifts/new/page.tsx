import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { ShiftForm } from '../shift-form';
import { createShiftAction } from '../actions';

export const metadata: Metadata = { title: 'Neue Schicht' };

export default async function NewShiftPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('shifts.manage')) notFound();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Neue Schicht"
        description="Ein Schichtmodell beschreibt Lage und Pause einer wiederkehrenden Arbeitszeit."
      />
      <ShiftForm action={createShiftAction} cancelHref="/shifts" submitLabel="Schicht anlegen" />
    </div>
  );
}
