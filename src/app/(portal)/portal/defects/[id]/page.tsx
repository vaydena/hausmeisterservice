import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getResidentContext } from '@/lib/portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WithdrawDefectButton } from './withdraw-defect-button';
import { PortalDefectUploadForm } from './portal-defect-upload-form';

export const metadata: Metadata = {
  title: 'Meldung · Bewohner-Portal',
};

const STATUS_LABEL: Record<string, string> = {
  new: 'Neu eingereicht',
  reviewing: 'In Prüfung',
  converted: 'In Bearbeitung',
  rejected: 'Abgelehnt',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'niedrig',
  normal: 'normal',
  high: 'hoch',
  emergency: 'Notfall',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function PortalDefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('defect_reports')
    .select(
      'id, code, title, description, location_details, priority, status, category, created_at, reviewed_at, rejection_reason',
    )
    .eq('id', id)
    .eq('reporter_user_id', ctx.userId)
    .maybeSingle();

  if (!data) notFound();

  // Sprint 55: Anhaenge zur eigenen Meldung. RLS
  // (documents_select_resident_own_defect + attachments_resident_select)
  // filtert auf reporter_user_id = auth.uid(), daher ist ein zusaetzlicher
  // Filter hier redundant. Signed URLs mit 1-Stunden-TTL — reicht fuer die
  // Session-Betrachtung, Reload generiert neue.
  const { data: docs } = await supabase
    .from('documents')
    .select('id, storage_path, original_filename, mime_type, byte_size, caption, kind, created_at')
    .eq('entity_type', 'defect_report')
    .eq('entity_id', id)
    .order('created_at', { ascending: true });

  const attachments = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(d.storage_path, 3600);
      return { ...d, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/portal/defects"
          className="text-sm text-[var(--color-muted-foreground)] hover:underline"
        >
          ← zurück zu meinen Meldungen
        </Link>
      </div>

      <article className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <header className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>{data.code ?? '—'}</span>
            <span>·</span>
            <span>{STATUS_LABEL[data.status] ?? data.status}</span>
            <span>·</span>
            <span>Priorität: {PRIORITY_LABEL[data.priority] ?? data.priority}</span>
          </div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
        </header>

        <dl className="grid gap-3 md:grid-cols-2">
          <Row label="Eingereicht am" value={formatDateTime(data.created_at)} />
          <Row label="In Prüfung seit" value={formatDateTime(data.reviewed_at)} />
          {data.category && <Row label="Kategorie" value={data.category} />}
          {data.location_details && <Row label="Ort" value={data.location_details} />}
        </dl>

        {data.description && (
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Beschreibung
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
              {data.description}
            </p>
          </div>
        )}

        {data.status === 'rejected' && data.rejection_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
            <p className="text-xs font-medium uppercase tracking-wider">Grund der Ablehnung</p>
            <p className="mt-1">{data.rejection_reason}</p>
          </div>
        )}

        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anhänge
          </p>
          {attachments.length === 0 && (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Noch keine Anhänge. Fügen Sie ein Foto oder Dokument hinzu, um die
              Meldung zu belegen.
            </p>
          )}
        </div>

        {attachments.length > 0 && (
          <div>
            <p className="sr-only">Vorhandene Anhänge</p>
            <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {attachments.map((a) => (
                <li key={a.id}>
                  {a.kind === 'photo' && a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg border border-[var(--color-border)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.url}
                        alt={a.caption ?? a.original_filename}
                        className="aspect-square h-full w-full object-cover"
                        loading="lazy"
                      />
                      {a.caption && (
                        <p className="border-t border-[var(--color-border)] bg-[var(--color-muted)] px-2 py-1 text-xs">
                          {a.caption}
                        </p>
                      )}
                    </a>
                  ) : a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-full flex-col justify-between gap-1 rounded-lg border border-[var(--color-border)] p-3 text-xs hover:bg-[var(--color-muted)]"
                    >
                      <span className="font-medium">{a.original_filename}</span>
                      <span className="text-[var(--color-muted-foreground)]">
                        {formatBytes(a.byte_size)}
                      </span>
                    </a>
                  ) : (
                    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-xs text-[var(--color-muted-foreground)]">
                      {a.original_filename} (nicht verfügbar)
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4">
          <PortalDefectUploadForm defectId={data.id} />
        </div>

        {/*
         * Sprint 52: Zurueckziehen nur solange die Hausverwaltung noch nicht
         * reagiert hat (status='new'). Sobald der Status auf 'reviewing'
         * wechselt, bleibt die Meldung erhalten — der Bewohner soll die
         * Verwaltung ueber /portal/messages ansprechen, falls sich etwas
         * geaendert hat. reporter_user_id ist implizit ctx.userId (Query
         * oben filtert bereits darauf), keine zusaetzliche Owner-Pruefung
         * hier noetig.
         */}
        {data.status === 'new' && (
          <div className="mt-2 border-t border-[var(--color-border)] pt-4">
            <WithdrawDefectButton defectId={data.id} code={data.code} />
            <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
              Sie können diese Meldung noch zurückziehen, weil die Hausverwaltung sie
              noch nicht in Bearbeitung genommen hat.
            </p>
          </div>
        )}
      </article>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
