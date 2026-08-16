import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleGate, ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Objekt' };

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const propertyRes = await supabase
    .from('properties')
    .select(
      'id, code, name, property_type, street, house_number, postal_code, city, country, gps_lat, gps_lng, notes, access_notes, emergency_notes, updated_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  const property = unwrapMaybeRow(propertyRes, 'Objekte: properties');

  if (!property) notFound();

  const [buildingsRes, openOrdersRes] = await Promise.all([
    supabase.from('buildings').select('id, name, code').eq('property_id', id).order('name'),
    supabase
      .from('work_orders')
      .select('id, code, title, status, priority, created_at')
      .eq('property_id', id)
      .is('deleted_at', null)
      .not('status', 'in', '(done,cancelled)')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const canEdit = permissions.has('properties.edit');
  const canCreateOrder = permissions.has('work_orders.create');

  // Sprint 112: openOrders ist die Liste, auf die jemand schaut, BEVOR er den
  // Button "Auftrag anlegen" direkt daneben drueckt. Verschluckt stand dort
  // der Leerzustand — also die Auskunft, an diesem Objekt sei nichts offen.
  // Die Folge ist der Doppelauftrag: zwei Mitarbeiter fahren zur selben
  // Sache. Dieselbe Anzeige beantwortet auch die Frage des Eigentuemers am
  // Telefon, ob sich jemand kuemmert.
  const buildings = unwrapRows(buildingsRes, 'Objekte: Gebaeude');
  const openOrders = unwrapRows(openOrdersRes, 'Objekte: offene Auftraege');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={property.name}
        description={
          property.code
            ? `${property.code}${property.property_type ? ` · ${property.property_type}` : ''}`
            : (property.property_type ?? undefined)
        }
        action={
          <div className="flex gap-2">
            {canCreateOrder && (
              <ModuleGate href={`/work-orders/new?property_id=${property.id}`}>
                <LinkButton variant="secondary" href={`/work-orders/new?property_id=${property.id}`}>
                  Auftrag anlegen
                </LinkButton>
              </ModuleGate>
            )}
            <ModuleGate href={`/qr/property/${property.id}`}>
              <LinkButton variant="outline" href={`/qr/property/${property.id}`}>
                QR-Code
              </LinkButton>
            </ModuleGate>
            {canEdit && (
              <LinkButton variant="outline" href={`/properties/${property.id}/edit`}>
                Bearbeiten
              </LinkButton>
            )}
          </div>
        }
      />

      {property.emergency_notes && (
        <div className="rounded-xl border border-[var(--color-destructive)]/40 bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-destructive)]">
            Notfallhinweis
          </div>
          <p className="mt-1 whitespace-pre-line text-sm">{property.emergency_notes}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Adresse</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-line text-sm">{formatFullAddress(property)}</p>
              {(property.gps_lat !== null || property.gps_lng !== null) && (
                <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                  GPS: {property.gps_lat ?? '–'} / {property.gps_lng ?? '–'}
                </p>
              )}
            </CardBody>
          </Card>

          {property.access_notes && (
            <Card>
              <CardHeader>
                <CardTitle>Zugangshinweise</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{property.access_notes}</p>
              </CardBody>
            </Card>
          )}

          {property.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{property.notes}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Offene Aufträge</CardTitle>
            </CardHeader>
            <CardBody>
              {openOrders.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Aktuell keine offenen Aufträge zu diesem Objekt.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {openOrders.map((wo) => (
                    <li key={wo.id}>
                      <ModuleLink
                        href={`/work-orders/${wo.id}`}
                        className="flex items-center gap-3 py-3 transition hover:opacity-80"
                        unavailableClassName="flex items-center gap-3 py-3"
                      >
                        {wo.code && <Badge tone="muted">{wo.code}</Badge>}
                        <span className="flex-1 truncate text-sm">{wo.title}</span>
                        <StatusBadge status={wo.status} />
                        {wo.priority !== 'normal' && <PriorityBadge priority={wo.priority} />}
                      </ModuleLink>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Gebäude</CardTitle>
            </CardHeader>
            <CardBody>
              {buildings.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Gebäude angelegt.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {buildings.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-sm">
                      {b.code && <Badge tone="muted">{b.code}</Badge>}
                      <span>{b.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadaten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-foreground)]">Zuletzt geändert</dt>
                  <dd>{formatDateTime(property.updated_at)}</dd>
                </div>
                {property.code && (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-foreground)]">Objekt-Nr.</dt>
                    <dd>{property.code}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatFullAddress(p: {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}): string {
  const line1 = [p.street, p.house_number].filter(Boolean).join(' ');
  const line2 = [p.postal_code, p.city].filter(Boolean).join(' ');
  const line3 = p.country && p.country !== 'DE' ? p.country : '';
  const lines = [line1, line2, line3].filter((s) => s && s.length > 0);
  return lines.length > 0 ? lines.join('\n') : 'Keine Adresse hinterlegt.';
}

const STATUS_TONE: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger'> = {
  new: 'primary',
  planned: 'neutral',
  in_progress: 'warning',
  blocked: 'danger',
  done: 'success',
  cancelled: 'muted' as never,
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu',
  planned: 'Geplant',
  in_progress: 'In Arbeit',
  blocked: 'Blockiert',
  done: 'Erledigt',
  cancelled: 'Abgebrochen',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? 'neutral';
  const label = STATUS_LABEL[status] ?? status;
  return <Badge tone={tone}>{label}</Badge>;
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  emergency: 'Notfall',
};
const PRIORITY_TONE: Record<string, 'neutral' | 'warning' | 'danger'> = {
  high: 'warning',
  emergency: 'danger',
  low: 'neutral',
  normal: 'neutral',
};

function PriorityBadge({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? 'neutral';
  const label = PRIORITY_LABEL[priority] ?? priority;
  return <Badge tone={tone}>{label}</Badge>;
}
