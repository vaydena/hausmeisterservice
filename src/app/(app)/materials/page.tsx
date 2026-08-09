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
import {
  CATEGORY_LABEL,
  MATERIAL_CATEGORIES,
  STATUS_LABEL,
  STATUS_TONE,
  type MaterialCategory,
  type MaterialStatus,
} from '@/lib/schemas/materials';

export const metadata: Metadata = { title: 'Material' };

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string; low?: string; q?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  let query = supabase
    .from('materials')
    .select(
      'id, code, label, sku, category, unit, current_stock, min_stock, status, storage_location, supplier',
    )
    .is('deleted_at', null)
    .order('label', { ascending: true });

  if (params.category) query = query.eq('category', params.category);
  if (params.status) query = query.eq('status', params.status);
  if (params.q && params.q.trim().length > 0) {
    query = query.ilike('label', `%${params.q.trim()}%`);
  }

  const { data: materialsRaw } = await query;
  let items = (materialsRaw ?? []).map((m) => ({
    ...m,
    current_stock: Number(m.current_stock),
    min_stock: Number(m.min_stock),
  }));

  if (params.low === '1') {
    items = items.filter((m) => m.current_stock < m.min_stock);
  }

  const canCreate = permissions.has('materials.create');
  const totalCount = items.length;
  const lowCount = items.filter((m) => m.current_stock < m.min_stock).length;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Material"
        description={`${totalCount} Artikel${lowCount > 0 ? ` · ${lowCount} unter Meldebestand` : ''}`}
        action={
          canCreate ? <LinkButton href="/materials/new">Neuer Artikel</LinkButton> : undefined
        }
      />

      <MaterialsFilter
        currentCategory={params.category}
        currentStatus={params.status}
        currentLow={params.low === '1'}
        currentQ={params.q}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Keine Materialien"
          description={
            params.category || params.status || params.low === '1' || params.q
              ? 'Keine Treffer für die aktuellen Filter.'
              : 'Legen Sie den ersten Artikel an, um den Bestand zu erfassen.'
          }
          action={
            canCreate ? (
              <LinkButton href="/materials/new">Ersten Artikel anlegen</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((m) => {
              const isLow = m.current_stock < m.min_stock;
              return (
                <li key={m.id}>
                  <Link
                    href={`/materials/${m.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {m.code && <Badge tone="muted">{m.code}</Badge>}
                        <span className="truncate font-medium">{m.label}</span>
                        {m.sku && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            SKU {m.sku}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {CATEGORY_LABEL[m.category as MaterialCategory] ?? m.category}
                        {m.storage_location ? ` · ${m.storage_location}` : ''}
                        {m.supplier ? ` · ${m.supplier}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-medium tabular-nums ${
                          isLow ? 'text-[var(--color-destructive)]' : ''
                        }`}
                      >
                        {m.current_stock.toLocaleString('de-DE')} {m.unit}
                      </span>
                      {isLow && <Badge tone="danger">Meldebestand</Badge>}
                      <Badge tone={STATUS_TONE[m.status as MaterialStatus] ?? 'neutral'}>
                        {STATUS_LABEL[m.status as MaterialStatus] ?? m.status}
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

function MaterialsFilter({
  currentCategory,
  currentStatus,
  currentLow,
  currentQ,
}: {
  currentCategory?: string;
  currentStatus?: string;
  currentLow: boolean;
  currentQ?: string;
}) {
  return (
    <form action="/materials" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="search"
        name="q"
        defaultValue={currentQ ?? ''}
        placeholder="Suche …"
        className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      />
      <label htmlFor="category" className="text-[var(--color-muted-foreground)]">
        Kategorie:
      </label>
      <select
        id="category"
        name="category"
        defaultValue={currentCategory ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {MATERIAL_CATEGORIES.map((k) => (
          <option key={k} value={k}>
            {CATEGORY_LABEL[k]}
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
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" name="low" value="1" defaultChecked={currentLow} />
        <span className="text-[var(--color-muted-foreground)]">Nur Meldebestand</span>
      </label>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentCategory || currentStatus || currentLow || currentQ) && (
        <Link href="/materials" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
