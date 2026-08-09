import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  DOC_KIND_LABEL,
  formatBytes,
  type DocumentKind,
} from '@/lib/schemas/documents';
import {
  createSignedDocumentUrl,
  deleteDocumentAction,
} from '@/lib/documents/actions';

export type DocumentRow = {
  id: string;
  kind: DocumentKind | string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  caption: string | null;
  created_at: string;
  uploaded_by: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function DocumentList({
  documents,
  canDelete = true,
  emptyLabel = 'Noch keine Dokumente hochgeladen.',
}: {
  documents: DocumentRow[];
  canDelete?: boolean;
  emptyLabel?: string;
}) {
  if (documents.length === 0) {
    return <EmptyState title={emptyLabel} />;
  }

  const withUrls = await Promise.all(
    documents.map(async (doc) => ({
      doc,
      url: await createSignedDocumentUrl(doc.storage_path, 3600),
    })),
  );

  const photos = withUrls.filter(({ doc }) => doc.kind === 'photo');
  const files = withUrls.filter(({ doc }) => doc.kind !== 'photo');

  return (
    <div className="flex flex-col gap-4">
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map(({ doc, url }) => (
            <figure
              key={doc.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={doc.caption ?? doc.original_filename}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square w-full bg-[var(--color-muted)]" />
              )}
              <figcaption className="flex flex-col gap-1 border-t border-[var(--color-border)] bg-[var(--color-background)] p-2 text-xs">
                <span className="line-clamp-2 font-medium">
                  {doc.caption ?? doc.original_filename}
                </span>
                <span className="text-[var(--color-muted-foreground)]">
                  {formatBytes(doc.byte_size)} · {formatDate(doc.created_at)}
                </span>
                {canDelete && (
                  <form action={deleteDocumentAction} className="mt-1">
                    <input type="hidden" name="document_id" value={doc.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="w-full text-[var(--color-destructive)]"
                    >
                      Löschen
                    </Button>
                  </form>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
          {files.map(({ doc, url }) => (
            <li
              key={doc.id}
              className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col text-sm">
                <span className="font-medium">
                  {doc.caption ?? doc.original_filename}
                </span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {DOC_KIND_LABEL[doc.kind as DocumentKind] ?? 'Datei'} ·{' '}
                  {formatBytes(doc.byte_size)} · {formatDate(doc.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-muted)]"
                  >
                    Öffnen
                  </a>
                )}
                {canDelete && (
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="document_id" value={doc.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-[var(--color-destructive)]"
                    >
                      Löschen
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
