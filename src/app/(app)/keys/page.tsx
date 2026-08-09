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
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE, type KeyKind, type KeyStatus } from '@/lib/schemas/keys';

export const metadata: Metadata = { title: 'Schlüssel' };

export default async function KeysPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; status?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const [{ data: propertiesForFilter }] = await Promise.all([
    supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
  ]);

  let query = supabase
    .from('keys')
    .select('id, code, label, identifier, kind, status, property_id, copies_total, storage_location')
    .is('deleted_at', null)
    .order('label', { ascending: true });

  if (params.property_id) query = query.eq('property_id', params.property_id);
  if (params.status) query = query.eq('status', params.status);

  const { data: keys } = await query;
  const items = keys ?? [];

  // Offene Ausgaben pro Key aggregieren
  const keyIds = items.map((k) => k.id);
  const openIssuesByKey = new Map<string, number>();
  if (keyIds.length > 0) {
    const [{ data: issues }, { data: returns }] = await Promise.all([
      supabase
        .from('key_handovers')
        .select('id, key_id, copies_count')
        .in('key_id', keyIds)
        .eq('kind', 'issue'),
      supabase
        .from('key_handovers')
        .select('issue_handover_id')
        .in('key_id', keyIds)
        .eq('kind', 'return')
        .not('issue_handover_id', 'is', null),
    ]);
    const returnedIds = new Set((returns ?? []).map((r) => r.issue_handover_id as string));
    for (const iss of issues ?? []) {
      if (!returnedIds.has(iss.id)) {
        openIssuesByKey.set(
          iss.key_id,
          (openIssuesByKey.get(iss.key_id) ?? 0) + (iss.copies_count ?? 1),
        );
      }
    }
  }

  const propertyIds = [...new Set(items.map((k) => k.property_id))];
  const { data: props } =
    propertyIds.length > 0
      ? await supabase.from('properties').select('id, name, code').in('id', propertyIds)
      : { data: [] };
  const propertyById = new Map((props ?? []).map((p) => [p.id, p]));

  const canCreate = permissions.has('keys.create');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Schlüssel"
        description="Schlüsselstamm und Ausgabe-/Rückgabe-Historie pro Objekt."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {items.length > 0 && (
              <Link
                href={`/qr/print?type=key&ids=${items.slice(0, 60).map((k) => k.id).join(',')}`}
                target="_blank"
                className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
              >
                QR-Sammel-Druck ({Math.min(items.length, 60)})
              </Link>
            )}
            {canCreate && <LinkButton href="/keys/new">Neuer Schlüssel</LinkButton>}
          </div>
        }
      />

      {(propertiesForFilter?.length ?? 0) > 0 && (
        <PropertyFilter
          properties={propertiesForFilter ?? []}
          currentPropertyId={params.property_id}
          currentStatus={params.status}
        />
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Keine Schlüssel"
          description="Legen Sie den ersten Schlüssel an, um Ausgabe und Rückgabe zu protokollieren."
          action={canCreate ? <LinkButton href="/keys/new">Ersten Schlüssel anlegen</LinkButton> : undefined}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((k) => {
              const property = propertyById.get(k.property_id);
              const openOut = openIssuesByKey.get(k.id) ?? 0;
              return (
                <li key={k.id}>
                  <Link
                    href={`/keys/${k.id}`}
                    className="flex flex-col gap-2 p-4 transition hover:bg-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {k.code && <Badge tone="muted">{k.code}</Badge>}
                        <span className="truncate font-medium">{k.label}</span>
                        {k.identifier && (
                          <span className="text-xs text-[var(--color-muted-foreground)]">
                            #{k.identifier}
                          </span>
                        )}
                      </div>
                      <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                        {property
                          ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                          : 'Objekt entfernt'}
                        {' · '}
                        {KIND_LABEL[k.kind as KeyKind] ?? k.kind}
                        {k.storage_location ? ` · ${k.storage_location}` : ''}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {k.copies_total - openOut}/{k.copies_total} im Bestand
                      </span>
                      {openOut > 0 && <Badge tone="warning">{openOut} ausgegeben</Badge>}
                      <Badge tone={STATUS_TONE[k.status as KeyStatus] ?? 'neutral'}>
                        {STATUS_LABEL[k.status as KeyStatus] ?? k.status}
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

function PropertyFilter({
  properties,
  currentPropertyId,
  currentStatus,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentStatus?: string;
}) {
  return (
    <form action="/keys" method="get" className="flex flex-wrap items-center gap-2 text-sm">
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
        <option value="lost">Verloren</option>
        <option value="retired">Ausgemustert</option>
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentPropertyId || currentStatus) && (
        <Link href="/keys" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
