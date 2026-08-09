import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { daysAgoIso, formatEuro, formatMinutes, formatNumber, todayIsoDate } from '@/lib/reports/utils';

export const metadata: Metadata = { title: 'Reporting' };

export default async function ReportsPage() {
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('reporting.view')) notFound();

  const supabase = await createSupabaseServerClient();
  const since30 = daysAgoIso(30);
  const today = todayIsoDate();

  const [
    { data: allOrders },
    { data: recentClosed },
    { data: defects },
    { data: materialRows },
    { data: recentMovements },
    { data: plans },
    { data: timeEntries },
  ] = await Promise.all([
    supabase.from('work_orders').select('id, status, is_emergency, created_at, closed_at').is('deleted_at', null),
    supabase
      .from('work_orders')
      .select('created_at, closed_at, actual_minutes, estimated_minutes')
      .not('closed_at', 'is', null)
      .gte('closed_at', since30),
    supabase.from('defect_reports').select('status'),
    supabase.from('materials').select('current_stock, min_stock, unit_cost').is('deleted_at', null),
    supabase
      .from('stock_movements')
      .select('kind, quantity, unit_cost_at_time, occurred_at')
      .gte('occurred_at', since30),
    supabase
      .from('maintenance_plans')
      .select('active, next_due_at, last_completed_at, interval_days')
      .is('deleted_at', null)
      .eq('active', true),
    supabase.from('time_entries').select('start_at, end_at').gte('start_at', since30),
  ]);

  const orders = allOrders ?? [];
  const openOrders = orders.filter((o) => !['completed', 'cancelled', 'closed', 'done'].includes(o.status));
  const emergencyOpen = openOrders.filter((o) => o.is_emergency).length;
  const closedRecent = recentClosed ?? [];
  const avgLeadMs =
    closedRecent.length > 0
      ? closedRecent.reduce((sum, o) => {
          const start = new Date(o.created_at).getTime();
          const end = o.closed_at ? new Date(o.closed_at).getTime() : start;
          return sum + Math.max(0, end - start);
        }, 0) / closedRecent.length
      : 0;
  const avgLeadMinutes = avgLeadMs / 60_000;

  const defectRows = defects ?? [];
  const openDefects = defectRows.filter((d) => d.status === 'open' || d.status === 'in_review').length;

  const mats = materialRows ?? [];
  const belowMin = mats.filter((m) => Number(m.current_stock) < Number(m.min_stock)).length;
  const stockValue = mats.reduce(
    (sum, m) => sum + Number(m.current_stock ?? 0) * Number(m.unit_cost ?? 0),
    0,
  );
  const consumption30 = (recentMovements ?? [])
    .filter((mv) => mv.kind === 'issue')
    .reduce((sum, mv) => sum + Number(mv.quantity ?? 0) * Number(mv.unit_cost_at_time ?? 0), 0);

  const activePlans = plans ?? [];
  const overduePlans = activePlans.filter((p) => p.next_due_at && p.next_due_at < today).length;
  const due7Plans = activePlans.filter((p) => {
    if (!p.next_due_at) return false;
    const in7 = new Date();
    in7.setUTCDate(in7.getUTCDate() + 7);
    return p.next_due_at >= today && p.next_due_at <= in7.toISOString().slice(0, 10);
  }).length;
  const complianceRate =
    activePlans.length > 0
      ? Math.round(((activePlans.length - overduePlans) / activePlans.length) * 100)
      : 100;

  const totalMinutes30 = (timeEntries ?? []).reduce((sum, t) => {
    if (!t.end_at) return sum;
    const ms = new Date(t.end_at).getTime() - new Date(t.start_at).getTime();
    return sum + Math.max(0, ms) / 60_000;
  }, 0);

  const canDownload = permissions.has('reporting.download');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Reporting"
        description="Kennzahlen der letzten 30 Tage — Aufträge, Mängel, Bestand, Wartung, Zeiten."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi title="Offene Aufträge" value={formatNumber(openOrders.length)} accent={emergencyOpen > 0 ? 'danger' : 'muted'} sub={emergencyOpen > 0 ? `${emergencyOpen} Notfall` : undefined} />
        <Kpi title="Ø Durchlaufzeit (30 T.)" value={formatMinutes(avgLeadMinutes)} sub={`${closedRecent.length} abgeschlossen`} />
        <Kpi title="Offene Mängel" value={formatNumber(openDefects)} accent={openDefects > 0 ? 'warning' : 'muted'} sub={`${defectRows.length} gesamt`} />
        <Kpi title="Wartungs-Compliance" value={`${complianceRate}%`} accent={complianceRate < 90 ? 'warning' : 'success'} sub={`${overduePlans} überfällig · ${due7Plans} in 7 T.`} />
        <Kpi title="Bestandswert" value={formatEuro(stockValue)} sub={belowMin > 0 ? `${belowMin} unter Min.` : `${mats.length} Positionen`} accent={belowMin > 0 ? 'warning' : 'muted'} />
        <Kpi title="Materialverbrauch (30 T.)" value={formatEuro(consumption30)} sub="Entnahmen zu Zeitpunkt-Preis" />
        <Kpi title="Erfasste Stunden (30 T.)" value={formatMinutes(totalMinutes30)} sub="Alle Mitarbeiter" />
        <Kpi title="Aktive Wartungspläne" value={formatNumber(activePlans.length)} sub={`Ø Intervall ${Math.round(activePlans.reduce((s, p) => s + (p.interval_days ?? 0), 0) / Math.max(1, activePlans.length))} Tage`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ReportLink href="/reports/work-orders" title="Auftragsbericht" description="Backlog, Durchlaufzeit, Status-Verteilung." download={canDownload} />
        <ReportLink href="/reports/materials" title="Materialbericht" description="Bestand, Verbrauch, Wareneingänge nach Zeitraum." download={canDownload} />
        <ReportLink href="/reports/time" title="Zeitbericht" description="Stunden je Mitarbeiter und Zeitraum." download={canDownload} />
      </div>
    </div>
  );
}

function Kpi({
  title,
  value,
  sub,
  accent = 'muted',
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: 'muted' | 'success' | 'warning' | 'danger';
}) {
  const accentClass =
    accent === 'success'
      ? 'text-[var(--color-success)]'
      : accent === 'warning'
      ? 'text-[var(--color-warning)]'
      : accent === 'danger'
      ? 'text-[var(--color-destructive)]'
      : 'text-[var(--color-foreground)]';
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{sub}</p>}
      </CardBody>
    </Card>
  );
}

function ReportLink({
  href,
  title,
  description,
  download,
}: {
  href: string;
  title: string;
  description: string;
  download: boolean;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4 transition hover:border-[var(--color-primary)] hover:bg-[var(--color-muted)]"
    >
      <h3 className="text-sm font-semibold group-hover:text-[var(--color-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{description}</p>
      {download && (
        <p className="mt-2 text-xs text-[var(--color-primary)]">Ansehen + CSV-Export →</p>
      )}
    </Link>
  );
}
