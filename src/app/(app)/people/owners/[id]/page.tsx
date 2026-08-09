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
import { OWNER_KIND_LABEL, ownerDisplayName, type OwnerKind } from '@/lib/schemas/owners';
import {
  attachPropertyAction,
  deleteOwnerAction,
  detachPropertyAction,
} from '../actions';

export const metadata: Metadata = { title: 'Eigentümer' };

const ROLE_LABEL: Record<string, string> = {
  owner: 'Eigentümer',
  co_owner: 'Miteigentümer',
  management: 'Verwaltung',
};

export default async function OwnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: owner } = await supabase
    .from('owners')
    .select(
      'id, kind, first_name, last_name, company_name, email, phone, street, house_number, postal_code, city, country, notes, created_at, updated_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!owner) notFound();

  const [{ data: assignments }, { data: allProperties }] = await Promise.all([
    supabase
      .from('owner_properties')
      .select('property_id, role, share_percent, created_at')
      .eq('owner_id', owner.id),
    supabase
      .from('properties')
      .select('id, code, name')
      .is('deleted_at', null)
      .order('name'),
  ]);

  const attachedPropertyIds = new Set((assignments ?? []).map((a) => a.property_id));
  const propertyById = new Map((allProperties ?? []).map((p) => [p.id, p]));
  const availableProperties = (allProperties ?? []).filter((p) => !attachedPropertyIds.has(p.id));

  const canEdit = permissions.has('owners.edit');
  const canDelete = permissions.has('owners.delete');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={ownerDisplayName(owner)}
        description={undefined}
        action={
          canEdit ? (
            <LinkButton variant="outline" href={`/people/owners/${owner.id}/edit`}>
              Bearbeiten
            </LinkButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="muted">{OWNER_KIND_LABEL[owner.kind as OwnerKind] ?? owner.kind}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kontakt</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <Row label="E-Mail">
                {owner.email ? (
                  <a
                    href={`mailto:${owner.email}`}
                    className="text-[var(--color-primary)] hover:underline"
                  >
                    {owner.email}
                  </a>
                ) : (
                  '–'
                )}
              </Row>
              <Row label="Telefon">
                {owner.phone ? (
                  <a href={`tel:${owner.phone}`} className="text-[var(--color-primary)] hover:underline">
                    {owner.phone}
                  </a>
                ) : (
                  '–'
                )}
              </Row>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adresse</CardTitle>
          </CardHeader>
          <CardBody>
            {owner.street || owner.city ? (
              <address className="text-sm not-italic">
                {[owner.street, owner.house_number].filter(Boolean).join(' ')}
                <br />
                {[owner.postal_code, owner.city].filter(Boolean).join(' ')}
                <br />
                {owner.country}
              </address>
            ) : (
              <span className="text-sm text-[var(--color-muted-foreground)]">Keine Adresse hinterlegt.</span>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Zugeordnete Objekte</CardTitle>
        </CardHeader>
        <CardBody>
          {(assignments ?? []).length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Diesem Eigentümer sind noch keine Objekte zugeordnet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {(assignments ?? []).map((a) => {
                const p = propertyById.get(a.property_id);
                return (
                  <li key={a.property_id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      {p ? (
                        <Link
                          href={`/properties/${p.id}`}
                          className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                        >
                          {p.code ? `${p.code} · ${p.name}` : p.name}
                        </Link>
                      ) : (
                        <span className="text-sm text-[var(--color-muted-foreground)]">
                          Objekt entfernt
                        </span>
                      )}
                      <div className="text-xs text-[var(--color-muted-foreground)]">
                        {ROLE_LABEL[a.role ?? 'owner'] ?? a.role}
                        {a.share_percent !== null && ` · ${a.share_percent}%`}
                      </div>
                    </div>
                    {canEdit && (
                      <form action={detachPropertyAction}>
                        <input type="hidden" name="owner_id" value={owner.id} />
                        <input type="hidden" name="property_id" value={a.property_id} />
                        <button
                          type="submit"
                          aria-label="Zuordnung entfernen"
                          className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-2.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
                        >
                          Entfernen
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit && availableProperties.length > 0 && (
            <form
              action={attachPropertyAction}
              className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-4"
            >
              <input type="hidden" name="owner_id" value={owner.id} />
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="property_id"
                  className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]"
                >
                  Objekt
                </label>
                <select
                  id="property_id"
                  name="property_id"
                  required
                  defaultValue=""
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
                >
                  <option value="" disabled>
                    Objekt wählen …
                  </option>
                  {availableProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code ? `${p.code} · ${p.name}` : p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <label htmlFor="role" className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]">
                  Rolle
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue="owner"
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
                >
                  <option value="owner">Eigentümer</option>
                  <option value="co_owner">Miteigentümer</option>
                  <option value="management">Verwaltung</option>
                </select>
              </div>
              <div className="w-24">
                <label
                  htmlFor="share_percent"
                  className="mb-1 block text-xs font-medium text-[var(--color-muted-foreground)]"
                >
                  Anteil %
                </label>
                <input
                  id="share_percent"
                  name="share_percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-sm"
                />
              </div>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                Hinzufügen
              </button>
            </form>
          )}
        </CardBody>
      </Card>

      {owner.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notizen</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="whitespace-pre-line text-sm">{owner.notes}</p>
          </CardBody>
        </Card>
      )}

      {canDelete && (
        <div className="flex justify-end">
          <form action={deleteOwnerAction}>
            <input type="hidden" name="owner_id" value={owner.id} />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md border border-[var(--color-destructive)]/40 px-3 text-xs font-medium text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10"
            >
              Eigentümer entfernen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
