import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ info?: string }>;
}) {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const { id } = await params;
  const { info } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('defect_reports')
    .select(
      'id, code, title, description, location_details, priority, status, category, created_at, reviewed_at, updated_at, rejection_reason, converted_work_order_id',
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

      {info === 'upload-failed' && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">Meldung erstellt, Anhang konnte nicht gespeichert werden.</p>
          <p className="mt-1">
            Die Meldung wurde übernommen, aber die Datei hat es nicht in die
            Ablage geschafft. Sie können den Anhang unten erneut hochladen.
          </p>
        </div>
      )}

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

        {/*
         * Sprint 60: Statuswechsel-Timeline rekonstruiert aus vorhandenen
         * Timestamps (created_at, reviewed_at, updated_at). Kein separater
         * Audit-Log noetig -- die drei Zeitmarker + Status/rejection_reason
         * reichen fuer die aus Bewohnersicht relevanten Uebergaenge:
         * Eingereicht -> In Pruefung -> In Bearbeitung/Abgelehnt.
         */}
        <StatusTimeline data={data} />


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

type TimelineStep = {
  key: string;
  label: string;
  timestamp: string | null;
  detail?: string | null;
  state: 'done' | 'active' | 'rejected';
};

function buildTimeline(data: {
  status: string;
  created_at: string;
  reviewed_at: string | null;
  updated_at: string;
  rejection_reason: string | null;
  converted_work_order_id: string | null;
}): TimelineStep[] {
  const steps: TimelineStep[] = [
    {
      key: 'submitted',
      label: 'Eingereicht',
      timestamp: data.created_at,
      state: 'done',
    },
  ];

  if (data.reviewed_at) {
    steps.push({
      key: 'reviewing',
      label: 'In Prüfung genommen',
      timestamp: data.reviewed_at,
      state: data.status === 'reviewing' ? 'active' : 'done',
    });
  } else if (data.status === 'new') {
    steps.push({
      key: 'waiting',
      label: 'Wartet auf Sichtung',
      timestamp: null,
      state: 'active',
    });
  }

  if (data.status === 'converted') {
    steps.push({
      key: 'converted',
      label: 'In Bearbeitung als Auftrag',
      timestamp: data.updated_at,
      detail: data.converted_work_order_id
        ? 'Die Hausverwaltung hat einen internen Auftrag erstellt.'
        : null,
      state: 'active',
    });
  } else if (data.status === 'rejected') {
    steps.push({
      key: 'rejected',
      label: 'Abgelehnt',
      timestamp: data.updated_at,
      detail: data.rejection_reason,
      state: 'rejected',
    });
  }

  return steps;
}

function formatTimelineDate(iso: string | null): string {
  if (!iso) return 'noch offen';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusTimeline({
  data,
}: {
  data: {
    status: string;
    created_at: string;
    reviewed_at: string | null;
    updated_at: string;
    rejection_reason: string | null;
    converted_work_order_id: string | null;
  };
}) {
  const steps = buildTimeline(data);
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Verlauf
      </p>
      <ol className="mt-2 flex flex-col gap-3">
        {steps.map((step) => {
          const Icon =
            step.state === 'rejected' ? XCircle : step.state === 'done' ? CheckCircle2 : Circle;
          const iconClass =
            step.state === 'rejected'
              ? 'text-red-600 dark:text-red-400'
              : step.state === 'done'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--color-muted-foreground)]';
          return (
            <li key={step.key} className="flex gap-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconClass}`} aria-hidden />
              <div className="flex-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {formatTimelineDate(step.timestamp)}
                </p>
                {step.detail && (
                  <p
                    className={`mt-1 text-sm ${
                      step.state === 'rejected'
                        ? 'text-red-800 dark:text-red-200'
                        : 'text-[var(--color-foreground)]'
                    }`}
                  >
                    {step.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
