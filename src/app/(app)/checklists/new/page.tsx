import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm } from '../template-form';
import { createTemplateAction } from '../actions';

export const metadata: Metadata = { title: 'Neue Checkliste' };

export default async function NewChecklistPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('checklists.create')) notFound();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Neue Checkliste"
        description="Erst Vorlage anlegen — Prüfpunkte fügen Sie danach im Detail hinzu."
      />
      <TemplateForm
        action={createTemplateAction}
        cancelHref="/checklists"
        submitLabel="Vorlage anlegen"
      />
    </div>
  );
}
