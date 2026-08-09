import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  STOP_STATUS_LABEL,
  STOP_STATUS_TONE,
  TOUR_STATUSES,
  TOUR_STATUS_LABEL,
  TOUR_STATUS_TONE,
  formatDate,
  formatDateTime,
  formatTime,
  type StopStatus,
  type TourStatus,
} from '@/lib/schemas/tours';
import { AddStopCard } from '../stop-form';
import { RemoveStopButton, StopReorderControls, StopStatusSelect } from '../stop-actions';
import { setTourStatusAction, softDeleteTourAction } from '../actions';

export const metadata: Metadata = { title: 'Tour' };

type StopRow = {
  id: string;
  sequence: number;
  property_id: string | null;
  label: string;
  planned_arrival_at: string | null;
  planned_departure_at: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: string;
  duration_minutes: number | null;
  note: string | null;
};

export default async function TourDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: tour } = await supabase
    .from('tours')
    .select(
      'id, code, title, planned_date, driver_user_id, vehicle_id, status, started_at, completed_at, notes, deleted_at, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!tour) notFound();

  const [{ data: driver }, { data: vehicle }, { data: stopsRaw }, { data: properties }] = await Promise.all([
    tour.driver_user_id
      ? supabase.from('users').select('id, display_name').eq('id', tour.driver_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tour.vehicle_id
      ? supabase
          .from('vehicles')
          .select('id, license_plate, make, model')
          .eq('id', tour.vehicle_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('tour_stops')
      .select(
        'id, sequence, property_id, label, planned_arrival_at, planned_departure_at, actual_arrival_at, actual_departure_at, status, duration_minutes, note',
      )
      .eq('tour_id', id)
      .order('sequence', { ascending: true }),
    supabase
      .from('properties')
      .select('id, name, street, house_number, city')
      .is('deleted_at', null)
      .order('name'),
  ]);

  const stops: StopRow[] = stopsRaw ?? [];
  const propertyById = new Map(
    (properties ?? []).map((p) => [p.id, p] as const),
  );

  const canEdit = permissions.has('tours.edit');
  const stopIds = stops.map((s) => s.id);
  const isDone = tour.status === 'completed' || tour.status === 'cancelled';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={tour.title}
        description={`${tour.code ?? '—'} · ${formatDate(tour.planned_date)}`}
        action={
          canEdit && !tour.deleted_at ? (
            <LinkButton variant="outline" href={`/tours/${tour.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={TOUR_STATUS_TONE[tour.status as TourStatus] ?? 'muted'}>
          {TOUR_STATUS_LABEL[tour.status as TourStatus] ?? tour.status}
        </Badge>
        {tour.started_at && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Gestartet {formatDateTime(tour.started_at)}
          </span>
        )}
        {tour.completed_at && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Abgeschlossen {formatDateTime(tour.completed_at)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stopps ({stops.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {stops.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Stopps. Unten anhängen.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-3 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">Ziel</th>
                        <th className="py-2 pr-3 font-medium">Geplant</th>
                        <th className="py-2 pr-3 font-medium">Ist</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        {canEdit && !isDone && (
                          <th className="py-2 pr-3 text-right font-medium">Aktion</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((s) => {
                        const prop = s.property_id ? propertyById.get(s.property_id) : null;
                        return (
                          <tr
                            key={s.id}
                            className="border-b border-[var(--color-border)] align-top last:border-b-0"
                          >
                            <td className="py-2 pr-3 font-mono tabular-nums">{s.sequence}</td>
                            <td className="py-2 pr-3">
                              <div className="flex flex-col gap-1">
                                {prop ? (
                                  <Link
                                    href={`/properties/${prop.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    {s.label}
                                  </Link>
                                ) : (
                                  <span className="font-medium">{s.label}</span>
                                )}
                                {prop && (prop.street || prop.city) && (
                                  <span className="text-xs text-[var(--color-muted-foreground)]">
                                    {[
                                      [prop.street, prop.house_number].filter(Boolean).join(' '),
                                      prop.city,
                                    ]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </span>
                                )}
                                {s.note && (
                                  <span className="text-xs text-[var(--color-muted-foreground)]">
                                    {s.note}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap text-xs">
                              {s.planned_arrival_at ? formatTime(s.planned_arrival_at) : '—'}
                              {' – '}
                              {s.planned_departure_at ? formatTime(s.planned_departure_at) : '—'}
                              {s.duration_minutes !== null && (
                                <div className="text-[10px] text-[var(--color-muted-foreground)]">
                                  {s.duration_minutes} Min.
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-3 whitespace-nowrap text-xs">
                              {s.actual_arrival_at ? formatTime(s.actual_arrival_at) : '—'}
                              {' – '}
                              {s.actual_departure_at ? formatTime(s.actual_departure_at) : '—'}
                            </td>
                            <td className="py-2 pr-3">
                              {canEdit && !isDone ? (
                                <StopStatusSelect
                                  stopId={s.id}
                                  currentStatus={s.status as StopStatus}
                                />
                              ) : (
                                <Badge tone={STOP_STATUS_TONE[s.status as StopStatus] ?? 'muted'}>
                                  {STOP_STATUS_LABEL[s.status as StopStatus] ?? s.status}
                                </Badge>
                              )}
                            </td>
                            {canEdit && !isDone && (
                              <td className="py-2 pr-3">
                                <div className="flex items-center justify-end gap-3">
                                  <StopReorderControls
                                    stopIds={stopIds}
                                    stopId={s.id}
                                    tourId={tour.id}
                                  />
                                  <RemoveStopButton stopId={s.id} tourId={tour.id} />
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          {canEdit && !isDone && !tour.deleted_at && (
            <AddStopCard tourId={tour.id} properties={properties ?? []} />
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Zuweisung</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Fahrer</dt>
                  <dd className="text-right">
                    {driver?.display_name ?? (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Fahrzeug</dt>
                  <dd className="text-right">
                    {vehicle ? (
                      <Link href={`/vehicles/${vehicle.id}`} className="hover:underline">
                        {vehicle.license_plate} · {vehicle.make} {vehicle.model}
                      </Link>
                    ) : (
                      <span className="text-[var(--color-muted-foreground)]">—</span>
                    )}
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {tour.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{tour.notes}</p>
              </CardBody>
            </Card>
          )}

          {canEdit && !tour.deleted_at && (
            <Card>
              <CardHeader>
                <CardTitle>Verwaltung</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="flex flex-col gap-3">
                  <form action={setTourStatusAction} className="flex flex-col gap-2">
                    <input type="hidden" name="tour_id" value={tour.id} />
                    <label htmlFor="status" className="text-xs text-[var(--color-muted-foreground)]">
                      Status ändern
                    </label>
                    <div className="flex gap-2">
                      <select
                        id="status"
                        name="status"
                        defaultValue={tour.status}
                        className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
                      >
                        {TOUR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TOUR_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
                      >
                        Speichern
                      </button>
                    </div>
                  </form>

                  {stops.length === 0 && (
                    <details className="rounded-md border-t border-[var(--color-border)] pt-3">
                      <summary className="cursor-pointer text-sm text-[var(--color-destructive)]">
                        Tour entfernen
                      </summary>
                      <form action={softDeleteTourAction} className="mt-2 flex flex-col gap-2">
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          Nur möglich, wenn keine Stopps existieren.
                        </p>
                        <input type="hidden" name="tour_id" value={tour.id} />
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
