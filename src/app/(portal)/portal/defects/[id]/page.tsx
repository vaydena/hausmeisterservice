import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Circle, PartyPopper, XCircle } from 'lucide-react';
import { getResidentContext } from '@/lib/portal/current';
import { formatRelativeGerman } from '@/lib/schemas/notifications';
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

// Sprint 77: reine Datumsformatierung (kein Uhrzeit-Anteil) — planned_start und
// planned_end sind Termine im Bewohner-Kontext ("Handwerker kommt am ..."),
// da braucht es keine Minuten-Praezision.
function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatPlannedRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (start && end) return `geplant vom ${formatDateOnly(start)} bis ${formatDateOnly(end)}`;
  if (start) return `geplanter Beginn am ${formatDateOnly(start)}`;
  if (end) return `geplantes Ende am ${formatDateOnly(end)}`;
  return null;
}

// Sprint 74: Relative Zeit ergaenzen. formatRelativeGerman liefert bei
// aelteren Timestamps (>7 Tage) ohnehin nur das Datum — dann ist der
// Zusatz redundant und wir lassen ihn weg. So sieht der Bewohner bei
// juengeren Aktivitaeten sofort "vor 3 Tagen" ohne selbst rechnen zu
// muessen; bei alten Meldungen bleibt der Text schlank.
function formatDateTimeWithRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const absolute = formatDateTime(iso);
  const relative = formatRelativeGerman(iso);
  const isRelative = relative === 'gerade eben' || relative.startsWith('vor ');
  return isRelative ? `${absolute} · ${relative}` : absolute;
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

  // Sprint 67: Konsistent mit Portal-Liste (Sprint 59) und -Dashboard
  // (Sprint 64) — der Bewohner sieht auch im Detail auf einen Blick,
  // dass er auf einer Notfall-Meldung ist. Grauer Text-Fluss im Header
  // reichte nicht: bei einer echten Notfall-Meldung soll der Ernst der
  // Sache sofort sichtbar sein.
  const isEmergency = data.priority === 'emergency';

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

  // Sprint 77: Auftrags-Details laden, wenn die Meldung bereits in Bearbeitung
  // als interner Auftrag ist. Ohne dedizierte Portal-RLS auf work_orders
  // (Migration 20260815152000_portal_work_orders_read_own_defect) blieb die
  // "In Bearbeitung"-Info generisch — Bewohner sahen weder Auftrags-Code noch
  // geplante Termine. Der Join liefert null, wenn die RLS den Zugriff
  // verweigert (z. B. bei geloeschtem work_order) — die UI degradiert dann
  // sauber auf den generischen Text.
  const workOrder = data.converted_work_order_id
    ? (
        await supabase
          .from('work_orders')
          .select('id, code, status, planned_start, planned_end, closed_at')
          .eq('id', data.converted_work_order_id)
          .maybeSingle()
      ).data
    : null;

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

      {/*
       * Sprint 82: Success-Panel oben, wenn der zugehoerige Auftrag bereits
       * abgeschlossen ist. Der Bewohner sieht den Zustand sofort — auf Mobile
       * ist die Timeline sonst erst nach dem Scrollen sichtbar. Der Text ist
       * bewusst versoehnlich: nicht "case closed", sondern "Ihre Meldung wurde
       * bearbeitet". closed_at ist optional — bei manuellen Status-Updates
       * ohne Trigger bleibt er NULL, dann faellt die Datum-Zeile weg.
       */}
      {workOrder?.status === 'done' && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">Ihre Meldung wurde bearbeitet.</p>
            {workOrder.closed_at && (
              <p className="mt-1">
                Die Arbeiten wurden am {formatDateOnly(workOrder.closed_at)} abgeschlossen.
              </p>
            )}
          </div>
        </div>
      )}

      <article
        className={`flex flex-col gap-4 rounded-2xl border bg-[var(--color-background)] p-6 ${
          isEmergency
            ? 'border-red-300 dark:border-red-800'
            : 'border-[var(--color-border)]'
        }`}
      >
        <header className="flex flex-col gap-2">
          {isEmergency && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Notfall
            </span>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <span>{data.code ?? '—'}</span>
            <span>·</span>
            <span>{STATUS_LABEL[data.status] ?? data.status}</span>
            {!isEmergency && (
              <>
                <span>·</span>
                <span>Priorität: {PRIORITY_LABEL[data.priority] ?? data.priority}</span>
              </>
            )}
          </div>
          <h1 className="text-xl font-semibold">{data.title}</h1>
        </header>

        <dl className="grid gap-3 md:grid-cols-2">
          <Row label="Eingereicht am" value={formatDateTimeWithRelative(data.created_at)} />
          <Row label="In Prüfung seit" value={formatDateTimeWithRelative(data.reviewed_at)} />
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
        <StatusTimeline data={data} workOrder={workOrder} />


        <div>
          {/*
           * Sprint 76: Anzahl in die Section-Ueberschrift. Konsistent mit
           * Sprint 69 (Anhang-Zaehler in der Meldungs-Liste). Der Bewohner
           * sieht sofort, wie viele Belege bereits hinterlegt sind, ohne
           * die Grid-Kacheln zu zaehlen. Bei 0 lassen wir den Zaehler
           * weg — der Empty-State-Text erklaert die Lage bereits.
           */}
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Anhänge{attachments.length > 0 ? ` (${attachments.length})` : ''}
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

        {/*
         * Sprint 83: Upload-Formular verstecken, sobald der Auftrag
         * abgeschlossen ist. Weitere Fotos/Dokumente helfen nach Abschluss
         * niemandem — die bereits hochgeladenen Belege bleiben oberhalb
         * sichtbar. Bei laufenden Auftraegen (in_progress, blocked) bleibt
         * der Upload aktiv, damit der Bewohner z. B. Nachbesserungsbedarf
         * dokumentieren kann.
         */}
        {workOrder?.status !== 'done' && (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4">
            <PortalDefectUploadForm defectId={data.id} />
          </div>
        )}

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

function buildTimeline(
  data: {
    status: string;
    created_at: string;
    reviewed_at: string | null;
    updated_at: string;
    rejection_reason: string | null;
    converted_work_order_id: string | null;
  },
  workOrder: {
    code: string | null;
    status: string | null;
    planned_start: string | null;
    planned_end: string | null;
    closed_at: string | null;
  } | null,
): TimelineStep[] {
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
    // Sprint 77: Konkreter Auftrags-Code + geplanter Termin (wenn die
    // work_orders-RLS den Zugriff freigibt). Fallback bleibt der generische
    // Text — z. B. bei geloeschten work_orders oder wenn die Verwaltung
    // noch kein Datum eingetragen hat.
    const parts: string[] = [];
    if (workOrder?.code) {
      parts.push(`Auftrag ${workOrder.code}`);
    } else if (data.converted_work_order_id) {
      parts.push('Die Hausverwaltung hat einen internen Auftrag erstellt.');
    }
    const planned = formatPlannedRange(
      workOrder?.planned_start,
      workOrder?.planned_end,
    );
    if (planned) parts.push(planned);
    // Sprint 79: Wenn der Auftrag bereits abgeschlossen ist, wechselt der
    // converted-Step in state 'done' und ein Folge-Step "Auftrag
    // abgeschlossen" wird ergaenzt. Der defect-Status bleibt bei der
    // Verwaltung oft weiterhin 'converted' bis er manuell geschlossen wird
    // — der Bewohner soll trotzdem sofort sehen, dass die Arbeiten fertig
    // sind. closed_at kann NULL sein, wenn der Auftrag nur ueber Status
    // gesetzt wurde ohne Trigger — dann bleibt es beim active-State.
    const isDone = workOrder?.status === 'done';
    steps.push({
      key: 'converted',
      label: 'In Bearbeitung als Auftrag',
      timestamp: data.updated_at,
      detail: parts.length > 0 ? parts.join(' · ') : null,
      state: isDone ? 'done' : 'active',
    });
    if (isDone) {
      steps.push({
        key: 'work_order_done',
        label: 'Auftrag abgeschlossen',
        timestamp: workOrder?.closed_at ?? null,
        state: 'done',
      });
    }
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
  return formatDateTimeWithRelative(iso);
}

function StatusTimeline({
  data,
  workOrder,
}: {
  data: {
    status: string;
    created_at: string;
    reviewed_at: string | null;
    updated_at: string;
    rejection_reason: string | null;
    converted_work_order_id: string | null;
  };
  workOrder: {
    code: string | null;
    status: string | null;
    planned_start: string | null;
    planned_end: string | null;
    closed_at: string | null;
  } | null;
}) {
  const steps = buildTimeline(data, workOrder);
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
