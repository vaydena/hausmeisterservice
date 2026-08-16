import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import {
  buildConsumptionChain,
  describeImplausibleChain,
  formatDelta,
  latestConsumptionState,
  latestEntry,
} from '@/lib/meters/consumption';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleGate, ModuleLink } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format';
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

export default async function MeterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  // Sprint 111: getrennt von notFound(). Ein verschluckter Lesefehler hat
  // vorher behauptet, den Zähler gebe es nicht.
  const meter = unwrapMaybeRow(
    await supabase
      .from('meters')
      .select(
        'id, code, label, meter_number, utility_kind, unit_of_measure, status, property_id, building_id, unit_id, location_note, digits_before, digits_after, installed_at, last_replacement_at, notes, deleted_at, created_at, updated_at',
      )
      .eq('id', id)
      .maybeSingle(),
    'Zähler: Stammdaten',
  );

  if (!meter) notFound();

  const [property, building, unit, readingRows] = await Promise.all([
    supabase
      .from('properties')
      .select('id, code, name')
      .eq('id', meter.property_id)
      .maybeSingle()
      .then((r) => unwrapMaybeRow(r, 'Zähler: Objekt')),
    meter.building_id
      ? supabase
          .from('buildings')
          .select('id, name')
          .eq('id', meter.building_id)
          .maybeSingle()
          .then((r) => unwrapMaybeRow(r, 'Zähler: Gebäude'))
      : Promise.resolve(null),
    meter.unit_id
      ? supabase
          .from('units')
          .select('id, code')
          .eq('id', meter.unit_id)
          .maybeSingle()
          .then((r) => unwrapMaybeRow(r, 'Zähler: Einheit'))
      : Promise.resolve(null),
    // Diese eine Abfrage traegt auf dieser Seite drei Aussagen: den aktuellen
    // Stand, den letzten Verbrauch — und ob "Zähler entfernen" freigeschaltet
    // wird. Ein `?? []` hat alle drei gleichzeitig gekippt, und die dritte in
    // die gefaehrliche Richtung.
    supabase
      .from('meter_readings')
      .select('id, read_at, reading, source, is_reset, note, created_by')
      .eq('meter_id', id)
      .order('read_at', { ascending: false })
      .then((r) => unwrapRows(r, 'Zähler: Ablesungen')),
  ]);

  const chain = buildConsumptionChain(readingRows);
  const rowById = new Map(readingRows.map((r) => [r.id, r]));
  // Die Kette rechnet chronologisch, die Tabelle zeigt neueste zuerst.
  const historyDesc = [...chain].reverse();
  const currentReading = latestEntry(chain);
  const consumption = latestConsumptionState(chain);
  const implausibleNote = describeImplausibleChain(chain);

  const userIds = readingRows.map((r) => r.created_by).filter((v): v is string => Boolean(v));
  const uniqueUserIds = [...new Set(userIds)];
  const users =
    uniqueUserIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', uniqueUserIds),
          'Zähler: Namen der Erfasser',
        )
      : [];
  const displayById = new Map(users.map((u) => [u.id, u.display_name]));

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
            <ModuleGate href={`/qr/meter/${meter.id}`}>
              <LinkButton variant="outline" href={`/qr/meter/${meter.id}`}>
                QR-Code
              </LinkButton>
            </ModuleGate>
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
                      Abgelesen {formatDateTime(currentReading.readAt)}
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
                {consumption.kind === 'value' ? (
                  <div className="flex flex-col gap-1">
                    <span
                      className={`text-3xl font-semibold tabular-nums${
                        consumption.implausible ? ' text-[var(--color-destructive)]' : ''
                      }`}
                    >
                      {consumption.delta.toLocaleString('de-DE')}{' '}
                      <span className="text-lg font-normal text-[var(--color-muted-foreground)]">
                        {meter.unit_of_measure}
                      </span>
                    </span>
                    {/*
                      Ein negativer Verbrauch wurde vorher wie jede andere Zahl
                      ausgegeben. Genau diese Zahl wird in die
                      Betriebskostenabrechnung uebernommen — sie darf nicht
                      unkommentiert dastehen.
                    */}
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {consumption.implausible
                        ? 'Negativer Verbrauch — der Zähler kann nicht rückwärts gelaufen sein.'
                        : 'Zwischen den letzten beiden Ablesungen'}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    {consumption.kind === 'after_reset'
                      ? 'Letzte Ablesung war ein Zählertausch.'
                      : 'Zu wenig Daten für Verbrauch.'}
                  </p>
                )}
              </CardBody>
            </Card>
          </div>

          {/*
            Sprint 111: Diese Warnung kann nur Zeilen betreffen, die vor der
            beidseitigen Plausibilitaetspruefung entstanden sind — neue laesst
            addReadingAction nicht mehr zu. Sie steht hier trotzdem, weil ein
            negativer Verbrauch sonst nur als Zahl in der Historie auftaucht
            und von dort in die Abrechnung wandert.
          */}
          {implausibleNote && (
            <div
              className="rounded-lg border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 p-4 text-sm"
              role="status"
            >
              <p className="font-medium">Unplausibler Verbrauch</p>
              <p className="mt-1 text-[var(--color-muted-foreground)]">{implausibleNote}</p>
            </div>
          )}

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
              <CardTitle>Historie ({chain.length})</CardTitle>
            </CardHeader>
            <CardBody>
              {chain.length === 0 ? (
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
                      {historyDesc.map((entry) => {
                        // Quelle, Notiz und Erfasser stehen nur in der Rohzeile;
                        // Reihenfolge und Verbrauch kommen aus der Kette.
                        const row = rowById.get(entry.id);
                        return (
                          <tr
                            key={entry.id}
                            className="border-b border-[var(--color-border)] last:border-b-0"
                          >
                            <td className="py-2 pr-3">
                              {formatDateTime(entry.readAt)}
                              {entry.isReset && (
                                <Badge tone="warning" className="ml-2">
                                  Reset
                                </Badge>
                              )}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">
                              {entry.reading.toLocaleString('de-DE')}
                            </td>
                            <td
                              className={`py-2 pr-3 text-right font-mono tabular-nums ${
                                entry.implausible
                                  ? 'font-semibold text-[var(--color-destructive)]'
                                  : 'text-[var(--color-muted-foreground)]'
                              }`}
                            >
                              {entry.delta !== null ? formatDelta(entry.delta) : '—'}
                            </td>
                            <td className="py-2 pr-3 text-[var(--color-muted-foreground)]">
                              {row ? SOURCE_LABEL[row.source as ReadingSource] ?? row.source : '—'}
                              {row?.created_by && (
                                <div className="text-xs">
                                  {displayById.get(row.created_by) ?? '(unbekannt)'}
                                </div>
                              )}
                            </td>
                            <td className="py-2 text-[var(--color-muted-foreground)]">
                              {row?.note ?? ''}
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
                      <ModuleLink
                        href={`/properties/${property.id}`}
                        className="text-[var(--color-primary)] hover:underline"
                      >
                        {property.code ? `${property.code} · ${property.name}` : property.name}
                      </ModuleLink>
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
                    <dd>{formatDateOnly(meter.installed_at)}</dd>
                  </div>
                )}
                {meter.last_replacement_at && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-muted-foreground)]">Letzter Wechsel</dt>
                    <dd>{formatDateOnly(meter.last_replacement_at)}</dd>
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

          {/*
            Die Bedingung steht jetzt auf einer Query, die bei einem Fehler
            wirft, statt auf einem stillen `?? []`. Dieselbe Regel prueft
            softDeleteMeterAction zusaetzlich serverseitig — vorher stand sie
            ausschliesslich hier im JSX.
          */}
          {canEdit && !meter.deleted_at && readingRows.length === 0 && (
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
