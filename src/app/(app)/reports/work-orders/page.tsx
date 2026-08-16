import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select, Field } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDuration, formatMinutes, parsePeriodRange } from '@/lib/reports/utils';
import { formatDate } from '@/lib/utils/format';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Auftragsbericht' };

const STATUS_TONE: Record<
  string,
  'muted' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
> = {
  open: 'warning',
  in_progress: 'primary',
  on_hold: 'muted',
  completed: 'success',
  cancelled: 'muted',
  closed: 'success',
  done: 'success',
};

export default async function WorkOrdersReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.view')) notFound();

  // Sprint 113: Zeitfenster jetzt Berliner Kalendertage, Ende exklusiv.
  const { from, to, startIso, endIso } = parsePeriodRange(sp);
  const propertyId = sp['property'] ?? '';

  const supabase = await createSupabaseServerClient();

  let q = supabase
    .from('work_orders')
    .select(
      'id, code, title, status, priority, is_emergency, property_id, assignee_id, created_at, closed_at, actual_minutes, estimated_minutes',
    )
    .is('deleted_at', null)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false });
  if (propertyId) q = q.eq('property_id', propertyId);

  const [rowsRes, propertiesRes] = await Promise.all([
    q,
    supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
  ]);
  const list = unwrapRows(rowsRes, 'Auswertungen: Auftragszeilen des Berichts');
  const properties = unwrapRows(propertiesRes, 'Auswertungen: properties');

  const propById = new Map(properties.map((p) => [p.id, p.name]));

  const statusCounts = list.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] ?? 0) + 1;
    return acc;
  }, {});
  const closedList = list.filter((o) => o.closed_at);
  const avgLeadMs =
    closedList.length > 0
      ? closedList.reduce((sum, o) => {
          const start = new Date(o.created_at).getTime();
          const end = new Date(o.closed_at!).getTime();
          return sum + Math.max(0, end - start);
        }, 0) / closedList.length
      : 0;
  const inTimeCount = list.filter(
    (o) =>
      o.closed_at &&
      o.actual_minutes !== null &&
      o.estimated_minutes !== null &&
      o.actual_minutes <= o.estimated_minutes,
  ).length;
  const inTimeRate =
    closedList.length > 0 ? Math.round((inTimeCount / closedList.length) * 100) : null;

  const canDownload = permissions.has('reporting.download');
  const csvQuery = new URLSearchParams({
    from,
    to,
    ...(propertyId ? { property: propertyId } : {}),
  }).toString();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Auftragsbericht"
        description={`${list.length} Aufträge im Zeitraum ${from} – ${to}`}
        action={
          canDownload ? (
            <Link
              href={`/reports/work-orders/export?${csvQuery}`}
              className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90"
            >
              CSV-Export
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardBody>
          <form className="grid gap-4 md:grid-cols-4" method="get">
            <Field label="Von" htmlFor="from">
              <Input id="from" name="from" type="date" defaultValue={from} />
            </Field>
            <Field label="Bis" htmlFor="to">
              <Input id="to" name="to" type="date" defaultValue={to} />
            </Field>
            <Field label="Objekt" htmlFor="property" optional>
              <Select id="property" name="property" defaultValue={propertyId}>
                <option value="">Alle</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:opacity-90"
              >
                Anwenden
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi title="Aufträge gesamt" value={String(list.length)} />
        <Kpi title="Abgeschlossen" value={String(closedList.length)} />
        <Kpi title="Ø Durchlaufzeit" value={formatDuration(avgLeadMs)} />
        <Kpi
          title="In-Time-Quote"
          value={inTimeRate === null ? '—' : `${inTimeRate}%`}
          accent={inTimeRate !== null && inTimeRate < 70 ? 'warning' : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status-Verteilung</CardTitle>
        </CardHeader>
        <CardBody>
          {Object.keys(statusCounts).length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Keine Einträge im Zeitraum.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([s, n]) => (
                <Badge key={s} tone={STATUS_TONE[s] ?? 'neutral'}>
                  {s}: {n}
                </Badge>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details ({list.length})</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--color-border)] text-xs uppercase text-[var(--color-muted-foreground)]">
              <tr>
                <th className="pb-2 pr-4">Code</th>
                <th className="pb-2 pr-4">Titel</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Objekt</th>
                <th className="pb-2 pr-4">Erstellt</th>
                <th className="pb-2 pr-4">Geschlossen</th>
                <th className="pb-2 pr-4">Durchlauf</th>
                <th className="pb-2 pr-4">Ist / Soll</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {list.map((o) => {
                const lead = o.closed_at
                  ? formatDuration(
                      new Date(o.closed_at).getTime() - new Date(o.created_at).getTime(),
                    )
                  : '—';
                return (
                  <tr key={o.id}>
                    <td className="py-2 pr-4 font-mono text-xs">{o.code}</td>
                    <td className="py-2 pr-4">
                      <ModuleLink
                        href={`/work-orders/${o.id}`}
                        className="hover:text-[var(--color-primary)]"
                      >
                        {o.title}
                      </ModuleLink>
                      {o.is_emergency && (
                        <span className="ml-2 text-xs text-[var(--color-destructive)]">⚡</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {propById.get(o.property_id ?? '') ?? '—'}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {formatDate(o.created_at)}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {o.closed_at ? formatDate(o.closed_at) : '—'}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{lead}</td>
                    <td className="py-2 pr-4 text-xs tabular-nums">
                      {formatMinutes(o.actual_minutes)} / {formatMinutes(o.estimated_minutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && (
            <p className="py-4 text-sm text-[var(--color-muted-foreground)]">
              Keine Aufträge im gewählten Zeitraum.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: 'warning' | 'danger';
}) {
  const accentClass =
    accent === 'warning'
      ? 'text-[var(--color-warning)]'
      : accent === 'danger'
        ? 'text-[var(--color-destructive)]'
        : 'text-[var(--color-foreground)]';
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
          {title}
        </p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
      </CardBody>
    </Card>
  );
}
