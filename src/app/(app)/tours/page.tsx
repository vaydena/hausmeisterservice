import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { sanitizeLikeTerm } from '@/lib/utils/search';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  TOUR_STATUSES,
  TOUR_STATUS_LABEL,
  TOUR_STATUS_TONE,
  formatDate,
  type TourStatus,
} from '@/lib/schemas/tours';

export const metadata: Metadata = { title: 'Touren' };

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; q?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  let query = supabase
    .from('tours')
    .select('id, code, title, planned_date, status, driver_user_id, vehicle_id, started_at, completed_at')
    .is('deleted_at', null)
    .order('planned_date', { ascending: false });

  if (params.status) query = query.eq('status', params.status);
  if (params.from) query = query.gte('planned_date', params.from);
  if (params.to) query = query.lte('planned_date', params.to);
  // Sprint 98: siehe materials/page.tsx — LIKE-Wildcards entfernen und den
  // Guard auf dem sanitisierten Term ziehen.
  const tourSearch = sanitizeLikeTerm(params.q);
  if (tourSearch.length > 0) {
    query = query.ilike('title', `%${tourSearch}%`);
  }

  const { data: toursRaw } = await query;
  const tours = toursRaw ?? [];

  const driverIds = [
    ...new Set(tours.map((t) => t.driver_user_id).filter((x): x is string => Boolean(x))),
  ];
  const vehicleIds = [
    ...new Set(tours.map((t) => t.vehicle_id).filter((x): x is string => Boolean(x))),
  ];
  const [{ data: drivers }, { data: vehicles }, { data: stopsAgg }] = await Promise.all([
    driverIds.length > 0
      ? supabase.from('users').select('id, display_name').in('id', driverIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null }[] }),
    vehicleIds.length > 0
      ? supabase.from('vehicles').select('id, license_plate').in('id', vehicleIds)
      : Promise.resolve({ data: [] as { id: string; license_plate: string }[] }),
    tours.length > 0
      ? supabase
          .from('tour_stops')
          .select('tour_id')
          .in('tour_id', tours.map((t) => t.id))
      : Promise.resolve({ data: [] as { tour_id: string }[] }),
  ]);

  const driverById = new Map((drivers ?? []).map((u) => [u.id, u.display_name]));
  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v.license_plate]));
  const stopCountByTour = new Map<string, number>();
  for (const row of stopsAgg ?? []) {
    stopCountByTour.set(row.tour_id, (stopCountByTour.get(row.tour_id) ?? 0) + 1);
  }

  const canCreate = permissions.has('tours.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Touren"
        description={`${tours.length} Tour${tours.length === 1 ? '' : 'en'}`}
        action={canCreate ? <LinkButton href="/tours/new">Neue Tour</LinkButton> : undefined}
      />

      <ToursFilter
        currentStatus={params.status}
        currentFrom={params.from}
        currentTo={params.to}
        currentQ={params.q}
      />

      {tours.length === 0 ? (
        <EmptyState
          title="Keine Touren"
          description={
            params.status || params.from || params.to || params.q
              ? 'Keine Treffer für die aktuellen Filter.'
              : 'Legen Sie die erste Tour an.'
          }
          action={canCreate ? <LinkButton href="/tours/new">Erste Tour anlegen</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {tours.map((t) => {
              const driver = t.driver_user_id ? driverById.get(t.driver_user_id) : null;
              const plate = t.vehicle_id ? vehicleById.get(t.vehicle_id) : null;
              const stopCount = stopCountByTour.get(t.id) ?? 0;
              const tone = TOUR_STATUS_TONE[t.status as TourStatus] ?? 'muted';
              return (
                <li key={t.id}>
                  <Link
                    href={`/tours/${t.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="muted">{t.code ?? '—'}</Badge>
                        <span className="truncate font-medium">{t.title}</span>
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {formatDate(t.planned_date)}
                        {driver ? ` · Fahrer: ${driver}` : ''}
                        {plate ? ` · KFZ: ${plate}` : ''}
                        {` · ${stopCount} Stopp${stopCount === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{TOUR_STATUS_LABEL[t.status as TourStatus] ?? t.status}</Badge>
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

function ToursFilter({
  currentStatus,
  currentFrom,
  currentTo,
  currentQ,
}: {
  currentStatus?: string;
  currentFrom?: string;
  currentTo?: string;
  currentQ?: string;
}) {
  return (
    <form action="/tours" method="get" className="flex flex-wrap items-end gap-2 text-sm">
      <div className="flex flex-col">
        <label htmlFor="q" className="text-xs text-[var(--color-muted-foreground)]">Suche</label>
        <input
          id="q"
          type="search"
          name="q"
          defaultValue={currentQ ?? ''}
          placeholder="Titel …"
          className="w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label htmlFor="status" className="text-xs text-[var(--color-muted-foreground)]">Status</label>
        <select
          id="status"
          name="status"
          defaultValue={currentStatus ?? ''}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        >
          <option value="">Alle</option>
          {TOUR_STATUSES.map((s) => (
            <option key={s} value={s}>{TOUR_STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor="from" className="text-xs text-[var(--color-muted-foreground)]">Von</label>
        <input
          id="from"
          type="date"
          name="from"
          defaultValue={currentFrom ?? ''}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col">
        <label htmlFor="to" className="text-xs text-[var(--color-muted-foreground)]">Bis</label>
        <input
          id="to"
          type="date"
          name="to"
          defaultValue={currentTo ?? ''}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentStatus || currentFrom || currentTo || currentQ) && (
        <Link href="/tours" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
