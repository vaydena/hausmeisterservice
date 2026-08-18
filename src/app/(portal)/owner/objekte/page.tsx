import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Objekte · Eigentümer-Portal' };

export default async function OwnerObjektePage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const supabase = await createSupabaseServerClient();
  const properties = unwrapRows(
    await supabase
      .from('properties')
      .select('id, name, code, property_type, street, house_number, postal_code, city')
      .order('name', { ascending: true }),
    'Eigentümerportal: Objekte',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Objekte" description="Ihre Objekte im Überblick." />

      {properties.length === 0 ? (
        <EmptyState
          title="Keine Objekte zugeordnet"
          description="Sobald Ihre Hausverwaltung Ihnen ein Objekt zuordnet, erscheint es hier."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {properties.map((p) => {
              const address = [
                [p.street, p.house_number].filter(Boolean).join(' '),
                [p.postal_code, p.city].filter(Boolean).join(' '),
              ]
                .filter(Boolean)
                .join(', ');
              return (
                <li key={p.id}>
                  <Link
                    href={`/owner/objekte/${p.id}`}
                    className="flex flex-col gap-1 p-4 transition hover:bg-[var(--color-muted)]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {p.code && <Badge tone="muted">{p.code}</Badge>}
                      <span className="font-medium">{p.name}</span>
                    </div>
                    {address && (
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        {address}
                      </span>
                    )}
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
