import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModuleLink } from '@/components/ui/module-link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  KIND_LABEL,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  isRunItemAnswered,
  type ChecklistItemKind,
  type ChecklistRunStatus,
} from '@/lib/schemas/checklists';
import { cancelRunAction, completeRunAction, updateRunItemAction } from '../actions';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList, type DocumentRow } from '@/components/documents/document-list';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Checklisten-Ausführung' };

export default async function ChecklistRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const runRes = await supabase
    .from('checklist_runs')
    .select(
      'id, template_id, work_order_id, status, started_at, started_by, completed_at, completed_by, notes',
    )
    .eq('id', id)
    .maybeSingle();
  const run = unwrapMaybeRow(runRes, 'Checklisten-Durchlauf: checklist_runs');

  if (!run) notFound();

  const [templateRes, itemsRawRes, workOrderRes] = await Promise.all([
    supabase
      .from('checklist_templates')
      .select('id, code, title, description')
      .eq('id', run.template_id)
      .maybeSingle(),
    supabase
      .from('checklist_run_items')
      .select(
        'id, position, kind, label, help_text, required, unit, min_value, max_value, value_bool, value_text, value_number, note, checked_at',
      )
      .eq('run_id', run.id)
      .order('position'),
    run.work_order_id
      ? supabase
          .from('work_orders')
          .select('id, code, title')
          .eq('id', run.work_order_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const template = unwrapMaybeRow(templateRes, 'Checklisten-Durchlauf: checklist_templates');
  const items = unwrapRows(itemsRawRes, 'Checklisten-Durchlauf: checklist_run_items');
  const workOrder = unwrapMaybeRow(workOrderRes, 'Checklisten-Durchlauf: work_orders');

  const status = run.status as ChecklistRunStatus;
  const isOpen = status === 'in_progress';

  const photoItemIds = items.filter((it) => it.kind === 'photo').map((it) => it.id);
  const photoDocsRes =
    photoItemIds.length > 0
      ? await supabase
          .from('documents')
          .select(
            'id, kind, storage_path, original_filename, mime_type, byte_size, caption, created_at, uploaded_by, entity_id',
          )
          .eq('entity_type', 'checklist_run_item')
          .in('entity_id', photoItemIds)
          .order('created_at', { ascending: false })
      : { data: [], error: null };
  const photoDocs = unwrapRows(photoDocsRes, 'Checklisten-Durchlauf: documents');
  const docsByItem = new Map<string, DocumentRow[]>();
  for (const doc of photoDocs) {
    const { entity_id, ...rest } = doc;
    const arr = docsByItem.get(entity_id) ?? [];
    arr.push(rest as DocumentRow);
    docsByItem.set(entity_id, arr);
  }

  const docCountFor = (id: string) => docsByItem.get(id)?.length ?? 0;
  const answeredCount = items.filter((it) => isRunItemAnswered(it, docCountFor(it.id))).length;
  const requiredMissing = items
    .filter((it) => it.required && !isRunItemAnswered(it, docCountFor(it.id)))
    .map((it) => it.label);
  const canComplete = isOpen && requiredMissing.length === 0;

  const userIds = [run.started_by, run.completed_by].filter((v): v is string => Boolean(v));
  const usersRes =
    userIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', userIds)
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Checklisten-Durchlauf: users');
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader
        title={template?.title ?? 'Checkliste'}
        description={template?.code ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={RUN_STATUS_TONE[status]}>{RUN_STATUS_LABEL[status]}</Badge>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {answeredCount} / {items.length} beantwortet
        </span>
        {workOrder && (
          <ModuleLink
            href={`/work-orders/${workOrder.id}`}
            className="text-xs text-[var(--color-primary)] hover:underline"
            unavailableClassName="text-xs text-[var(--color-muted-foreground)]"
          >
            → Auftrag {workOrder.code ?? workOrder.title}
          </ModuleLink>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <Row label="Gestartet">
              {formatDateTime(run.started_at)}
              {run.started_by && (
                <span className="text-[var(--color-muted-foreground)]">
                  {' · '}
                  {displayById.get(run.started_by) ?? '—'}
                </span>
              )}
            </Row>
            {run.completed_at && (
              <Row label={status === 'cancelled' ? 'Abgebrochen' : 'Abgeschlossen'}>
                {formatDateTime(run.completed_at)}
                {run.completed_by && (
                  <span className="text-[var(--color-muted-foreground)]">
                    {' · '}
                    {displayById.get(run.completed_by) ?? '—'}
                  </span>
                )}
              </Row>
            )}
          </dl>
        </CardBody>
      </Card>

      <div className="flex flex-col gap-3">
        {items.map((item) => {
          const kind = item.kind as ChecklistItemKind;
          const itemDocs = docsByItem.get(item.id) ?? [];
          const answered = isRunItemAnswered(item, itemDocs.length);
          return (
            <Card key={item.id}>
              <CardBody>
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className={
                      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ' +
                      (answered
                        ? 'bg-[color-mix(in_srgb,var(--color-success)_18%,transparent)] text-[var(--color-success)]'
                        : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')
                    }
                  >
                    {answered ? '✓' : item.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.label}</span>
                      <Badge tone="muted">{KIND_LABEL[kind]}</Badge>
                      {item.required && <Badge tone="warning">Pflicht</Badge>}
                    </div>
                    {item.help_text && (
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {item.help_text}
                      </p>
                    )}
                  </div>
                </div>

                {isOpen ? (
                  kind === 'photo' ? (
                    <div className="flex flex-col gap-3">
                      <DocumentList
                        documents={itemDocs}
                        canDelete={true}
                        emptyLabel="Noch keine Fotos hochgeladen."
                      />
                      <DocumentUploader
                        entityType="checklist_run_item"
                        entityId={item.id}
                        accept="image/*"
                        label="Foto anhängen"
                        compact
                      />
                    </div>
                  ) : (
                    <form action={updateRunItemAction} className="flex flex-col gap-2">
                      <input type="hidden" name="item_id" value={item.id} />
                      <input type="hidden" name="run_id" value={run.id} />
                      <input type="hidden" name="kind" value={kind} />

                      {kind === 'check' && (
                        <div className="flex gap-2">
                          <BoolButton
                            value="true"
                            selected={item.value_bool === true}
                            tone="success"
                          >
                            OK
                          </BoolButton>
                          <BoolButton
                            value="false"
                            selected={item.value_bool === false}
                            tone="danger"
                          >
                            Nicht OK
                          </BoolButton>
                        </div>
                      )}

                      {kind === 'text' && (
                        <textarea
                          name="value_text"
                          rows={2}
                          defaultValue={item.value_text ?? ''}
                          placeholder="Antwort eingeben …"
                          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                        />
                      )}

                      {kind === 'number' && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="any"
                            name="value_number"
                            defaultValue={item.value_number ?? ''}
                            placeholder="Wert"
                            className="h-9 w-40 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                          />
                          {item.unit && (
                            <span className="text-sm text-[var(--color-muted-foreground)]">
                              {item.unit}
                            </span>
                          )}
                          {(item.min_value !== null || item.max_value !== null) && (
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              (Sollbereich {item.min_value !== null ? `≥ ${item.min_value}` : ''}
                              {item.min_value !== null && item.max_value !== null ? ' · ' : ''}
                              {item.max_value !== null ? `≤ ${item.max_value}` : ''})
                            </span>
                          )}
                        </div>
                      )}

                      <input
                        type="text"
                        name="note"
                        defaultValue={item.note ?? ''}
                        placeholder="Notiz (optional)"
                        className="h-8 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs"
                      />

                      <div className="flex items-center justify-between gap-2">
                        {item.checked_at && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            Zuletzt bearbeitet {formatDateTime(item.checked_at)}
                          </span>
                        )}
                        <button
                          type="submit"
                          className="ml-auto inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                        >
                          Speichern
                        </button>
                      </div>
                    </form>
                  )
                ) : kind === 'photo' ? (
                  <DocumentList
                    documents={itemDocs}
                    canDelete={false}
                    emptyLabel="Kein Foto vorhanden."
                  />
                ) : (
                  <ReadOnlyAnswer item={item} kind={kind} />
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {isOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Abschluss</CardTitle>
          </CardHeader>
          <CardBody>
            {requiredMissing.length > 0 && (
              <div className="mb-3 rounded-md border border-[var(--color-warning)]/40 bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-3 py-2 text-sm text-[var(--color-warning)]">
                Noch offen: {requiredMissing.slice(0, 3).join(', ')}
                {requiredMissing.length > 3 ? ' …' : ''}
              </div>
            )}
            <form action={completeRunAction} className="flex flex-col gap-2">
              <input type="hidden" name="run_id" value={run.id} />
              <textarea
                name="notes"
                rows={2}
                defaultValue={run.notes ?? ''}
                placeholder="Abschluss-Notiz (optional)"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <form action={cancelRunAction}>
                  <input type="hidden" name="run_id" value={run.id} />
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                  >
                    Abbrechen
                  </button>
                </form>
                <button
                  type="submit"
                  disabled={!canComplete}
                  className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-40"
                >
                  Ausführung abschließen
                </button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {!isOpen && run.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Abschluss-Notiz</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{run.notes}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function BoolButton({
  value,
  selected,
  tone,
  children,
}: {
  value: string;
  selected: boolean;
  tone: 'success' | 'danger';
  children: React.ReactNode;
}) {
  const base = 'inline-flex h-9 items-center rounded-md px-4 text-sm font-medium';
  const cls = selected
    ? tone === 'success'
      ? 'bg-[var(--color-success)] text-white'
      : 'bg-[var(--color-destructive)] text-white'
    : 'border border-[var(--color-border)] hover:bg-[var(--color-muted)]';
  return (
    <button type="submit" name="value_bool" value={value} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}

function ReadOnlyAnswer({
  item,
  kind,
}: {
  item: {
    value_bool: boolean | null;
    value_text: string | null;
    value_number: number | null;
    unit: string | null;
    note: string | null;
  };
  kind: ChecklistItemKind;
}) {
  let display: React.ReactNode = (
    <span className="text-[var(--color-muted-foreground)]">Keine Antwort</span>
  );
  if (kind === 'check' && item.value_bool !== null) {
    display = item.value_bool ? (
      <span className="font-medium text-[var(--color-success)]">OK</span>
    ) : (
      <span className="font-medium text-[var(--color-destructive)]">Nicht OK</span>
    );
  } else if ((kind === 'text' || kind === 'photo') && item.value_text) {
    display = <span className="whitespace-pre-line">{item.value_text}</span>;
  } else if (kind === 'number' && item.value_number !== null) {
    display = (
      <span className="font-medium">
        {item.value_number}
        {item.unit ? ` ${item.unit}` : ''}
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      {display}
      {item.note && (
        <p className="text-xs text-[var(--color-muted-foreground)]">Notiz: {item.note}</p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
