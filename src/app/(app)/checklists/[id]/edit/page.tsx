import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { TemplateForm } from '../../template-form';
import { updateTemplateAction, type TemplateFormState } from '../../actions';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Checkliste bearbeiten' };

export default async function EditChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('checklists.edit')) notFound();

  const supabase = await createSupabaseServerClient();
  const templateRes = await supabase
    .from('checklist_templates')
    .select('id, title, description, category, active')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const template = unwrapMaybeRow(templateRes, 'Checklisten: checklist_templates');

  if (!template) notFound();

  const action = async (prev: TemplateFormState, form: FormData) =>
    updateTemplateAction(id, prev, form);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader title="Checkliste bearbeiten" description={template.title} />
      <TemplateForm
        action={action}
        cancelHref={`/checklists/${id}`}
        submitLabel="Änderungen speichern"
        initial={template}
      />
    </div>
  );
}
