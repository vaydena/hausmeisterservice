import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils/format';
import { formatBytes } from '@/lib/schemas/documents';

export const metadata: Metadata = { title: 'Dokumente · Eigentümer-Portal' };

export default async function OwnerDokumentePage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));
  const propertyLabel = (propertyId: string | null): string => {
    if (!propertyId) return 'Objekt';
    const p = propertyById.get(propertyId);
    if (!p) return 'Objekt';
    return p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt');
  };

  const supabase = await createSupabaseServerClient();
  // documents_select_owner liefert nur objektgebundene Dokumente eigener Objekte.
  const documents = unwrapRows(
    await supabase
      .from('documents')
      .select('id, property_id, original_filename, kind, byte_size, created_at')
      .order('created_at', { ascending: false }),
    'Eigentümerportal: Dokumente',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dokumente"
        description="Dokumente zu Ihren Objekten — herunterladbar."
      />

      {documents.length === 0 ? (
        <EmptyState
          title="Keine Dokumente"
          description="Hier erscheinen Dokumente, die Ihren Objekten zugeordnet sind."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-[var(--color-border)]">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{d.original_filename}</span>
                  <span className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {propertyLabel(d.property_id)} · {formatBytes(d.byte_size)} ·{' '}
                    {formatDate(d.created_at)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="muted">{d.kind}</Badge>
                  <a
                    href={`/api/owner/documents/${d.id}/download`}
                    className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]"
                  >
                    Herunterladen
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
