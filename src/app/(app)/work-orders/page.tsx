import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_ORDER,
  PRIORITY_LABEL,
  workOrderStatusSchema,
  type WorkOrderStatus,
} from '@/lib/schemas/work-orders';

export const metadata: Metadata = { title: 'Aufträge' };

const STATUS_TONE: Record<WorkOrderStatus, 'primary' | 'neutral' | 'warning' | 'danger' | 'success' | 'muted'> = {
  new: 'primary',
  planned: 'neutral',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
  cancelled: 'muted',
};

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  emergency: 'danger',
};

const DEFAULT_TAB: WorkOrderStatus = 'new';

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property_id?: string }>;
}) {
  const params = await searchParams;
  const tab = (() => {
    const parsed = workOrderStatusSchema.safeParse(params.status);
    return parsed.success ? parsed.data : DEFAULT_TAB;
  })();

  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const [{ data: propertiesForFilter }, countsRes] = await Promise.all([
    supabase
      .from('properties')
      .select('id, name')
      .is('deleted_at', null)
      .order('name'),
    supabase
      .from('work_orders')
      .select('status', { head: false })
      .is('deleted_at', null),
  ]);

  const counts: Record<string, number> = {};
  for (const row of countsRes.data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1;

  let query = supabase
    .from('work_orders')
    .select(
      'id, code, title, priority, status, property_id, assignee_id, created_at, planned_start, deadline, is_emergency',
    )
    .eq('status', tab)
    .is('deleted_at', null)
    .order('is_emergency', { ascending: false })
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (params.property_id) query = query.eq('property_id', params.property_id);

  const { data: orders } = await query;
  const items = orders ?? [];

  const propertyIds = [...new Set(items.map((o) => o.property_id))];
  const { data: props } =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, name, code').in('id', propertyIds)
      : { data: [] };
  const propertyById = new Map((props ?? []).map((p) => [p.id, p]));

  const canCreate = permissions.has('work_orders.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Aufträge"
        description="Alle Aufträge nach Status. Notfälle und hohe Priorität stehen oben."
        action={
          canCreate ? <LinkButton href="/work-orders/new">Neuer Auftrag</LinkButton> : undefined
        }
      />

      <StatusTabs current={tab} counts={counts} propertyId={params.property_id} />

      {(propertiesForFilter?.length ?? 0) > 0 && (
        <PropertyFilter
          properties={propertiesForFilter ?? []}
          currentPropertyId={params.property_id}
          currentTab={tab}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          title={emptyTitle(tab)}
          description={emptyDescription(tab)}
          action={
            canCreate && tab === 'new' ? (
              <LinkButton href="/work-orders/new">Ersten Auftrag anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((wo) => {
              const property = propertyById.get(wo.property_id);
              return (
                <li key={wo.id}>
                  <Link
                    href={`/work-orders/${wo.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {wo.code && <Badge tone="muted">{wo.code}</Badge>}
                        <span className="truncate font-medium">{wo.title}</span>
                        {wo.is_emergency && <Badge tone="danger">Notfall</Badge>}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {wo.deadline && ` · Deadline ${formatDateTime(wo.deadline)}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {wo.priority !== 'normal' && (
                        <Badge tone={PRIORITY_TONE[wo.priority] ?? 'neutral'}>
                          {PRIORITY_LABEL[wo.priority as keyof typeof PRIORITY_LABEL] ?? wo.priority}
                        </Badge>
                      )}
                      <Badge tone={STATUS_TONE[wo.status as WorkOrderStatus] ?? 'neutral'}>
                        {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function StatusTabs({
  current,
  counts,
  propertyId,
}: {
  current: WorkOrderStatus;
  counts: Record<string, number>;
  propertyId?: string;
}) {
  return (
    <nav className="-mx-1 flex flex-wrap gap-1 overflow-x-auto">
      {STATUS_ORDER.map((s) => {
        const active = s === current;
        const params = new URLSearchParams();
        params.set('status', s);
        if (propertyId) params.set('property_id', propertyId);
        return (
          <Link
            key={s}
            href={`/work-orders?${params.toString()}`}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ' +
              (active
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')
            }
          >
            {STATUS_LABEL[s]}
            {(counts[s] ?? 0) > 0 && (
              <span
                className={
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs ' +
                  (active ? 'bg-white/20' : 'bg-[var(--color-muted)]')
                }
              >
                {counts[s]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function PropertyFilter({
  properties,
  currentPropertyId,
  currentTab,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentTab: WorkOrderStatus;
}) {
  return (
    <form action="/work-orders" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="status" value={currentTab} />
      <label htmlFor="property_id" className="text-[var(--color-muted-foreground)]">
        Objekt:
      </label>
      <select
        id="property_id"
        name="property_id"
        defaultValue={currentPropertyId ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {currentPropertyId && (
        <Link
          href={`/work-orders?status=${currentTab}`}
          className="text-xs text-[var(--color-muted-foreground)] underline"
        >
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}

function emptyTitle(tab: WorkOrderStatus): string {
  return tab === 'new'
    ? 'Keine neuen Aufträge'
    : `Keine Aufträge im Status „${STATUS_LABEL[tab]}"`;
}

function emptyDescription(tab: WorkOrderStatus): string {
  switch (tab) {
    case 'new':
      return 'Sobald neue Aufträge angelegt werden, erscheinen sie hier – vor jeder Zuweisung.';
    case 'planned':
      return 'Aufträge, die eingeplant, aber noch nicht begonnen wurden.';
    case 'in_progress':
      return 'Aufträge, die gerade in Bearbeitung sind.';
    case 'blocked':
      return 'Aufträge, die aktuell nicht weiterlaufen können.';
    case 'done':
      return 'Abgeschlossene Aufträge der letzten Zeit.';
    case 'cancelled':
      return 'Verworfene oder abgebrochene Aufträge.';
  }
}
