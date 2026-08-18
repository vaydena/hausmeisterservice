import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Fotos · Eigentümer-Portal' };

export default async function OwnerFotosPage() {
  const ctx = await getOwnerContext();
  if (!ctx) redirect('/owner/login');

  const propertyById = new Map(ctx.properties.map((p) => [p.id, p]));
  const propertyLabel = (propertyId: string): string => {
    const p = propertyById.get(propertyId);
    if (!p) return 'Objekt';
    return p.code ? `${p.code} · ${p.name ?? 'Objekt'}` : (p.name ?? 'Objekt');
  };

  const supabase = await createSupabaseServerClient();
  const photos = unwrapRows(
    await supabase
      .from('photos')
      .select('id, property_id, caption, created_at')
      .order('created_at', { ascending: false })
      .limit(60),
    'Eigentümerportal: Fotos',
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fotos" description="Fotos zu Ihren Objekten." />

      {photos.length === 0 ? (
        <EmptyState
          title="Keine Fotos"
          description="Hier erscheinen Fotos, die zu Ihren Objekten dokumentiert wurden."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <a
              key={photo.id}
              href={`/api/owner/photos/${photo.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] transition hover:shadow-sm"
            >
              <div className="aspect-square overflow-hidden bg-[var(--color-muted)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/owner/photos/${photo.id}`}
                  alt={photo.caption ?? 'Foto'}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                />
              </div>
              <div className="flex flex-col gap-0.5 p-2">
                {photo.caption && (
                  <span className="truncate text-xs font-medium">{photo.caption}</span>
                )}
                <span className="truncate text-[10px] text-[var(--color-muted-foreground)]">
                  {propertyLabel(photo.property_id)} · {formatDate(photo.created_at)}
                </span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
