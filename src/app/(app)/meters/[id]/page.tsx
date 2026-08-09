import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  UTILITY_LABEL,
  type MeterStatus,
  type ReadingSource,
  type UtilityKind,
} from '@/lib/schemas/meters';
import { ReadingForm } from '../reading-form';
import { softDeleteMeterAction } from '../actions';

export const metadata: Metadata = { title: 'Zähler' };

type ReadingRow = {
  id: string;
  read_at: string;
  reading: number;
  source: string;
  is_reset: boolean;
  note: string | null;
  created_by: string | null;
};

export default async function MeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: meter } = await supabase
    .from('meters')
    .select(
      'id, code, label, meter_number, utility_kind, unit_of_measure, status, property_id, building_id, unit_id, location_note, digits_before, digits_after, installed_at, last_replacement_at, notes, deleted_at, created_at, updated_at',
    )
    .eq('id', id)
    .maybeSingle();

  if (!meter) notFound();

  const [{ data: property }, { data: building }, { data: unit }, { data: readingsRaw }] =
    await Promise.all([
      supabase.from('properties').select('id, code, name').eq('id', meter.property_id).maybeSingle(),
      meter.building_id
        ? supabase.from('buildings').select('id, name').eq('id', meter.building_id).maybeSingle()
        : Promise.resolve({ data: null }),
      meter.unit_id
        ? supabase.from('units').select('id, code').eq('id', meter.unit_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('meter_readings')
        .select('id, read_at, reading, source, is_reset, note, created_by')
        .eq('meter_id', id)
        .order('read_at', { ascending: false }),
    ]);

  const readings: ReadingRow[] = (readingsRaw ?? []).map((r) => ({
    ...r,
    reading: Number(r.reading),
  }));

  // Historie berechnen: für jede Ablesung Δ zur vorherigen (chronologisch)
  const chronological = [...readings].reverse();
  const deltaById = new Map<string, number | null>();
  let previous: number | null = null;
  for (const r of chronological) {
    if (previous !== null && !r.is_reset) {
      deltaById.set(r.id, Number((r.reading - previous).toFixed(4)));
    } else {
      deltaById.set(r.id, null);
    }
    previous = r.reading;
  }

  const currentReading = readings[0] ?? null;
  const lastConsumption = (() => {
    if (readings.length < 2) return null;
    const [latest, previousReading] = readings;
    if (!latest || !previousReading || latest.is_reset) return null;
    return Number((latest.reading - previousReading.reading).toFixed(4));
  })();

  const userIds = readings.map((r) => r.created_by).filter((v): v is string => Boolean(v));
  const uniqueUserIds = [...new Set(userIds)];
  const { data: users } =
    uniqueUserIds.length > 0
      ? await supabase.from('users').select('id, display_name').in('id', uniqueUserIds)
      : { data: [] };
  const displayById = new Map((users ?? []).map((u) => [u.id, u.display_name]));

  const canEdit = permissions.has('meters.edit');
  const canRead = permissions.has('meters.edit'); // meters.edit ist die einzige write-Permission
  const isReplaced = meter.status === 'replaced';
  const isDefective = meter.status === 'defective';

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title={meter.label}
        description={meter.code ?? undefined}
        action={
          <div className="flex gap-2">
            <LinkButton variant="outline" href={`/qr/meter/${meter.id}`}>
              QR-Code
            </LinkButton>
            {canEdit && !meter.deleted_at && (
              <LinkButton variant="outline" href={`/meters/${meter.id}/edit`}>
                Bearbeiten
              </LinkButton>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[meter.status as MeterStatus] ?? 'neutral'}>
          {STATUS_LABEL[meter.status as MeterStatus] ?? meter.status}
        </Badge>
        <Badge tone="muted">
          {UTILITY_LABEL[meter.utility_kind as UtilityKind] ?? meter.utility_kind}
        </Badge>
        {meter.meter_number && (
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Nr. {meter.meter_number}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Aktueller Stand</CardTitle>
              </CardHeader>
              <CardBody>
                {currentReading ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-semibold tabular-nums">
                      {currentReading.reading.toLocaleString('de-DE')}{' '}
                      <span className="text-lg font-normal text-[var(--color-muted-foreground)]">
                        {meter.unit_of_measure}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      Abgelesen {formatDateTime(currentReading.read_at)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Noch keine Ablesung erfasst.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Letzter Verbrauch</CardTitle>
              </CardHeader>
              <CardBody>
                {lastConsumption !== null ? (
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-semibold tabular-nums">
                      {lastConsumption.toLocaleString('de-DE')}{' '}
                      <span className="text-lg font-normal text-[var(--color-muted-foreground)]">
                        {meter.unit_of_measure}
                      </span>
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      Zwischen den letzten beiden Ablesungen
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {readings.length < 2
                      ? 'Zu wenig Daten für Verbrauch.'
                      : 'Letzte Ablesung war ein Reset.'}
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {canRead && !isReplaced && (
            <Card>
              <CardHeader>
                <CardTitle>Ablesung erfassen</CardTitle>
              </CardHeader>
              <ReadingForm
                meterId={meter.id}
                unit={meter.unit_of_measure}
                lastReading={currentReading?.reading ?? null}
              />
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Historie ({readings.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {readings.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Noch keine Ablesungen erfasst.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-sm">
                    <thead className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-muted-foreground)]">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Zeitpunkt</th>
                        <th className="py-2 pr-3 text-right font-medium">Stand</th>
                        <th className="py-2 pr-3 text-right font-medium">Δ</th>
                        <th className="py-2 pr-3 font-medium">Quelle</th>
                        <th className="py-2 font-medium">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readings.map((r) => {
                        const delta = deltaById.get(r.id) ?? null;
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-[var(--color-border)] last:border-b-0"
                          >
                            <td className="py-2 pr-3">
                              {formatDateTime(r.read_at)}
                              {r.is_reset && (
                                <Badge tone="warning" className="ml-2">
                                  Reset
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                              {r.reading.toLocaleString('de-DE')}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-muted-foreground)]">
                              {delta !== null ? `+${delta.toLocaleString('de-DE')}` : '—'}
                            </td>
                            <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">
                              {SOURCE_LABEL[r.source as ReadingSource] ?? r.source}
                              {r.created_by && (
                                <div className="text-xs">
                                  {displayById.get(r.created_by) ?? '(unbekannt)'}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-[var(--color-muted-foreground)]">
                              {r.note ?? ''}
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
              <CardTitle>Zuordnung</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Objekt</dt>
                  <dd>
                    {property ? (
                      <Link
                        href={`/properties/${property.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {property.code ? `${property.code} · ${property.name}` : property.name}
                      </Link>
                    ) : (
                      '–'
                    )}
                  </dd>
                </div>
                {building && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Gebäude</dt>
                    <dd>{building.name}</dd>
                  </div>
                )}
                {unit && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Einheit</dt>
                    <dd>{unit.code}</dd>
                  </div>
                )}
                {meter.location_note && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Aufstellort</dt>
                    <dd className="text-right">{meter.location_note}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Technische Daten</CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Einheit</dt>
                  <dd>{meter.unit_of_measure}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-foreground)]">Stellen</dt>
                  <dd>
                    {meter.digits_before} + {meter.digits_after}
                  </dd>
                </div>
                {meter.installed_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Eingebaut</dt>
                    <dd>{new Date(meter.installed_at).toLocaleDateString('de-DE')}</dd>
                  </div>
                )}
                {meter.last_replacement_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Letzter Wechsel</dt>
                    <dd>{new Date(meter.last_replacement_at).toLocaleDateString('de-DE')}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {meter.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notizen</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="whitespace-pre-line text-sm">{meter.notes}</p>
              </CardBody>
            </Card>
          )}

          {canEdit && !meter.deleted_at && readings.length === 0 && (
            <Card>
              <CardBody>
                <details className="rounded-md">
                  <summary className="cursor-pointer text-sm text-[var(--color-destructive)]">
                    Zähler entfernen
                  </summary>
                  <form action={softDeleteMeterAction} className="mt-2 flex flex-col gap-2">
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Nur möglich, wenn noch keine Ablesungen erfasst wurden.
                    </p>
                    <input type="hidden" name="meter_id" value={meter.id} />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center justify-center rounded-md bg-[var(--color-destructive)] px-3 text-xs font-medium text-white hover:opacity-90"
                    >
                      Endgültig entfernen
                    </button>
                  </form>
                </details>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {isDefective && (
        <Card>
          <CardBody>
            <p className="text-sm text-[var(--color-destructive)]">
              Dieser Zähler ist als defekt markiert. Bitte Austausch veranlassen.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
