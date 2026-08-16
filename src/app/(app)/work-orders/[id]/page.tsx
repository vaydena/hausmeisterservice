import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ModuleLink } from '@/components/ui/module-link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITY_LABEL,
  type WorkOrderStatus,
} from '@/lib/schemas/work-orders';
import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  type ChecklistRunStatus,
} from '@/lib/schemas/checklists';
import { setWorkOrderStatusAction, assignWorkOrderAction } from '../actions';
import { startRunAction } from '../../checklist-runs/actions';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList, type DocumentRow } from '@/components/documents/document-list';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Auftrag' };

const STATUS_TONE: Record<
  WorkOrderStatus,
  'primary' | 'neutral' | 'warning' | 'danger' | 'success' | 'muted'
> = {
  new: 'primary',
  planned: 'neutral',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
  cancelled: 'muted',
};

export default async function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const woRes = await supabase
    .from('work_orders')
    .select(
      'id, code, title, description, category, priority, status, property_id, building_id, unit_id, assignee_id, planned_start, planned_end, deadline, estimated_minutes, is_emergency, created_at, closed_at, updated_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const wo = unwrapMaybeRow(woRes, 'Auftraege: work_orders');

  if (!wo) notFound();

  const [propertyRes, eventsRes, activeEmployeesRes, runsRes, templatesRes] = await Promise.all([
    supabase.from('properties').select('id, code, name').eq('id', wo.property_id).maybeSingle(),
    supabase
      .from('work_order_events')
      .select('id, event_kind, old_value, new_value, comment, actor_id, created_at')
      .eq('work_order_id', wo.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('employees')
      .select('id, user_id, employment_status')
      .eq('employment_status', 'active'),
    supabase
      .from('checklist_runs')
      .select('id, template_id, status, started_at, completed_at')
      .eq('work_order_id', wo.id)
      .order('started_at', { ascending: false }),
    supabase
      .from('checklist_templates')
      .select('id, code, title')
      .eq('active', true)
      .is('deleted_at', null)
      .order('title'),
  ]);
  const property = unwrapMaybeRow(propertyRes, 'Auftraege: properties');
  const events = unwrapRows(eventsRes, 'Auftraege: work_order_events');
  const activeEmployees = unwrapRows(activeEmployeesRes, 'Auftraege: employees');
  const runs = unwrapRows(runsRes, 'Auftraege: checklist_runs');
  const templates = unwrapRows(templatesRes, 'Auftraege: auswaehlbare Checklisten-Vorlagen');

  const docsRes = await supabase
    .from('documents')
    .select(
      'id, kind, storage_path, original_filename, mime_type, byte_size, caption, created_at, uploaded_by',
    )
    .eq('entity_type', 'work_order')
    .eq('entity_id', wo.id)
    .order('created_at', { ascending: false });
  const docs = unwrapRows(docsRes, 'Auftraege: documents');

  const runTemplateIds = [...new Set(runs.map((r) => r.template_id))];
  const runTemplatesRes =
    runTemplateIds.length > 0
      ? await supabase
          .from('checklist_templates')
          .select('id, title, code')
          .in('id', runTemplateIds)
      : { data: [], error: null };
  const runTemplates = unwrapRows(runTemplatesRes, 'Auftraege: Vorlagen der laufenden Durchlaeufe');
  const templateById = new Map(runTemplates.map((t) => [t.id, t]));

  const employeeIds = activeEmployees.map((e) => e.id);
  const userIds = activeEmployees.map((e) => e.user_id);
  const actorIds = [
    ...new Set(events.map((e) => e.actor_id).filter((v): v is string => Boolean(v))),
  ];
  const allUserIds = [...new Set([...userIds, ...actorIds])];

  const usersRes =
    allUserIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', allUserIds)
      : { data: [], error: null };
  const users = unwrapRows(usersRes, 'Auftraege: users');
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));

  const employeeById = new Map(
    activeEmployees.map((e) => [e.id, displayById.get(e.user_id) ?? '(Ohne Namen)']),
  );
  const currentAssigneeName = wo.assignee_id ? employeeById.get(wo.assignee_id) : null;

  const canEdit = permissions.has('work_orders.edit');
  const canAssign = permissions.has('work_orders.assign');
  const canClose = permissions.has('work_orders.close');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={wo.title}
        description={
          wo.code
            ? `${wo.code}${wo.category ? ` · ${wo.category}` : ''}`
            : (wo.category ?? undefined)
        }
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/work-orders/${wo.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[wo.status as WorkOrderStatus] ?? 'neutral'}>
          {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
        </Badge>
        {wo.priority !== 'normal' && (
          <Badge tone={wo.priority === 'emergency' ? 'danger' : 'warning'}>
            {PRIORITY_LABEL[wo.priority as keyof typeof PRIORITY_LABEL] ?? wo.priority}
          </Badge>
        )}
        {wo.is_emergency && <Badge tone="danger">Notfall</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {wo.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{wo.description}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Checklisten</CardTitle>
            </CardHeader>
            <CardBody>
              {runs.length === 0 ? (
                <p className="mb-3 text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Checkliste an diesen Auftrag gehängt.
                </p>
              ) : (
                <ul className="mb-3 flex flex-col gap-2">
                  {runs.map((r) => {
                    const tpl = templateById.get(r.template_id);
                    return (
                      <li key={r.id}>
                        <ModuleLink
                          href={`/checklist-runs/${r.id}`}
                          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3 hover:bg-[var(--color-muted)]"
                          unavailableClassName="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3"
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-medium">
                              {tpl?.title ?? 'Checkliste'}
                            </span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              Gestartet {formatDateTime(r.started_at)}
                              {r.completed_at &&
                                ` · abgeschlossen ${formatDateTime(r.completed_at)}`}
                            </span>
                          </div>
                          <Badge tone={RUN_STATUS_TONE[r.status as ChecklistRunStatus]}>
                            {RUN_STATUS_LABEL[r.status as ChecklistRunStatus]}
                          </Badge>
                        </ModuleLink>
                      </li>
                    );
                  })}
                </ul>
              )}

              {canEdit && templates.length > 0 && (
                <form action={startRunAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="work_order_id" value={wo.id} />
                  <select
                    name="template_id"
                    required
                    defaultValue=""
                    className="h-9 flex-1 min-w-[200px] rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
                  >
                    <option value="" disabled>
                      Checkliste wählen …
                    </option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code ? `${t.code} · ${t.title}` : t.title}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
                  >
                    Anhängen &amp; starten
                  </button>
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fotos &amp; Anhänge</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <DocumentList
                documents={docs as DocumentRow[]}
                canDelete={canEdit || permissions.has('documents.delete')}
                emptyLabel="Noch keine Fotos oder Dokumente angehängt."
              />
              {(canEdit || permissions.has('documents.create')) && (
                <DocumentUploader entityType="work_order" entityId={wo.id} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verlauf</CardTitle>
            </CardHeader>
            <CardBody>
              {events.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Noch keine Einträge.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex flex-col gap-1 border-l-2 border-[var(--color-border)] pl-3"
                    >
                      <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                        <span>{formatDateTime(ev.created_at)}</span>
                        {ev.actor_id && (
                          <>
                            <span>·</span>
                            <span>{displayById.get(ev.actor_id) ?? 'System'}</span>
                          </>
                        )}
                      </div>
                      <p className="text-sm">{describeEvent(ev)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Objekt</CardTitle>
            </CardHeader>
            <CardBody>
              {property ? (
                <ModuleLink
                  href={`/properties/${property.id}`}
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                  unavailableClassName="text-sm font-medium"
                >
                  {property.code ? `${property.code} · ${property.name}` : property.name}
                </ModuleLink>
              ) : (
                <span className="text-sm text-[var(--color-muted-foreground)]">–</span>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Zuweisung</CardTitle>
            </CardHeader>
            <CardBody>
              {canAssign ? (
                <form action={assignWorkOrderAction} className="flex flex-col gap-2">
                  <input type="hidden" name="work_order_id" value={wo.id} />
                  <select
                    name="assignee_id"
                    defaultValue={wo.assignee_id ?? ''}
                    className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm"
                  >
                    <option value="">Noch niemand</option>
                    {employeeIds.map((eid) => (
                      <option key={eid} value={eid}>
                        {employeeById.get(eid) ?? '(Ohne Namen)'}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                  >
                    Zuweisung speichern
                  </button>
                </form>
              ) : (
                <p className="text-sm">
                  {currentAssigneeName ?? (
                    <span className="text-[var(--color-muted-foreground)]">Nicht zugewiesen</span>
                  )}
                </p>
              )}
            </CardBody>
          </Card>

          {canClose && (
            <Card>
              <CardHeader>
                <CardTitle>Status ändern</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-2">
                  {STATUS_ORDER.map((s) => (
                    <form key={s} action={setWorkOrderStatusAction}>
                      <input type="hidden" name="work_order_id" value={wo.id} />
                      <input type="hidden" name="status" value={s} />
                      <button
                        type="submit"
                        disabled={s === wo.status}
                        className={
                          'w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-left text-sm transition ' +
                          (s === wo.status
                            ? 'cursor-not-allowed bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
                            : 'hover:bg-[var(--color-muted)]')
                        }
                      >
                        → {STATUS_LABEL[s]}
                      </button>
                    </form>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Termine</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <TermRow label="Angelegt">{formatDateTime(wo.created_at)}</TermRow>
                {wo.planned_start && (
                  <TermRow label="Start (geplant)">{formatDateTime(wo.planned_start)}</TermRow>
                )}
                {wo.planned_end && (
                  <TermRow label="Ende (geplant)">{formatDateTime(wo.planned_end)}</TermRow>
                )}
                {wo.deadline && <TermRow label="Deadline">{formatDateTime(wo.deadline)}</TermRow>}
                {wo.estimated_minutes !== null && (
                  <TermRow label="Geschätzt">{wo.estimated_minutes} Min</TermRow>
                )}
                {wo.closed_at && <TermRow label="Erledigt">{formatDateTime(wo.closed_at)}</TermRow>}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TermRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

type EventRow = {
  event_kind: string;
  old_value: unknown;
  new_value: unknown;
  comment: string | null;
};

function describeEvent(ev: EventRow): string {
  const nv = ev.new_value as Record<string, unknown> | null;
  const ov = ev.old_value as Record<string, unknown> | null;
  switch (ev.event_kind) {
    case 'created':
      return `Auftrag angelegt (${(nv?.status as string) ?? '–'}, ${(nv?.priority as string) ?? '–'})`;
    case 'status_change':
      return `Status: ${statusLabelOf(ov?.status)} → ${statusLabelOf(nv?.status)}`;
    case 'assignment':
      return `Zuweisung geändert${nv?.assignee_id ? '' : ' (entfernt)'}`;
    case 'comment':
      return ev.comment ?? 'Kommentar';
    case 'attachment':
      return 'Anhang hinzugefügt';
    default:
      return ev.event_kind;
  }
}

function statusLabelOf(v: unknown): string {
  if (typeof v !== 'string') return '–';
  return STATUS_LABEL[v as WorkOrderStatus] ?? v;
}
