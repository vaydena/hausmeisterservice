import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils/format';
import {
  STATUS_LABEL,
  STATUS_TONE,
  UTILITY_LABEL,
  UTILITY_KINDS,
  type MeterStatus,
  type UtilityKind,
} from '@/lib/schemas/meters';

export const metadata: Metadata = { title: 'Zähler' };

export default async function MetersPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; utility?: string; status?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: propertiesForFilter } = await supabase
    .from('properties')
    .select('id, name')
    .is('deleted_at', null)
    .order('name');

  let query = supabase
    .from('meters')
    .select(
      'id, code, label, meter_number, utility_kind, unit_of_measure, status, property_id, location_note',
    )
    .is('deleted_at', null)
    .order('label', { ascending: true });

  if (params.property_id) query = query.eq('property_id', params.property_id);
  if (params.utility) query = query.eq('utility_kind', params.utility);
  if (params.status) query = query.eq('status', params.status);

  const { data: meters } = await query;
  const items = meters ?? [];

  // Letzte Ablesung pro Zähler
  const meterIds = items.map((m) => m.id);
  const lastReadingByMeter = new Map<string, { reading: number; read_at: string }>();
  if (meterIds.length > 0) {
    const { data: readings } = await supabase
      .from('meter_readings')
      .select('meter_id, reading, read_at')
      .in('meter_id', meterIds)
      .order('read_at', { ascending: false });
    for (const r of readings ?? []) {
      if (!lastReadingByMeter.has(r.meter_id)) {
        lastReadingByMeter.set(r.meter_id, {
          reading: Number(r.reading),
          read_at: r.read_at,
        });
      }
    }
  }

  const propertyIds = [...new Set(items.map((m) => m.property_id))];
  const { data: props } =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, name, code').in('id', propertyIds)
      : { data: [] };
  const propertyById = new Map((props ?? []).map((p) => [p.id, p]));

  const canCreate = permissions.has('meters.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Zähler"
        description="Zählerstamm und Ablesungshistorie pro Objekt."
        action={canCreate ? <LinkButton href="/meters/new">Neuer Zähler</LinkButton> : undefined}
      />

      {(propertiesForFilter?.length ?? 0) > 0 && (
        <MetersFilter
          properties={propertiesForFilter ?? []}
          currentPropertyId={params.property_id}
          currentUtility={params.utility}
          currentStatus={params.status}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Keine Zähler"
          description="Legen Sie den ersten Zähler an, um Ablesungen zu protokollieren."
          action={canCreate ? <LinkButton href="/meters/new">Ersten Zähler anlegen</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((m) => {
              const property = propertyById.get(m.property_id);
              const last = lastReadingByMeter.get(m.id);
              return (
                <li key={m.id}>
                  <Link
                    href={`/meters/${m.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {m.code && <Badge tone="muted">{m.code}</Badge>}
                        <span className="truncate font-medium">{m.label}</span>
                        {m.meter_number && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            Nr. {m.meter_number}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {' · '}
                        {UTILITY_LABEL[m.utility_kind as UtilityKind] ?? m.utility_kind}
                        {m.location_note ? ` · ${m.location_note}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {last ? (
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {last.reading.toLocaleString('de-DE')} {m.unit_of_measure} ·{' '}
                          {formatDateTime(last.read_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          Keine Ablesung
                        </span>
                      )}
                      <Badge tone={STATUS_TONE[m.status as MeterStatus] ?? 'neutral'}>
                        {STATUS_LABEL[m.status as MeterStatus] ?? m.status}
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

function MetersFilter({
  properties,
  currentPropertyId,
  currentUtility,
  currentStatus,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentUtility?: string;
  currentStatus?: string;
}) {
  return (
    <form action="/meters" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="property_id" className="text-[var(--color-muted-foreground)]">
        Objekt:
      </label>
      <select
        id="property_id"
        name="property_id"
        defaultValue={currentPropertyId ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <label htmlFor="utility" className="text-[var(--color-muted-foreground)]">
        Medium:
      </label>
      <select
        id="utility"
        name="utility"
        defaultValue={currentUtility ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {UTILITY_KINDS.map((k) => (
          <option key={k} value={k}>
            {UTILITY_LABEL[k]}
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
        <option value="defective">Defekt</option>
        <option value="replaced">Getauscht</option>
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentPropertyId || currentUtility || currentStatus) && (
        <Link href="/meters" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
