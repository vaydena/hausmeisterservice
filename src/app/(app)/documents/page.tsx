import type { Metadata } from 'next';
import Link from 'next/link';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapRows, unwrapRowsWithCount } from '@/lib/supabase/unwrap';
import { sanitizeOrFilterTerm } from '@/lib/utils/search';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ModuleLink } from '@/components/ui/module-link';
import {
  DOC_ENTITY_LABEL,
  DOC_ENTITY_TYPES,
  DOC_KIND_LABEL,
  DOC_KINDS,
  documentEntityHref,
  formatBytes,
  type DocumentEntityType,
  type DocumentKind,
} from '@/lib/schemas/documents';

export const metadata: Metadata = { title: 'Dokumente' };

/**
 * Sprint 120: die zentrale Dokumentenliste.
 *
 * Der Menuepunkt "Dokumente" stand seit Sprint 14 in der Sidebar, die Seite
 * dazu nie — wer das Modul aktiviert hatte und klickte, bekam 404. Hochgeladen
 * wurde trotzdem die ganze Zeit: an Auftraegen, Meldungen, Pruefpunkten und
 * Objekten. Die Dateien waren also da, nur nirgends gemeinsam sichtbar. Genau
 * das ist der Zweck dieser Seite — "wo ist nochmal das Foto vom Schaden im
 * Treppenhaus" laesst sich sonst nur beantworten, wenn man den Vorgang schon
 * kennt.
 *
 * Bewusst KEINE Vorschaubilder: `DocumentList` auf den Detailseiten erzeugt
 * pro Datei eine signierte URL, weil dort ein Handvoll Anhaenge stehen. Hier
 * waeren das 50 Storage-Aufrufe je Seitenaufbau. Die Signatur entsteht deshalb
 * erst beim Klick, im Handler unter `/api/documents/[id]/download`.
 */

const PAGE_SIZE = 50;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; entity?: string; page?: string }>;
}) {
  const params = await searchParams;
  await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Nur Werte aus den bekannten Mengen in die Query lassen. Sonst landet ein
  // beliebiger Query-String in .eq() — die Antwort ist dann zwar leer statt
  // falsch, sieht aber aus wie "es gibt hier nichts".
  const kind = DOC_KINDS.includes(params.kind as DocumentKind)
    ? (params.kind as DocumentKind)
    : null;
  const entity = DOC_ENTITY_TYPES.includes(params.entity as DocumentEntityType)
    ? (params.entity as DocumentEntityType)
    : null;

  let query = supabase
    .from('documents')
    .select(
      'id, entity_type, entity_id, property_id, kind, original_filename, mime_type, byte_size, caption, uploaded_by, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (kind) query = query.eq('kind', kind);
  if (entity) query = query.eq('entity_type', entity);

  const term = sanitizeOrFilterTerm(params.q);
  if (term.length > 0) {
    query = query.or(`original_filename.ilike.%${term}%,caption.ilike.%${term}%`);
  }

  const { rows: docs, count: total } = unwrapRowsWithCount(await query, 'Dokumente');
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Nachschlagen nur fuer die sichtbare Seite: drei gebuendelte Abfragen
  // statt einer pro Zeile.
  const propertyIds = uniqueIds(docs.map((d) => d.property_id));
  const uploaderIds = uniqueIds(docs.map((d) => d.uploaded_by));
  const runItemIds = uniqueIds(
    docs.filter((d) => d.entity_type === 'checklist_run_item').map((d) => d.entity_id),
  );

  const properties =
    propertyIds.length > 0
      ? unwrapRows(
          await supabase.from('properties').select('id, code, name').in('id', propertyIds),
          'Dokumente: Objektnamen',
        )
      : [];
  const uploaders =
    uploaderIds.length > 0
      ? unwrapRows(
          await supabase.from('users').select('id, display_name').in('id', uploaderIds),
          'Dokumente: Hochgeladen-von',
        )
      : [];
  // Die documents-Zeile kennt den Pruefpunkt, aber nicht den Durchlauf, auf
  // dessen Seite er steht. Ohne diese Aufloesung bliebe der Rueckweg leer.
  const runItems =
    runItemIds.length > 0
      ? unwrapRows(
          await supabase.from('checklist_run_items').select('id, run_id').in('id', runItemIds),
          'Dokumente: Checklisten-Durchlaeufe',
        )
      : [];

  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const uploaderById = new Map(uploaders.map((u) => [u.id, u.display_name]));
  const runIdByItemId = new Map(runItems.map((i) => [i.id, i.run_id]));

  const hasFilter = Boolean(params.q || kind || entity);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <PageHeader
        title="Dokumente"
        description={
          total === 0
            ? 'Keine Dokumente.'
            : `${total} Dokument${total === 1 ? '' : 'e'} · Fotos und Dateien aus allen Vorgängen`
        }
      />

      <DocumentsFilter currentQ={params.q} currentKind={kind} currentEntity={entity} />

      {docs.length === 0 ? (
        <EmptyState
          title={hasFilter ? 'Keine Treffer' : 'Noch keine Dokumente'}
          description={
            hasFilter
              ? 'Keine Dokumente für die aktuellen Filter.'
              : 'Dateien und Fotos werden direkt am Auftrag, an der Meldung oder am Objekt hochgeladen und erscheinen dann hier.'
          }
        />
      ) : (
        <Card>
          <CardBody className="!p-0">
            <ul className="divide-y divide-[var(--color-border)]">
              {docs.map((doc) => {
                const entityType = doc.entity_type as DocumentEntityType;
                const property = doc.property_id ? propertyById.get(doc.property_id) : null;
                const backHref = documentEntityHref(entityType, doc.entity_id, {
                  propertyId: doc.property_id,
                  checklistRunId: runIdByItemId.get(doc.entity_id) ?? null,
                });
                const uploader = doc.uploaded_by ? uploaderById.get(doc.uploaded_by) : null;

                return (
                  <li key={doc.id} className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={doc.kind === 'photo' ? 'primary' : 'neutral'}>
                        {DOC_KIND_LABEL[doc.kind as DocumentKind] ?? 'Datei'}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {doc.caption ?? doc.original_filename}
                      </span>
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        className="inline-flex h-8 shrink-0 items-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]"
                      >
                        Öffnen
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
                      <span>Gehört zu:</span>
                      {backHref ? (
                        // ModuleLink, weil jedes Ziel in einem fremden Modul
                        // liegt: Auftraege, Meldungen, Objekte, Checklisten.
                        // Ist es abgeschaltet, bleibt die Herkunft als Wort
                        // stehen und verliert nur den Link.
                        <ModuleLink
                          href={backHref}
                          className="text-[var(--color-primary)] hover:underline"
                        >
                          {DOC_ENTITY_LABEL[entityType] ?? entityType}
                        </ModuleLink>
                      ) : (
                        <span>{DOC_ENTITY_LABEL[entityType] ?? entityType}</span>
                      )}
                      {property && (
                        <>
                          <span aria-hidden>·</span>
                          <ModuleLink
                            href={`/properties/${property.id}`}
                            className="text-[var(--color-primary)] hover:underline"
                          >
                            {property.code ? `${property.code} ${property.name}` : property.name}
                          </ModuleLink>
                        </>
                      )}
                      <span aria-hidden>·</span>
                      <span>{formatBytes(doc.byte_size)}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDateTime(doc.created_at)}</span>
                      {uploader && (
                        <>
                          <span aria-hidden>·</span>
                          <span>von {uploader}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={pageHref(params, page - 1)} className="text-[var(--color-primary)] hover:underline">
              ← Neuere
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--color-muted-foreground)]">
            Seite {page} von {totalPages}
          </span>
          {page < totalPages ? (
            <Link href={pageHref(params, page + 1)} className="text-[var(--color-primary)] hover:underline">
              Ältere →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}

function uniqueIds(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Filter beim Blaettern behalten — sonst springt Seite 2 auf alles zurueck. */
function pageHref(
  params: { q?: string; kind?: string; entity?: string },
  page: number,
): string {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.kind) query.set('kind', params.kind);
  if (params.entity) query.set('entity', params.entity);
  query.set('page', String(page));
  return `/documents?${query.toString()}`;
}

function DocumentsFilter({
  currentQ,
  currentKind,
  currentEntity,
}: {
  currentQ?: string;
  currentKind: DocumentKind | null;
  currentEntity: DocumentEntityType | null;
}) {
  return (
    <form action="/documents" method="get" className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="search"
        name="q"
        defaultValue={currentQ ?? ''}
        placeholder="Dateiname / Beschriftung …"
        className="w-64 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      />
      <label htmlFor="kind" className="text-[var(--color-muted-foreground)]">
        Art:
      </label>
      <select
        id="kind"
        name="kind"
        defaultValue={currentKind ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {DOC_KINDS.map((k) => (
          <option key={k} value={k}>
            {DOC_KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <label htmlFor="entity" className="text-[var(--color-muted-foreground)]">
        Gehört zu:
      </label>
      <select
        id="entity"
        name="entity"
        defaultValue={currentEntity ?? ''}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-sm"
      >
        <option value="">Alle</option>
        {DOC_ENTITY_TYPES.map((t) => (
          <option key={t} value={t}>
            {DOC_ENTITY_LABEL[t]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="inline-flex h-8 items-center rounded-md bg-[var(--color-muted)] px-3 text-xs font-medium hover:opacity-80"
      >
        Anwenden
      </button>
      {(currentQ || currentKind || currentEntity) && (
        <Link href="/documents" className="text-xs text-[var(--color-muted-foreground)] underline">
          Zurücksetzen
        </Link>
      )}
    </form>
  );
}
