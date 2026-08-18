import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { STATUS_LABEL as WO_STATUS_LABEL } from '@/lib/schemas/work-orders';
import {
  STATUS_LABEL as DEFECT_STATUS_LABEL,
  STATUS_TONE as DEFECT_STATUS_TONE,
} from '@/lib/schemas/defect-reports';
import { dueBucket, DUE_LABEL, DUE_TONE, intervalLabel } from '@/lib/schemas/maintenance';
import { formatCents, INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE } from '@/lib/schemas/billing';
import { formatDateOnly } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Übersicht · Eigentümer-Portal' };

const OPEN_WORK_ORDER_STATUSES = ['new', 'planned', 'in_progress', 'blocked'];
const OPEN_DEFECT_STATUSES = ['new', 'reviewing'];

// STATUS_TONE fuer work_orders liegt im Repo bewusst in der Staff-Seite, nicht
// im Schema — hier die gleiche Zuordnung lokal (Badge-Tone-Union).
const WO_STATUS_TONE = {
  new: 'primary',
  planned: 'neutral',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
  cancelled: 'muted',
} as const;

export default async function OwnerDashboardPage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));
  const propertyLabel = (propertyId: string): string => {
    const p = propertyById.get(propertyId);
    if (!p) return 'Objekt';
    return p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt');
  };

  const supabase = await createSupabaseServerClient();

  // Alle Reads sind RLS-gefiltert (properties_select_owner &&
  // property_owner_owns_property) — sie liefern ausschliesslich die Objekte
  // dieses Eigentuemers. Deshalb kein manueller property_id-Filter noetig.
  const [workOrdersRes, defectsRes, maintenanceRes, invoicesRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, property_id, code, title, status, is_emergency, created_at')
      .in('status', OPEN_WORK_ORDER_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('defect_reports')
      .select('id, property_id, code, title, status, created_at')
      .in('status', OPEN_DEFECT_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('maintenance_plans')
      .select('id, property_id, title, next_due_at, interval_days, active')
      .eq('active', true)
      .order('next_due_at', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, code, title, status, gross_total_cents, issued_at, due_at, paid_at')
      .order('issued_at', { ascending: false }),
  ]);

  const workOrders = unwrapRows(workOrdersRes, 'Eigentümerportal: offene Aufträge');
  const defects = unwrapRows(defectsRes, 'Eigentümerportal: offene Mängel');
  const maintenance = unwrapRows(maintenanceRes, 'Eigentümerportal: Wartungen');
  const invoices = unwrapRows(invoicesRes, 'Eigentümerportal: Rechnungen');

  const upcomingMaintenance = maintenance
    .map((m) => ({ ...m, bucket: dueBucket(m.next_due_at, m.active) }))
    .filter((m) => m.bucket === 'overdue' || m.bucket === 'due_soon');

  const openInvoices = invoices.filter((i) => i.status === 'sent');
  const openInvoiceTotalCents = openInvoices.reduce(
    (sum, i) => sum + (i.gross_total_cents ?? 0),
    0,
  );

  const kpis = [
    { label: 'Objekte', value: ctx.properties.length, href: '/owner/objekte' },
    { label: 'Offene Aufträge', value: workOrders.length, href: null },
    { label: 'Offene Mängel', value: defects.length, href: '/owner/maengel' },
    { label: 'Anstehende Wartungen', value: upcomingMaintenance.length, href: null },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Willkommen, {ctx.preferredDisplayName ?? ctx.displayName}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          Ihre Objekte und deren aktueller Stand auf einen Blick.
        </p>
      </div>

      {ctx.properties.length === 0 ? (
        <EmptyState
          title="Noch keine Objekte zugeordnet"
          description="Sobald Ihre Hausverwaltung Ihnen ein Objekt zuordnet, erscheinen hier Aufträge, Mängel, Wartungen und Rechnungen."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {kpis.map((kpi) => {
              const inner = (
                <div className="flex flex-col gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <span className="text-2xl font-semibold tabular-nums">{kpi.value}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">{kpi.label}</span>
                </div>
              );
              return kpi.href ? (
                <Link key={kpi.label} href={kpi.href} className="transition hover:opacity-80">
                  {inner}
                </Link>
              ) : (
                <div key={kpi.label}>{inner}</div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Offene Aufträge</CardTitle>
              </CardHeader>
              <CardBody>
                {workOrders.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Aktuell sind keine Aufträge offen.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {workOrders.slice(0, 5).map((wo) => (
                      <li key={wo.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {wo.code && <Badge tone="muted">{wo.code}</Badge>}
                            <span className="truncate text-sm font-medium">{wo.title}</span>
                            {wo.is_emergency && <Badge tone="danger">Notfall</Badge>}
                          </div>
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {propertyLabel(wo.property_id)}
                          </span>
                        </div>
                        <Badge tone={WO_STATUS_TONE[wo.status as keyof typeof WO_STATUS_TONE] ?? 'neutral'}>
                          {WO_STATUS_LABEL[wo.status as keyof typeof WO_STATUS_LABEL] ?? wo.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Anstehende Wartungen</CardTitle>
              </CardHeader>
              <CardBody>
                {upcomingMaintenance.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Keine fälligen oder überfälligen Wartungen.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {upcomingMaintenance.slice(0, 5).map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">{m.title}</span>
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {propertyLabel(m.property_id)} · {intervalLabel(m.interval_days)} · fällig{' '}
                            {formatDateOnly(m.next_due_at)}
                          </span>
                        </div>
                        <Badge tone={DUE_TONE[m.bucket] ?? 'neutral'}>{DUE_LABEL[m.bucket]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Neueste Mängel</CardTitle>
              </CardHeader>
              <CardBody>
                {defects.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Keine offenen Mängel.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {defects.slice(0, 5).map((d) => (
                      <li key={d.id}>
                        <Link
                          href={`/owner/maengel/${d.id}`}
                          className="flex items-start justify-between gap-3 rounded-md p-1 transition hover:bg-[var(--color-muted)]"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {d.code && <Badge tone="muted">{d.code}</Badge>}
                              <span className="truncate text-sm font-medium">{d.title}</span>
                            </div>
                            <span className="text-xs text-[var(--color-muted-foreground)]">
                              {propertyLabel(d.property_id)}
                            </span>
                          </div>
                          <Badge tone={DEFECT_STATUS_TONE[d.status as keyof typeof DEFECT_STATUS_TONE] ?? 'neutral'}>
                            {DEFECT_STATUS_LABEL[d.status as keyof typeof DEFECT_STATUS_LABEL] ?? d.status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Rechnungen</CardTitle>
              </CardHeader>
              <CardBody>
                {invoices.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Keine Rechnungen vorhanden.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-[var(--color-muted-foreground)]">
                        Offen ({openInvoices.length})
                      </span>
                      <span className="text-lg font-semibold tabular-nums">
                        {formatCents(openInvoiceTotalCents)}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
                      {invoices.slice(0, 4).map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate">
                            {i.code} · {i.title}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums text-[var(--color-muted-foreground)]">
                              {formatCents(i.gross_total_cents)}
                            </span>
                            <Badge tone={INVOICE_STATUS_TONE[i.status] ?? 'neutral'}>
                              {INVOICE_STATUS_LABEL[i.status] ?? i.status}
                            </Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      href="/owner/rechnungen"
                      className="text-sm text-[var(--color-primary)] hover:underline"
                    >
                      Alle Rechnungen ansehen
                    </Link>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
