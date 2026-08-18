import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows } from '@/lib/supabase/unwrap';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { PageHeader } from '@/components/ui/page-header';
import { LinkButton } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  PHOTO_PHASES,
  PHOTO_PHASE_LABEL,
  PHOTO_PHASE_TONE,
  type PhotoPhase,
} from '@/lib/schemas/photos';
import { DeletePhotoButton } from './delete-photo-button';

export const metadata: Metadata = { title: 'Fotos' };

export default async function PhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ property_id?: string; phase?: string }>;
}) {
  const params = await searchParams;
  const ctx = await requireTenantContext();
  const permissions = await getEffectivePermissions(ctx.userId, ctx.tenantId);
  if (!permissions.has('photos.view')) notFound();

  const supabase = await createSupabaseServerClient();

  const propertiesForFilter = unwrapRows(
    await supabase.from('properties').select('id, name').is('deleted_at', null).order('name'),
    'Fotos: Objektfilter',
  );

  let query = supabase
    .from('photos')
    .select('id, property_id, work_order_id, phase, caption, uploaded_by, created_at')
    .order('created_at', { ascending: false })
    .limit(120);

  if (params.property_id) query = query.eq('property_id', params.property_id);
  if (params.phase && (PHOTO_PHASES as readonly string[]).includes(params.phase)) {
    query = query.eq('phase', params.phase);
  }

  const photos = unwrapRows(await query, 'Fotogalerie');

  // Objektnamen für die Anzeige nachladen (nur die referenzierten).
  const propertyIds = [...new Set(photos.map((p) => p.property_id))];
  const props =
    propertyIds.length > 0
      ? unwrapRows(
          await supabase.from('properties').select('id, name, code').in('id', propertyIds),
          'Fotos: Objektnamen',
        )
      : [];
  const propertyById = new Map(props.map((p) => [p.id, p]));

  const canUpload = permissions.has('photos.create');
  const canDeleteAny = permissions.has('photos.delete');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <PageHeader
        title="Fotos"
        description="Vorher/Nachher-Dokumentation je Objekt."
        action={canUpload ? <LinkButton href="/photos/upload">Fotos hochladen</LinkButton> : undefined}
      />

      {propertiesForFilter.length > 0 && (
        <PhotoFilter
          properties={propertiesForFilter}
          currentPropertyId={params.property_id}
          currentPhase={params.phase}
        />
      )}

      {photos.length === 0 ? (
        <EmptyState
          title="Keine Fotos"
          description={
            params.property_id || params.phase
              ? 'Für diese Auswahl gibt es keine Fotos.'
              : 'Halten Sie den Zustand vor Ort fest — Wasserschaden, erledigte Reparatur, Grünpflege.'
          }
          action={canUpload ? <LinkButton href="/photos/upload">Erste Fotos hochladen</LinkButton> : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => {
            const property = propertyById.get(photo.property_id);
            const phase = photo.phase as PhotoPhase;
            const canDelete = canDeleteAny || photo.uploaded_by === ctx.userId;
            return (
              <figure
                key={photo.id}
                className="group relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]"
              >
                <Link href={`/api/photos/${photo.id}`} target="_blank" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photos/${photo.id}`}
                    alt={photo.caption ?? 'Foto'}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition group-hover:opacity-95"
                  />
                </Link>
                <div className="pointer-events-none absolute left-2 top-2">
                  <Badge tone={PHOTO_PHASE_TONE[phase]}>{PHOTO_PHASE_LABEL[phase]}</Badge>
                </div>
                {canDelete && <DeletePhotoButton photoId={photo.id} />}
                <figcaption className="flex flex-col gap-0.5 p-2">
                  <span className="truncate text-xs font-medium">
                    {property
                      ? `${property.code ? property.code + ' · ' : ''}${property.name}`
                      : 'Objekt entfernt'}
                  </span>
                  {photo.caption && (
                    <span className="line-clamp-2 text-xs text-[var(--color-muted-foreground)]">
                      {photo.caption}
                    </span>
                  )}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PhotoFilter({
  properties,
  currentPropertyId,
  currentPhase,
}: {
  properties: { id: string; name: string }[];
  currentPropertyId?: string;
  currentPhase?: string;
}) {
  return (
    <form action="/photos" method="get" className="flex flex-wrap items-center gap-2 text-sm">
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
      <label htmlFor="phase" className="text-[var(--color-muted-foreground)]">
        Phase:
      </label>
      <select
        id="phase"
        name="phase"
        defaultValue={currentPhase ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {PHOTO_PHASES.map((ph) => (
          <option key={ph} value={ph}>
            {PHOTO_PHASE_LABEL[ph]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentPropertyId || currentPhase) && (
        <Link href="/photos" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
