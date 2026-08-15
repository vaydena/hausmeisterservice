import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { sanitizeOrFilterTerm } from '@/lib/utils/search';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  STATUS_LABEL,
  STATUS_TONE,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABEL,
  dueLabel,
  needsRoadDeadlines,
  type VehicleStatus,
  type VehicleType,
} from '@/lib/schemas/vehicles';
import {
  DEADLINE_TONE,
  type DeadlineStatus,
  deadlineStatus,
  describeDeadline,
  describeDeadlineTally,
  describeUnmonitored,
  tallyWorstDeadlines,
  worstDeadlineStatus,
} from '@/lib/deadlines/status';

export const metadata: Metadata = { title: 'Fahrzeuge' };

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; due?: string; q?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  let query = supabase
    .from('vehicles')
    .select(
      'id, code, license_plate, make, model, vehicle_type, fuel_type, status, mileage_km, next_tuev_at, next_service_at, insurance_expires_at, primary_driver_user_id',
    )
    .is('deleted_at', null)
    .order('license_plate', { ascending: true });

  if (params.type) query = query.eq('vehicle_type', params.type);
  if (params.status) query = query.eq('status', params.status);
  // Sprint 98: q ging bis hierher ungefiltert in den .or()-Ausdruck. Ein
  // Komma im Suchbegriff haengte damit einen zusaetzlichen OR-Zweig an —
  // die Mandantengrenze haelt (RLS), die beabsichtigte Einschraenkung
  // dagegen nicht. Laenge auf dem sanitisierten Term pruefen, sonst bliebe
  // bei q="%%" ein ilike.%% stehen, das jede Zeile matcht.
  const vehicleSearch = sanitizeOrFilterTerm(params.q);
  if (vehicleSearch.length > 0) {
    query = query.or(
      `license_plate.ilike.%${vehicleSearch}%,make.ilike.%${vehicleSearch}%,model.ilike.%${vehicleSearch}%`,
    );
  }

  // Sprint 109: `const { data: vehiclesRaw }` verschluckte den Query-Fehler.
  // Uebrig blieb "Keine Fahrzeuge" plus ein Seitenkopf ohne jede
  // Fristen-Angabe — kein TUEV-Badge, kein Versicherungs-Badge, nichts.
  // Genau so sieht auch ein Fuhrpark aus, bei dem alles in Ordnung ist.
  const alle = unwrapRows(await query, 'Fahrzeuge');

  const now = new Date();
  const fristenVon = (v: {
    next_tuev_at: string | null;
    next_service_at: string | null;
    insurance_expires_at: string | null;
  }) => [v.next_tuev_at, v.next_service_at, v.insurance_expires_at];

  // Filter „Frist ≤ 60 Tage" client-seitig (Datumsvergleich). Abgelaufenes
  // faellt weiterhin darunter — es ist die dringlichste Teilmenge.
  let items = alle;
  if (params.due === '1') {
    items = items.filter((v) => {
      const worst = worstDeadlineStatus(fristenVon(v), now);
      return worst === 'expired' || worst === 'critical' || worst === 'soon';
    });
  }

  const driverIds = [
    ...new Set(items.map((v) => v.primary_driver_user_id).filter((x): x is string => Boolean(x))),
  ];
  const drivers =
    driverIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', driverIds),
          'Fahrzeuge: Fahrernamen',
        )
      : [];
  const driverById = new Map(drivers.map((u) => [u.id, u.display_name]));

  const canCreate = permissions.has('vehicles.create');

  // Sprint 109: Bisher stand hier "N mit Frist in <= 60 Tagen" — eine
  // Formulierung, die einen abgelaufenen TUEV zu einer kuenftigen Frist
  // macht. Am 15.08.2026 betraf das DÜ-HM 200, dessen HU seit dem 30.07.
  // abgelaufen ist: nach §29 StVZO darf das Fahrzeug in diesem Zustand
  // nicht bewegt werden. Abgelaufenes steht jetzt getrennt und vorn.
  const fristenNote = describeDeadlineTally(tallyWorstDeadlines(alle.map(fristenVon), now));

  // Fahrzeuge ganz ohne hinterlegte Frist tauchen in keiner der obigen
  // Zahlen auf — ohne Datum kein Zustand, kein Badge, kein Zaehler. Nur
  // strassengebundene Arten pruefen, damit die Motorsaege ohne TUEV-Datum
  // nicht jeden Tag eine Warnung ausloest.
  const strassenfahrzeuge = alle.filter((v) => needsRoadDeadlines(v.vehicle_type));
  const ohneTuev = strassenfahrzeuge.filter((v) => v.next_tuev_at === null).length;
  const ohneVersicherung = strassenfahrzeuge.filter(
    (v) => v.insurance_expires_at === null,
  ).length;
  // Bei einer abgelaufenen Frist steht der Zustand im Badge, nicht nur die
  // Farbe: "TÜV 30.07.2026" in Rot verlangt vom Leser, das Datum mit heute
  // zu vergleichen. "TÜV abgelaufen seit 16 Tagen" nicht.
  const fristText = (status: DeadlineStatus, date: string | null) =>
    status === 'expired' ? describeDeadline(date, now) : dueLabel(date);

  const unmonitoredNotes = [
    describeUnmonitored(ohneTuev, { one: 'Fahrzeug', many: 'Fahrzeuge' }, 'TÜV-Frist'),
    describeUnmonitored(
      ohneVersicherung,
      { one: 'Fahrzeug', many: 'Fahrzeuge' },
      'Versicherungs-Frist',
    ),
  ].filter((v): v is string => v !== null);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Fahrzeuge"
        description={`${items.length} Fahrzeug${items.length === 1 ? '' : 'e'}${
          fristenNote ? ` · ${fristenNote}` : ''
        }`}
        action={
          canCreate ? <LinkButton href="/vehicles/new">Neues Fahrzeug</LinkButton> : undefined
        }
      />

      <VehiclesFilter
        currentType={params.type}
        currentStatus={params.status}
        currentDue={params.due === '1'}
        currentQ={params.q}
      />

      {unmonitoredNotes.length > 0 && (
        <div
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="status"
        >
          <p className="font-medium">Fristen ohne Termin</p>
          <ul className="mt-1 flex flex-col gap-1 text-[var(--color-muted-foreground)]">
            {unmonitoredNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Keine Fahrzeuge"
          description={
            params.type || params.status || params.due === '1' || params.q
              ? 'Keine Treffer für die aktuellen Filter.'
              : 'Legen Sie das erste Fahrzeug an.'
          }
          action={
            canCreate ? <LinkButton href="/vehicles/new">Erstes Fahrzeug anlegen</LinkButton> : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((v) => {
              const driver = v.primary_driver_user_id
                ? driverById.get(v.primary_driver_user_id)
                : null;
              const tuevStatus = deadlineStatus(v.next_tuev_at, now);
              const serviceStatus = deadlineStatus(v.next_service_at, now);
              const insStatus = deadlineStatus(v.insurance_expires_at, now);
              return (
                <li key={v.id}>
                  <Link
                    href={`/vehicles/${v.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="muted">{v.license_plate}</Badge>
                        <span className="truncate font-medium">
                          {v.make} {v.model}
                        </span>
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {VEHICLE_TYPE_LABEL[v.vehicle_type as VehicleType] ?? v.vehicle_type}
                        </span>
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {v.code ? `${v.code} · ` : ''}
                        {v.mileage_km !== null
                          ? `${(v.mileage_km ?? 0).toLocaleString('de-DE')} km · `
                          : ''}
                        {driver ? `Fahrer: ${driver}` : 'kein Fahrer zugewiesen'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {tuevStatus !== 'none' && (
                        <Badge tone={DEADLINE_TONE[tuevStatus]}>
                          TÜV {fristText(tuevStatus, v.next_tuev_at)}
                        </Badge>
                      )}
                      {serviceStatus !== 'none' && (
                        <Badge tone={DEADLINE_TONE[serviceStatus]}>
                          Service {fristText(serviceStatus, v.next_service_at)}
                        </Badge>
                      )}
                      {insStatus !== 'none' && (
                        <Badge tone={DEADLINE_TONE[insStatus]}>
                          Vers. {fristText(insStatus, v.insurance_expires_at)}
                        </Badge>
                      )}
                      <Badge tone={STATUS_TONE[v.status as VehicleStatus] ?? 'neutral'}>
                        {STATUS_LABEL[v.status as VehicleStatus] ?? v.status}
                      </Badge>
                    </div>
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

function VehiclesFilter({
  currentType,
  currentStatus,
  currentDue,
  currentQ,
}: {
  currentType?: string;
  currentStatus?: string;
  currentDue: boolean;
  currentQ?: string;
}) {
  return (
    <form action="/vehicles" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="search"
        name="q"
        defaultValue={currentQ ?? ''}
        placeholder="Kennzeichen / Marke / Modell …"
        className="w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      />
      <label htmlFor="type" className="text-[var(--color-muted-foreground)]">
        Typ:
      </label>
      <select
        id="type"
        name="type"
        defaultValue={currentType ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {VEHICLE_TYPES.map((k) => (
          <option key={k} value={k}>
            {VEHICLE_TYPE_LABEL[k]}
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
        <option value="active">Aktiv</option>
        <option value="inactive">Inaktiv</option>
        <option value="maintenance">In Wartung</option>
        <option value="retired">Ausgemustert</option>
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" name="due" value="1" defaultChecked={currentDue} />
        <span className="text-[var(--color-muted-foreground)]">Frist ≤ 60 Tage</span>
      </label>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentType || currentStatus || currentDue || currentQ) && (
        <Link href="/vehicles" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
