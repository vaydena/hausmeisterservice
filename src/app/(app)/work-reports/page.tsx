import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  WORK_REPORT_STATUSES,
  WORK_REPORT_STATUS_LABEL,
  WORK_REPORT_STATUS_TONE,
  formatWorkedTime,
  type WorkReportStatus,
} from '@/lib/schemas/work-reports';

export const metadata: Metadata = { title: 'Arbeitsberichte' };

function deDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

export default async function WorkReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('work_reports.view')) notFound();

  const supabase = await createSupabaseServerClient();

  const propertiesForFilter = unwrapRows(
    await supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    'Arbeitsberichte: Objektfilter',
  );

  let query = supabase
    .from('work_reports')
    .select('id, code, title, property_id, performed_on, status, minutes_worked')
    .is('deleted_at', null)
    .order('performed_on', { ascending: false })
    .limit(200);

  if (params.property_id) query = query.eq('property_id', params.property_id);
  if (params.status && (WORK_REPORT_STATUSES as readonly string[]).includes(params.status)) {
    query = query.eq('status', params.status);
  }

  const items = unwrapRows(await query, 'Arbeitsberichte');

  const propertyIds = [...new Set(items.map((r) => r.property_id))];
  const props =
    propertyIds.length > 0
      ? unwrapRows(
          await supabase.from('properties').select('id, name, code').in('id', propertyIds),
          'Arbeitsberichte: Objektnamen',
        )
      : [];
  const propertyById = new Map(props.map((p) => [p.id, p]));

  const canCreate = permissions.has('work_reports.create');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Arbeitsberichte"
        description="Leistungsnachweise mit Unterschrift — als PDF exportierbar."
        action={canCreate ? <LinkButton href="/work-reports/new">Neuer Bericht</LinkButton> : undefined}
      />

      {propertiesForFilter.length > 0 && (
        <ReportFilter
          properties={propertiesForFilter}
          currentPropertyId={params.property_id}
          currentStatus={params.status}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Keine Arbeitsberichte"
          description={
            params.property_id || params.status
              ? 'Für diese Auswahl gibt es keine Berichte.'
              : 'Halten Sie erbrachte Leistungen fest — mit Zeit, Material und Unterschrift des Kunden.'
          }
          action={canCreate ? <LinkButton href="/work-reports/new">Ersten Bericht anlegen</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((r) => {
              const property = propertyById.get(r.property_id);
              const status = r.status as WorkReportStatus;
              return (
                <li key={r.id}>
                  <Link
                    href={`/work-reports/${r.id}`}
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
                        {deDate(r.performed_on)}
                        {r.minutes_worked !== null ? ` · ${formatWorkedTime(r.minutes_worked)}` : ''}
                      </span>
                    </div>
                    <Badge tone={WORK_REPORT_STATUS_TONE[status]}>
                      {WORK_REPORT_STATUS_LABEL[status]}
                    </Badge>
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

function ReportFilter({
  properties,
  currentPropertyId,
  currentStatus,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentStatus?: string;
}) {
  return (
    <form action="/work-reports" method="get" className="flex flex-wrap items-center gap-2 text-sm">
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
      <label htmlFor="status" className="text-[var(--color-muted-foreground)]">
        Status:
      </label>
      <select
        id="status"
        name="status"
        defaultValue={currentStatus ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {WORK_REPORT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {WORK_REPORT_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentPropertyId || currentStatus) && (
        <Link href="/work-reports" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
