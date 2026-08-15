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
import { OWNER_KIND_LABEL, ownerDisplayName, type OwnerKind } from '@/lib/schemas/owners';
import { unwrapRows } from '@/lib/supabase/unwrap';

export const metadata: Metadata = { title: 'Eigentümer' };

export default async function OwnersPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const [ownersRes, assignmentsRes] = await Promise.all([
    supabase
      .from('owners')
      .select('id, kind, first_name, last_name, company_name, email, phone, city')
      .is('deleted_at', null)
      .order('kind')
      .order('company_name')
      .order('last_name'),
    supabase.from('owner_properties').select('owner_id, property_id'),
  ]);
  const items = unwrapRows(ownersRes, 'Personen: owners');
  const assignments = unwrapRows(assignmentsRes, 'Personen: owner_properties');

  const propertyCountByOwner = new Map<string, number>();
  for (const a of assignments)
    propertyCountByOwner.set(a.owner_id, (propertyCountByOwner.get(a.owner_id) ?? 0) + 1);

  const canCreate = permissions.has('owners.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Eigentümer"
        description="Privatpersonen, Firmen und Hausverwaltungen als Eigentümer der verwalteten Objekte."
        action={
          canCreate ? (
            <LinkButton href="/people/owners/new">Neuer Eigentümer</LinkButton>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Eigentümer erfasst"
          description="Legen Sie den ersten Eigentümer an — Privatperson, Firma oder Hausverwaltung."
          action={
            canCreate ? (
              <LinkButton href="/people/owners/new">Ersten Eigentümer anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((o) => {
              const count = propertyCountByOwner.get(o.id) ?? 0;
              return (
                <li key={o.id}>
                  <Link
                    href={`/people/owners/${o.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{ownerDisplayName(o)}</span>
                        <Badge tone="muted">
                          {OWNER_KIND_LABEL[o.kind as OwnerKind] ?? o.kind}
                        </Badge>
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {[o.email, o.phone, o.city].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--color-muted-foreground)]">
                      {count === 0
                        ? 'kein Objekt zugeordnet'
                        : `${count} ${count === 1 ? 'Objekt' : 'Objekte'}`}
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
