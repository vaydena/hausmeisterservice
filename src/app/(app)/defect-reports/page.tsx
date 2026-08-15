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
  STATUS_TONE,
  PRIORITY_LABEL,
  REPORTER_KIND_LABEL,
  defectReportStatusSchema,
  type DefectReportStatus,
} from '@/lib/schemas/defect-reports';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Mängelmeldungen' };

const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  emergency: 'danger',
};

const DEFAULT_TAB: DefectReportStatus = 'new';

export default async function DefectReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; property_id?: string }>;
}) {
  const params = await searchParams;
  const tab = (() => {
    const parsed = defectReportStatusSchema.safeParse(params.status);
    return parsed.success ? parsed.data : DEFAULT_TAB;
  })();

  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const [propertiesForFilterRes, countsRes] = await Promise.all([
    supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('defect_reports').select('status', { head: false }),
  ]);
  const propertiesForFilter = unwrapRows(
    propertiesForFilterRes,
    'Maengelmeldungen: Objekte fuer den Filter',
  );

  // Sprint 112: Wie bei den Auftraegen — verschluckt steht ueber jedem
  // Status-Tab eine Null. Bei Maengelmeldungen faellt das schwerer ins
  // Gewicht, weil der Tab "Neu" die Eingangsschlange der Bewohner ist: eine
  // Null dort heisst "nichts Neues gemeldet", waehrend die Meldungen
  // unbearbeitet liegen bleiben.
  const counts: Record<string, number> = {};
  for (const row of unwrapRows(countsRes, 'Maengelmeldungen: Anzahl je Status')) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }

  let query = supabase
    .from('defect_reports')
    .select(
      'id, code, title, priority, status, property_id, reporter_kind, reporter_name, created_at',
    )
    .eq('status', tab)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (params.property_id) query = query.eq('property_id', params.property_id);

  const reportsRes = await query;
  const items = unwrapRows(reportsRes, 'Maengelmeldungen');

  const propertyIds = [...new Set(items.map((r) => r.property_id))];
  const propsRes =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, name, code').in('id', propertyIds)
      : { data: [], error: null };
  const props = unwrapRows(propsRes, 'Maengelmeldungen: Objektnamen zur Liste');
  const propertyById = new Map(props.map((p) => [p.id, p]));

  const canCreate = permissions.has('defect_reports.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Mängelmeldungen"
        description="Meldungen von Bewohnern, Eigentümern oder Personal — geprüft und in Aufträge überführt."
        action={
          canCreate ? <LinkButton href="/defect-reports/new">Neue Meldung</LinkButton> : undefined
        }
      />

      <StatusTabs current={tab} counts={counts} propertyId={params.property_id} />

      {propertiesForFilter.length > 0 && (
        <PropertyFilter
          properties={propertiesForFilter}
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
              <LinkButton href="/defect-reports/new">Erste Meldung erfassen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((r) => {
              const property = propertyById.get(r.property_id);
              return (
                <li key={r.id}>
                  <Link
                    href={`/defect-reports/${r.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.code && <Badge tone="muted">{r.code}</Badge>}
                        <span className="truncate font-medium">{r.title}</span>
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {' · '}
                        {REPORTER_KIND_LABEL[r.reporter_kind as keyof typeof REPORTER_KIND_LABEL] ??
                          r.reporter_kind}
                        {r.reporter_name ? ` (${r.reporter_name})` : ''}
                        {' · '}
                        {formatDateTime(r.created_at)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.priority !== 'normal' && (
                        <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>
                          {PRIORITY_LABEL[r.priority as keyof typeof PRIORITY_LABEL] ?? r.priority}
                        </Badge>
                      )}
                      <Badge tone={STATUS_TONE[r.status as DefectReportStatus] ?? 'neutral'}>
                        {STATUS_LABEL[r.status as DefectReportStatus] ?? r.status}
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
  current: DefectReportStatus;
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
            href={`/defect-reports?${params.toString()}`}
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
  currentTab: DefectReportStatus;
}) {
  return (
    <form
      action="/defect-reports"
      method="get"
      className="flex flex-wrap items-center gap-2 text-sm"
    >
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
          href={`/defect-reports?status=${currentTab}`}
          className="text-xs text-[var(--color-muted-foreground)] underline"
        >
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}

function emptyTitle(tab: DefectReportStatus): string {
  return tab === 'new'
    ? 'Keine offenen Meldungen'
    : `Keine Meldungen im Status „${STATUS_LABEL[tab]}"`;
}

function emptyDescription(tab: DefectReportStatus): string {
  switch (tab) {
    case 'new':
      return 'Neue Meldungen von Bewohnern, Eigentümern oder Personal erscheinen hier zur Prüfung.';
    case 'reviewing':
      return 'Meldungen, die aktuell geprüft werden.';
    case 'converted':
      return 'Meldungen, die in einen Auftrag überführt wurden.';
    case 'rejected':
      return 'Meldungen, die als nicht relevant abgelehnt wurden.';
  }
}
