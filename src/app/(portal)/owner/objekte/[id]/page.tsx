import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL as WO_STATUS_LABEL } from '@/lib/schemas/work-orders';
import {
  STATUS_LABEL as DEFECT_STATUS_LABEL,
  STATUS_TONE as DEFECT_STATUS_TONE,
} from '@/lib/schemas/defect-reports';
import { dueBucket, DUE_LABEL, DUE_TONE, intervalLabel } from '@/lib/schemas/maintenance';
import { formatDateOnly } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Objekt · Eigentümer-Portal' };

const OPEN_WORK_ORDER_STATUSES = ['new', 'planned', 'in_progress', 'blocked'];

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

export default async function OwnerObjektDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');
  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  // RLS (properties_select_owner) liefert die Zeile nur, wenn das Objekt
  // diesem Eigentuemer gehoert — andernfalls null → 404.
  const property = unwrapMaybeRow(
    await supabase
      .from('properties')
      .select('id, name, code, property_type, street, house_number, postal_code, city')
      .eq('id', id)
      .maybeSingle(),
    'Eigentümerportal: Objekt',
  );
  if (!property) notFound();

  const [buildingsRes, unitsRes, workOrdersRes, maintenanceRes, defectsRes] = await Promise.all([
    supabase
      .from('buildings')
      .select('id, name, code, floors')
      .eq('property_id', id)
      .order('name', { ascending: true }),
    supabase.from('units').select('id, building_id').eq('property_id', id),
    supabase
      .from('work_orders')
      .select('id, code, title, status, is_emergency, created_at')
      .eq('property_id', id)
      .in('status', OPEN_WORK_ORDER_STATUSES)
      .order('created_at', { ascending: false }),
    supabase
      .from('maintenance_plans')
      .select('id, title, next_due_at, interval_days, active')
      .eq('property_id', id)
      .eq('active', true)
      .order('next_due_at', { ascending: true }),
    supabase
      .from('defect_reports')
      .select('id, code, title, status, created_at')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const buildings = unwrapRows(buildingsRes, 'Eigentümerportal: Gebäude');
  const units = unwrapRows(unitsRes, 'Eigentümerportal: Einheiten');
  const workOrders = unwrapRows(workOrdersRes, 'Eigentümerportal: Aufträge');
  const maintenance = unwrapRows(maintenanceRes, 'Eigentümerportal: Wartungen');
  const defects = unwrapRows(defectsRes, 'Eigentümerportal: Mängel');

  const unitsByBuilding = new Map<string, number>();
  for (const u of units) {
    if (!u.building_id) continue;
    unitsByBuilding.set(u.building_id, (unitsByBuilding.get(u.building_id) ?? 0) + 1);
  }

  const address = [
    [property.street, property.house_number].filter(Boolean).join(' '),
    [property.postal_code, property.city].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={property.code ? `${property.code} · ${property.name}` : property.name}
        description={address || undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gebäude &amp; Einheiten</CardTitle>
          </CardHeader>
          <CardBody>
            {buildings.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Für dieses Objekt sind keine Gebäude erfasst.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {buildings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">
                        {b.code ? `${b.code} · ${b.name}` : b.name}
                      </span>
                      {b.floors !== null && (
                        <span className="block text-xs text-[var(--color-muted-foreground)]">
                          {b.floors} {b.floors === 1 ? 'Etage' : 'Etagen'}
                        </span>
                      )}
                    </div>
                    <Badge tone="muted">
                      {unitsByBuilding.get(b.id) ?? 0}{' '}
                      {(unitsByBuilding.get(b.id) ?? 0) === 1 ? 'Einheit' : 'Einheiten'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

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
                {workOrders.map((wo) => (
                  <li key={wo.id} className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {wo.code && <Badge tone="muted">{wo.code}</Badge>}
                      <span className="truncate text-sm font-medium">{wo.title}</span>
                      {wo.is_emergency && <Badge tone="danger">Notfall</Badge>}
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
            <CardTitle>Wartungen</CardTitle>
          </CardHeader>
          <CardBody>
            {maintenance.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Keine aktiven Wartungspläne.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {maintenance.map((m) => {
                  const bucket = dueBucket(m.next_due_at, m.active);
                  return (
                    <li key={m.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.title}</span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {intervalLabel(m.interval_days)} · fällig {formatDateOnly(m.next_due_at)}
                        </span>
                      </div>
                      <Badge tone={DUE_TONE[bucket] ?? 'neutral'}>{DUE_LABEL[bucket]}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mängel</CardTitle>
          </CardHeader>
          <CardBody>
            {defects.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Keine Mängel erfasst.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {defects.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/owner/maengel/${d.id}`}
                      className="flex items-start justify-between gap-3 rounded-md p-1 transition hover:bg-[var(--color-muted)]"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {d.code && <Badge tone="muted">{d.code}</Badge>}
                        <span className="truncate text-sm font-medium">{d.title}</span>
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
      </div>
    </div>
  );
}
