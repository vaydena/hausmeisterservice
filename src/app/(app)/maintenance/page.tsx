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
import { formatDate } from '@/lib/utils/format';
import {
  DUE_LABEL,
  DUE_TONE,
  dueBucket,
  intervalLabel,
  daysUntil,
} from '@/lib/schemas/maintenance';

export const metadata: Metadata = { title: 'Wartungen' };

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = params.filter ?? 'active';

  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: plans } = await supabase
    .from('maintenance_plans')
    .select(
      'id, code, title, category, property_id, interval_days, next_due_at, last_completed_at, priority, active',
    )
    .is('deleted_at', null)
    .order('next_due_at');

  const items = plans ?? [];
  const filtered = items.filter((p) => {
    const bucket = dueBucket(p.next_due_at, p.active);
    if (filter === 'all') return true;
    if (filter === 'inactive') return bucket === 'inactive';
    if (filter === 'overdue') return bucket === 'overdue';
    if (filter === 'due_soon') return bucket === 'due_soon' || bucket === 'overdue';
    return bucket !== 'inactive';
  });

  const counts = {
    all: items.length,
    active: items.filter((p) => dueBucket(p.next_due_at, p.active) !== 'inactive').length,
    overdue: items.filter((p) => dueBucket(p.next_due_at, p.active) === 'overdue').length,
    due_soon: items.filter((p) => {
      const b = dueBucket(p.next_due_at, p.active);
      return b === 'overdue' || b === 'due_soon';
    }).length,
    inactive: items.filter((p) => !p.active).length,
  };

  const propertyIds = [...new Set(items.map((p) => p.property_id))];
  const { data: properties } =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, code, name').in('id', propertyIds)
      : { data: [] };
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));

  const canCreate = permissions.has('maintenance.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Wartungspläne"
        description="Wiederkehrende Wartungen und Prüfungen — jederzeit per Klick in einen Auftrag überführen."
        action={
          canCreate ? <LinkButton href="/maintenance/new">Neuer Wartungsplan</LinkButton> : undefined
        }
      />

      <FilterTabs current={filter} counts={counts} />

      {filtered.length === 0 ? (
        <EmptyState
          title={emptyTitle(filter)}
          description={emptyDescription(filter)}
          action={
            canCreate && filter === 'active' ? (
              <LinkButton href="/maintenance/new">Ersten Wartungsplan anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {filtered.map((p) => {
              const property = propertyById.get(p.property_id);
              const bucket = dueBucket(p.next_due_at, p.active);
              const diff = daysUntil(p.next_due_at);
              return (
                <li key={p.id}>
                  <Link
                    href={`/maintenance/${p.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {p.code && <Badge tone="muted">{p.code}</Badge>}
                        <span className="truncate font-medium">{p.title}</span>
                        {p.category && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            {p.category}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {' · '}
                        {intervalLabel(p.interval_days)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        Fällig {formatDate(p.next_due_at)}
                        {bucket === 'overdue' && ` (${-diff} T. überfällig)`}
                        {bucket === 'due_soon' && diff >= 0 && ` (in ${diff} T.)`}
                      </span>
                      <Badge tone={DUE_TONE[bucket]}>{DUE_LABEL[bucket]}</Badge>
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

function FilterTabs({
  current,
  counts,
}: {
  current: string;
  counts: Record<string, number>;
}) {
  const tabs: Array<{ key: string; label: string }> = [
    { key: 'active', label: 'Aktiv' },
    { key: 'due_soon', label: 'Bald fällig' },
    { key: 'overdue', label: 'Überfällig' },
    { key: 'inactive', label: 'Inaktiv' },
    { key: 'all', label: 'Alle' },
  ];
  return (
    <nav className="-mx-1 flex flex-wrap gap-1 overflow-x-auto">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={`/maintenance?filter=${t.key}`}
            className={
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ' +
              (active
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]')
            }
          >
            {t.label}
            {(counts[t.key] ?? 0) > 0 && (
              <span
                className={
                  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 text-xs ' +
                  (active ? 'bg-white/20' : 'bg-[var(--color-muted)]')
                }
              >
                {counts[t.key]}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function emptyTitle(filter: string): string {
  switch (filter) {
    case 'overdue':
      return 'Keine überfälligen Wartungen';
    case 'due_soon':
      return 'Nichts steht kurzfristig an';
    case 'inactive':
      return 'Keine inaktiven Pläne';
    case 'all':
      return 'Noch keine Wartungspläne';
    default:
      return 'Keine aktiven Wartungspläne';
  }
}

function emptyDescription(filter: string): string {
  switch (filter) {
    case 'overdue':
      return 'Alle aktiven Wartungspläne sind auf dem Laufenden.';
    case 'due_soon':
      return 'In den nächsten sieben Tagen ist nichts fällig.';
    case 'inactive':
      return 'Alle vorhandenen Pläne sind derzeit aktiv.';
    default:
      return 'Wartungspläne definieren wiederkehrende Aufgaben wie Heizungsprüfung, Rauchmelder-Wartung oder Grünpflege.';
  }
}
