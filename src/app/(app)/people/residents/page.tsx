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

export const metadata: Metadata = { title: 'Bewohner' };

export default async function ResidentsPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: residents } = await supabase
    .from('residents')
    .select(
      'id, first_name, last_name, email, phone, property_id, unit_id, moved_in, moved_out',
    )
    .is('deleted_at', null)
    .order('last_name')
    .order('first_name');

  const items = residents ?? [];
  const propertyIds = [...new Set(items.map((r) => r.property_id).filter((v): v is string => Boolean(v)))];
  const unitIds = [...new Set(items.map((r) => r.unit_id).filter((v): v is string => Boolean(v)))];

  const [{ data: properties }, { data: units }] = await Promise.all([
    propertyIds.length > 0
      ? supabase.from('properties').select('id, code, name').in('id', propertyIds)
      : Promise.resolve({ data: [] }),
    unitIds.length > 0
      ? supabase.from('units').select('id, code').in('id', unitIds)
      : Promise.resolve({ data: [] }),
  ]);
  const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  const canCreate = permissions.has('residents.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Bewohner"
        description="Bewohner der verwalteten Objekte inkl. Kontaktdaten und Einzugsdatum."
        action={
          canCreate ? (
            <LinkButton href="/people/residents/new">Neuer Bewohner</LinkButton>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Bewohner erfasst"
          description="Legen Sie den ersten Bewohner an, oder importieren Sie eine Bewohnerliste."
          action={
            canCreate ? (
              <LinkButton href="/people/residents/new">Ersten Bewohner anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((r) => {
              const property = r.property_id ? propertyById.get(r.property_id) : null;
              const unit = r.unit_id ? unitById.get(r.unit_id) : null;
              const isMovedOut = r.moved_out && new Date(r.moved_out) < new Date();
              return (
                <li key={r.id}>
                  <Link
                    href={`/people/residents/${r.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">
                          {r.last_name}, {r.first_name}
                        </span>
                        {isMovedOut && <Badge tone="muted">Ausgezogen</Badge>}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}${unit ? ` · Whg. ${unit.code}` : ''}`
                          : 'Ohne Objektzuordnung'}
                        {r.moved_in && ` · Einzug ${formatDate(r.moved_in)}`}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                      {r.email && <span>{r.email}</span>}
                      {r.phone && <span>{r.phone}</span>}
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
