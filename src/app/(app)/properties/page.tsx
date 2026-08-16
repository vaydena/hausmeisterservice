import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { ModuleGate } from '@/components/ui/module-link';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = { title: 'Objekte' };

export default async function PropertiesPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, code, name, property_type, street, house_number, postal_code, city, updated_at')
    .is('deleted_at', null)
    .order('name');

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Objekte" />
        <p className="mt-4 text-sm text-[var(--color-destructive)]">
          Objekte konnten nicht geladen werden.
        </p>
      </div>
    );
  }

  const canCreate = permissions.has('properties.create');
  const items = properties ?? [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Objekte"
        description="Liegenschaften mit Adresse, Zugangs- und Notfallhinweisen."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {items.length > 0 && (
              <ModuleGate href="/qr/print">
                <Link
                  href={`/qr/print?type=property&ids=${items.slice(0, 60).map((p) => p.id).join(',')}`}
                  target="_blank"
                  className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                >
                  QR-Sammel-Druck ({Math.min(items.length, 60)})
                </Link>
              </ModuleGate>
            )}
            {canCreate && <LinkButton href="/properties/new">Neues Objekt</LinkButton>}
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Objekte angelegt"
          description="Sobald Objekte angelegt sind, erscheinen sie hier mit Adresse und Aufträgen."
          action={
            canCreate ? <LinkButton href="/properties/new">Erstes Objekt anlegen</LinkButton> : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/properties/${p.id}`}
                  className="flex items-center justify-between gap-4 p-4 transition hover:bg-[var(--color-muted)]"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {p.code && <Badge tone="muted">{p.code}</Badge>}
                      <span className="font-medium">{p.name}</span>
                      {p.property_type && (
                        <span className="text-xs text-[var(--color-muted-foreground)]">
                          {p.property_type}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {formatAddress(p)}
                    </p>
                  </div>
                  <span className="text-sm text-[var(--color-muted-foreground)]">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function formatAddress(p: {
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
}): string {
  const line1 = [p.street, p.house_number].filter(Boolean).join(' ');
  const line2 = [p.postal_code, p.city].filter(Boolean).join(' ');
  const combined = [line1, line2].filter((s) => s.length > 0).join(', ');
  return combined.length > 0 ? combined : 'Keine Adresse hinterlegt';
}
