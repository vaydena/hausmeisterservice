import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KIND_LABEL, type ChecklistItemKind } from '@/lib/schemas/checklists';
import { AddItemForm } from '../item-editor';
import {
  addItemAction,
  deleteItemAction,
  deleteTemplateAction,
  moveItemAction,
  type ItemFormState,
} from '../actions';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Checkliste' };

export default async function ChecklistTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const templateRes = await supabase
    .from('checklist_templates')
    .select('id, code, title, description, category, active, created_at, updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const template = unwrapMaybeRow(templateRes, 'Checklisten: checklist_templates');

  if (!template) notFound();

  const itemsDataRes = await supabase
    .from('checklist_template_items')
    .select('id, position, kind, label, help_text, required, unit, min_value, max_value')
    .eq('template_id', template.id)
    .order('position');
  const items = unwrapRows(itemsDataRes, 'Checklisten: checklist_template_items');

  const canEdit = permissions.has('checklists.edit');
  const canDelete = permissions.has('checklists.delete');

  const boundAddItem = async (prev: ItemFormState, form: FormData) =>
    addItemAction(template.id, prev, form);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={template.title}
        description={template.code ?? undefined}
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/checklists/${template.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {template.category && <Badge tone="muted">{template.category}</Badge>}
        {template.active ? (
          <Badge tone="success">Aktiv</Badge>
        ) : (
          <Badge tone="muted">Inaktiv</Badge>
        )}
      </div>

      {template.description && (
        <Card>
          <CardHeader>
            <CardTitle>Beschreibung</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{template.description}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prüfpunkte ({items.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {items.length === 0 ? (
            <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
              Noch keine Prüfpunkte. Fügen Sie unten den ersten Punkt hinzu.
            </p>
          ) : (
            <ol className="mb-4 flex flex-col gap-2">
              {items.map((item, idx) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-muted)] text-xs font-medium">
                    {item.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.label}</span>
                      <Badge tone="muted">
                        {KIND_LABEL[item.kind as ChecklistItemKind] ?? item.kind}
                      </Badge>
                      {item.required && <Badge tone="warning">Pflicht</Badge>}
                      {item.kind === 'number' &&
                        (item.unit || item.min_value !== null || item.max_value !== null) && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {item.min_value !== null && `≥ ${item.min_value}`}
                            {item.min_value !== null && item.max_value !== null && ' · '}
                            {item.max_value !== null && `≤ ${item.max_value}`}
                            {item.unit && ` ${item.unit}`}
                          </span>
                        )}
                    </div>
                    {item.help_text && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {item.help_text}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <form action={moveItemAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="template_id" value={template.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          aria-label="Nach oben"
                          disabled={idx === 0}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveItemAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="template_id" value={template.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          aria-label="Nach unten"
                          disabled={idx === items.length - 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40"
                        >
                          ↓
                        </button>
                      </form>
                      <form action={deleteItemAction}>
                        <input type="hidden" name="item_id" value={item.id} />
                        <input type="hidden" name="template_id" value={template.id} />
                        <button
                          type="submit"
                          aria-label="Löschen"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
                        >
                          ×
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          {canEdit && <AddItemForm templateId={template.id} action={boundAddItem} />}
        </CardBody>
      </Card>

      {canDelete && (
        <div className="flex justify-end">
          <form action={deleteTemplateAction}>
            <input type="hidden" name="template_id" value={template.id} />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md border border-[var(--color-destructive)]/40 px-3 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            >
              Vorlage löschen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
