import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  EVENT_KIND_LABEL,
  EVENT_KIND_TONE,
  FUEL_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  VEHICLE_TYPE_LABEL,
  dueLabel,
  dueTone,
  type EventKind,
  type FuelType,
  type VehicleStatus,
  type VehicleType,
} from '@/lib/schemas/vehicles';
import { EventForm } from '../event-form';
import { setVehicleStatusAction, softDeleteVehicleAction } from '../actions';

export const metadata: Metadata = { title: 'Fahrzeug' };

type EventRow = {
  id: string;
  kind: string;
  event_date: string;
  mileage_km: number | null;
  cost_eur: number | null;
  vendor: string | null;
  next_due_at: string | null;
  note: string | null;
  created_by: string | null;
};

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(
      'id, code, license_plate, make, model, vehicle_type, fuel_type, year, vin, status, mileage_km, primary_driver_user_id, next_tuev_at, next_service_at, next_service_due_km, insurance_expires_at, storage_location, notes, deleted_at, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!vehicle) notFound();

  const [{ data: driver }, { data: eventsRaw }] = await Promise.all([
    vehicle.primary_driver_user_id
      ? supabase
          .from('users')
          .select('id, display_name')
          .eq('id', vehicle.primary_driver_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('vehicle_events')
      .select(
        'id, kind, event_date, mileage_km, cost_eur, vendor, next_due_at, note, created_by',
      )
      .eq('vehicle_id', id)
      .order('event_date', { ascending: false })
      .limit(200),
  ]);

  const events: EventRow[] = (eventsRaw ?? []).map((e) => ({
    ...e,
    cost_eur: e.cost_eur !== null ? Number(e.cost_eur) : null,
  }));

  const creatorIds = [
    ...new Set(events.map((e) => e.created_by).filter((v): v is string => Boolean(v))),
  ];
  const { data: creators } =
    creatorIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', creatorIds)
      : { data: [] };
  const creatorById = new Map((creators ?? []).map((u) => [u.id, u.display_name]));

  const canEdit = permissions.has('vehicles.edit');
  const isRetired = vehicle.status === 'retired';

  const tuevTone = dueTone(vehicle.next_tuev_at);
  const serviceTone = dueTone(vehicle.next_service_at);
  const insTone = dueTone(vehicle.insurance_expires_at);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={`${vehicle.make} ${vehicle.model}`}
        description={`${vehicle.license_plate}${vehicle.code ? ' · ' + vehicle.code : ''}`}
        action={
          canEdit && !vehicle.deleted_at ? (
            <LinkButton variant="outline" href={`/vehicles/${vehicle.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[vehicle.status as VehicleStatus] ?? 'neutral'}>
          {STATUS_LABEL[vehicle.status as VehicleStatus] ?? vehicle.status}
        </Badge>
        <Badge tone="muted">
          {VEHICLE_TYPE_LABEL[vehicle.vehicle_type as VehicleType] ?? vehicle.vehicle_type}
        </Badge>
        <Badge tone="muted">{FUEL_TYPE_LABEL[vehicle.fuel_type as FuelType] ?? vehicle.fuel_type}</Badge>
        {vehicle.year && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Baujahr {vehicle.year}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>TÜV/HU</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-2xl font-semibold ${
                      tuevTone === 'danger' ? 'text-[var(--color-destructive)]' : ''
                    }`}
                  >
                    {dueLabel(vehicle.next_tuev_at)}
                  </span>
                  {tuevTone && (
                    <Badge tone={tuevTone}>
                      {tuevTone === 'danger'
                        ? 'Fällig / abgelaufen'
                        : tuevTone === 'warning'
                        ? 'In ≤ 60 Tagen'
                        : 'Aktuell'}
                    </Badge>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Service</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-2xl font-semibold ${
                      serviceTone === 'danger' ? 'text-[var(--color-destructive)]' : ''
                    }`}
                  >
                    {dueLabel(vehicle.next_service_at)}
                  </span>
                  {vehicle.next_service_due_km !== null && (
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      oder ab {vehicle.next_service_due_km.toLocaleString('de-DE')} km
                    </span>
                  )}
                  {serviceTone && (
                    <Badge tone={serviceTone}>
                      {serviceTone === 'danger'
                        ? 'Fällig'
                        : serviceTone === 'warning'
                        ? 'In ≤ 60 Tagen'
                        : 'Aktuell'}
                    </Badge>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Versicherung</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-1">
                  <span
                    className={`text-2xl font-semibold ${
                      insTone === 'danger' ? 'text-[var(--color-destructive)]' : ''
                    }`}
                  >
                    {dueLabel(vehicle.insurance_expires_at)}
                  </span>
                  {insTone && (
                    <Badge tone={insTone}>
                      {insTone === 'danger'
                        ? 'Fällig / abgelaufen'
                        : insTone === 'warning'
                        ? 'In ≤ 60 Tagen'
                        : 'Aktuell'}
                    </Badge>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>

          {canEdit && !isRetired && !vehicle.deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Ereignis erfassen</CardTitle>
              </CardHeader>
              <EventForm vehicleId={vehicle.id} currentMileage={vehicle.mileage_km} />
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historie ({events.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {events.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Ereignisse erfasst.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Datum</th>
                        <th className="py-2 pr-3 font-medium">Art</th>
                        <th className="py-2 pr-3 text-right font-medium">Km</th>
                        <th className="py-2 pr-3 text-right font-medium">Kosten</th>
                        <th className="py-2 pr-3 font-medium">Werkstatt / Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => {
                        const creator = e.created_by ? creatorById.get(e.created_by) : null;
                        return (
                          <tr
                            key={e.id}
                            className="border-b border-[var(--color-border)] last:border-b-0 align-top"
                          >
                            <td className="py-2 pr-3">
                              {new Date(e.event_date).toLocaleDateString('de-DE')}
                              {creator && (
                                <div className="text-xs text-[var(--color-muted-foreground)]">
                                  von {creator}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <Badge tone={EVENT_KIND_TONE[e.kind as EventKind] ?? 'muted'}>
                                {EVENT_KIND_LABEL[e.kind as EventKind] ?? e.kind}
                              </Badge>
                              {e.next_due_at && (
                                <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                                  nächste Frist:{' '}
                                  {new Date(e.next_due_at).toLocaleDateString('de-DE')}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                              {e.mileage_km !== null ? e.mileage_km.toLocaleString('de-DE') : '—'}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                              {e.cost_eur !== null
                                ? e.cost_eur.toLocaleString('de-DE', {
                                    style: 'currency',
                                    currency: 'EUR',
                                  })
                                : '—'}
                            </td>
                            <td className="py-2 pr-3 text-xs text-[var(--color-muted-foreground)]">
                              {e.vendor && <div>{e.vendor}</div>}
                              {e.note && <div>{e.note}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Stammdaten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Km-Stand</dt>
                  <dd className="tabular-nums">
                    {vehicle.mileage_km !== null
                      ? `${vehicle.mileage_km.toLocaleString('de-DE')} km`
                      : '—'}
                  </dd>
                </div>
                {vehicle.vin && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">VIN</dt>
                    <dd className="font-mono text-xs">{vehicle.vin}</dd>
                  </div>
                )}
                {vehicle.storage_location && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Stellplatz</dt>
                    <dd className="text-right">{vehicle.storage_location}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Fahrer</dt>
                  <dd>{driver?.display_name ?? '—'}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {vehicle.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{vehicle.notes}</p>
              </CardBody>
            </Card>
          )}

          {canEdit && !vehicle.deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Verwaltung</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  <form action={setVehicleStatusAction} className="flex flex-col gap-2">
                    <input type="hidden" name="vehicle_id" value={vehicle.id} />
                    <label
                      htmlFor="status"
                      className="text-xs text-[var(--color-muted-foreground)]"
                    >
                      Status ändern
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="status"
                        name="status"
                        defaultValue={vehicle.status}
                        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
                      >
                        <option value="active">Aktiv</option>
                        <option value="maintenance">In Wartung</option>
                        <option value="inactive">Inaktiv</option>
                        <option value="retired">Ausgemustert</option>
                      </select>
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                      >
                        Speichern
                      </button>
                    </div>
                  </form>

                  {events.length === 0 && (
                    <details className="rounded-md border-t border-[var(--color-border)] pt-3">
                      <summary className="cursor-pointer text-sm text-[var(--color-destructive)]">
                        Fahrzeug entfernen
                      </summary>
                      <form action={softDeleteVehicleAction} className="mt-2 flex flex-col gap-2">
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          Nur möglich, wenn keine Ereignisse erfasst wurden.
                        </p>
                        <input type="hidden" name="vehicle_id" value={vehicle.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-destructive)] px-3 text-xs font-medium text-white hover:opacity-90"
                        >
                          Endgültig entfernen
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
