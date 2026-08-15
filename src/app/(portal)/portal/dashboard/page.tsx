import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AlertTriangle, Calendar, Megaphone, Wrench, MessageSquare, Home, ChevronRight } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getResidentContext } from '@/lib/portal/current';
import { loadPortalUnreadThreadsSummary } from '@/lib/portal/unread-messages';
import { loadPortalUnreadAnnouncementsSummary } from '@/lib/portal/unread-announcements';
import { hasVerifiedMfaFactor } from '@/lib/auth/mfa-status';
import { PortalMfaReminderBanner } from './portal-mfa-reminder-banner';
import { PortalWelcomeOverlay } from './portal-welcome-overlay';

// Sprint 36: Portal-Reminder bleibt nach Dismiss 7 Tage stumm, danach
// wieder sichtbar. Analog zum Staff-Banner in Sprint 28 — der zweite
// Faktor ist auch fuer Bewohner-Konten der wichtigste einzelne Hebel
// gegen Kontoubernahme, deshalb bewusst kein permanentes Ausblenden.
const PORTAL_MFA_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const metadata: Metadata = {
  title: 'Bewohner-Portal',
};

// Sprint 64: Konsistent mit /portal/defects — der Bewohner sieht auf dem
// Dashboard denselben Status-Wortlaut wie in der Liste und erkennt
// Notfaelle sofort am Badge.
const STATUS_LABEL: Record<string, string> = {
  new: 'Neu eingereicht',
  reviewing: 'In Prüfung',
  converted: 'In Bearbeitung',
  rejected: 'Abgelehnt',
};

// Sprint 78: Termin-Formatter analog zu portal/defects/[id]/page.tsx. Duplikat
// bewusst — ein zweiter Verwender ist noch keine Abstraktion, und die
// bewohnerorientierte Ausdrucksweise ("geplant vom … bis …") ist im Dashboard-
// Panel identisch zum Meldung-Detail.
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

// Sprint 78: Offene Auftragsstati laut work_orders CHECK constraint —
// 'done' und 'cancelled' schliessen wir aus (kein "kommender Termin" mehr).
const OPEN_WORK_ORDER_STATUSES = ['new', 'planned', 'in_progress', 'blocked'];

export default async function PortalDashboardPage() {
  const ctx = await getResidentContext();
  if (!ctx) redirect('/portal/login');

  const supabase = await createSupabaseServerClient();

  const enrolled = await hasVerifiedMfaFactor(supabase);
  let showMfaReminder = false;
  if (!enrolled) {
    const dismissed = (await cookies()).get(
      'portal_mfa_reminder_dismissed_at',
    )?.value;
    const dismissedAt = dismissed ? Number(dismissed) : 0;
    const cooldownActive =
      Number.isFinite(dismissedAt) &&
      dismissedAt > 0 &&
      Date.now() - dismissedAt < PORTAL_MFA_REMINDER_COOLDOWN_MS;
    showMfaReminder = !cooldownActive;
  }

  // Sprint 40: Willkommens-Overlay einmalig fuer neue Bewohner. Wir
  // lesen das Flag direkt hier statt via getResidentContext, um den
  // geteilten Helper nicht um ein rein UI-relevantes Feld aufzublaehen.
  const { data: onboardingRow } = await supabase
    .from('residents')
    .select('portal_onboarding_completed_at')
    .eq('id', ctx.residentId)
    .maybeSingle();
  const showWelcomeOverlay = !onboardingRow?.portal_onboarding_completed_at;

  const [
    announcementsRes,
    defectsRes,
    receiptsRes,
    threadsSummary,
    announcementsSummary,
    upcomingWorkOrdersRes,
  ] = await Promise.all([
      // Sprint 88: Limit auf 15 (analog Sprint 68 defects) — die
      // Zu-quittieren-Priorisierung weiter unten erwischt so auch
      // aeltere requires_acknowledgement-Items, die sonst durch
      // neuere Info-Aushaenge aus den Top-5 gedraengt wuerden. Nach
      // der Sortierung slicen wir auf 5 zurueck.
      supabase
        .from('announcements')
        .select('id, title, published_at, requires_acknowledgement, target_type')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(15),
      // Sprint 48: count: 'exact' liefert die Gesamtzahl passender
      // Zeilen zusaetzlich zum limitierten data-Array. Ohne diesen
      // Zusatz zaehlte die SummaryCard nur die hier angezeigten Top-5
      // (analog zum Bug, den Sprint 45 fuer Nachrichten und Sprint 47
      // fuer Ankuendigungen behoben haben).
      // Sprint 68: Limit auf 15 statt 5 erhoeht, damit die
       // Notfall-Priorisierung weiter unten auch aeltere Emergency-
       // Meldungen erwischt, die sonst durch neuere Non-Emergencies aus
       // den Top-5 gedraengt wuerden. Die SummaryCard zeigt weiterhin die
       // exakte Gesamtzahl (count: 'exact' zaehlt vor limit).
      supabase
        .from('defect_reports')
        .select('id, code, title, status, priority, created_at', { count: 'exact' })
        .eq('reporter_user_id', ctx.userId)
        .in('status', ['new', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('announcement_receipts')
        .select('announcement_id, read_at, acknowledged_at')
        .eq('user_id', ctx.userId),
      // Sprint 46/47: gemeinsame Zaehlung mit dem Layout-Nav-Badge —
      // beide Helper sind via React cache() dedupliziert.
      loadPortalUnreadThreadsSummary(ctx.userId),
      loadPortalUnreadAnnouncementsSummary(ctx.userId),
      // Sprint 78: Nutzt die neue RLS work_orders_select_resident_own_defect
      // aus Sprint 77 — Bewohner sieht Auftraege, die aus seinen eigenen
      // Meldungen entstanden sind. Wir holen bis zu 5 Termine sortiert nach
      // planned_start und filtern abgelaufene planned_end anschliessend im
      // Code, weil PostgREST-.or() mit Timestamp-Werten fragil ist. 5 ist
      // ein Puffer fuer den Fall, dass die ersten Kandidaten schon
      // abgelaufen sind — im Normalfall reicht der Top-Slot.
      supabase
        .from('work_orders')
        .select('id, code, planned_start, planned_end, status')
        .not('planned_start', 'is', null)
        .in('status', OPEN_WORK_ORDER_STATUSES)
        .order('planned_start', { ascending: true })
        .limit(5),
    ]);

  // Sprint 78: Abgelaufene Termine ausfiltern (planned_end < jetzt). NULL bei
  // planned_end bedeutet "Ende offen" — solche Auftraege bleiben sichtbar.
  const nowMs = Date.now();
  const upcomingWorkOrder =
    (upcomingWorkOrdersRes.data ?? []).find(
      (wo) => !wo.planned_end || new Date(wo.planned_end).getTime() >= nowMs,
    ) ?? null;

  // Sprint 78: Zugehoerige Meldung nur laden, wenn ein Termin gefunden wurde
  // — spart im Normalfall (kein anstehender Termin) den zweiten Roundtrip.
  let upcomingDefect: { id: string; title: string } | null = null;
  if (upcomingWorkOrder) {
    const { data: defectData } = await supabase
      .from('defect_reports')
      .select('id, title')
      .eq('converted_work_order_id', upcomingWorkOrder.id)
      .eq('reporter_user_id', ctx.userId)
      .maybeSingle();
    upcomingDefect = defectData ?? null;
  }

  // Sprint 68: Notfaelle zuerst, dann rest in SQL-Reihenfolge
  // (created_at DESC). Array.prototype.sort ist in JS spec-mandated
  // stable — die relative Reihenfolge gleicher Emergency-Bewertung
  // bleibt also erhalten, so dass wir keine sekundaere created_at-
  // Vergleich brauchen. priority ist ein text-Feld (kein enum),
  // deshalb liefert eine SQL-order priority DESC die falsche
  // alphabetische Reihenfolge — daher client-seitig.
  const defects = (defectsRes.data ?? [])
    .slice()
    .sort((a, b) => {
      const aEmergency = a.priority === 'emergency' ? 0 : 1;
      const bEmergency = b.priority === 'emergency' ? 0 : 1;
      return aEmergency - bEmergency;
    })
    .slice(0, 5);
  const defectsTotalCount = defectsRes.count ?? 0;
  const receipts = receiptsRes.data ?? [];
  const { totalCount: threadsTotalCount, unreadCount: unreadThreadsCount } = threadsSummary;
  // Sprint 47: SummaryCard-Zahlen kommen aus dem Helper, damit sie ueber
  // ALLE Ankuendigungen zaehlen und nicht nur ueber die hier gerenderten
  // Top-5. Die per-announcement receiptMap-Marker bleiben davon
  // unberuehrt, weil sie sich weiterhin nur auf die angezeigten Karten
  // beziehen.
  const { unreadCount, openAckCount } = announcementsSummary;

  const receiptMap = new Map(receipts.map((r) => [r.announcement_id, r]));

  // Sprint 88: Zu-quittieren zuerst im Dashboard-Panel (analog Sprint 87
  // fuer die Ankuendigungen-Liste, Sprint 68 fuer Defect-Notfaelle).
  // Panel zeigt nur 4 Zeilen — ohne Priorisierung koennte eine wichtige
  // zu-quittierende Ankuendigung aus der Vorschau fallen, obwohl die
  // SummaryCard "X noch zu quittieren" anzeigt. Stable sort erhaelt die
  // Server-Reihenfolge (published_at DESC) innerhalb der beiden Gruppen.
  const announcements = (announcementsRes.data ?? [])
    .slice()
    .sort((a, b) => {
      const needsAckA = a.requires_acknowledgement && !receiptMap.get(a.id)?.acknowledged_at;
      const needsAckB = b.requires_acknowledgement && !receiptMap.get(b.id)?.acknowledged_at;
      if (needsAckA === needsAckB) return 0;
      return needsAckA ? -1 : 1;
    })
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {showWelcomeOverlay && <PortalWelcomeOverlay firstName={ctx.firstName} />}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-12 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Home className="size-6" aria-hidden />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Guten Tag, {ctx.firstName}!</h1>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              {ctx.propertyName ?? '—'}
              {ctx.buildingName ? ` · ${ctx.buildingName}` : ''}
              {ctx.unitCode ? ` · Einheit ${ctx.unitCode}` : ''}
            </p>
          </div>
        </div>
      </section>

      {showMfaReminder && <PortalMfaReminderBanner />}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          href="/portal/announcements"
          label="Ankündigungen"
          value={unreadCount}
          hint={
            announcementsSummary.totalCount === 0
              ? 'keine Ankündigungen'
              : openAckCount > 0
                ? `${openAckCount} noch zu quittieren`
                : 'alle gelesen'
          }
          icon={<Megaphone className="size-5" aria-hidden />}
          tone={openAckCount > 0 ? 'warning' : 'default'}
        />
        <SummaryCard
          href="/portal/defects"
          label="Offene Meldungen"
          value={defectsTotalCount}
          hint={defectsTotalCount === 0 ? 'keine offenen' : 'Bearbeitung läuft'}
          icon={<Wrench className="size-5" aria-hidden />}
          tone="default"
        />
        <SummaryCard
          href="/portal/messages"
          label="Nachrichten"
          value={unreadThreadsCount}
          hint={
            threadsTotalCount === 0
              ? 'keine Konversationen'
              : unreadThreadsCount === 0
                ? 'alle gelesen'
                : `${unreadThreadsCount === 1 ? '1 Thread' : `${unreadThreadsCount} Threads`} ungelesen`
          }
          icon={<MessageSquare className="size-5" aria-hidden />}
          tone={unreadThreadsCount > 0 ? 'warning' : 'default'}
        />
      </div>

      {upcomingWorkOrder && (() => {
        // Sprint 80: Status-abhaengiger Header + Warn-Badge.
        // - in_progress + planned_start bereits vergangen: "Arbeiten laufen"
        //   (der Bewohner sieht so, dass es aktuell passiert, nicht erst noch
        //   kommt).
        // - blocked: pausiert-Badge (die Verwaltung hat Termin markiert, aber
        //   arbeitet gerade nicht — z. B. auf Ersatzteil warten). Termin bleibt
        //   sichtbar, damit der Bewohner nicht denkt es sei vergessen.
        // - sonst: unveraenderter Default "Naechster Auftragstermin".
        const hasStarted =
          !!upcomingWorkOrder.planned_start &&
          new Date(upcomingWorkOrder.planned_start).getTime() <= nowMs;
        const isInProgress = upcomingWorkOrder.status === 'in_progress';
        const isBlocked = upcomingWorkOrder.status === 'blocked';
        const headerLabel = isInProgress && hasStarted
          ? 'Arbeiten laufen'
          : 'Nächster Auftragstermin';
        const range = formatPlannedRange(
          upcomingWorkOrder.planned_start,
          upcomingWorkOrder.planned_end,
        );
        return (
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                <Calendar className="size-5" aria-hidden />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
                    {headerLabel}
                  </p>
                  {isBlocked && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      pausiert
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium">
                  {upcomingWorkOrder.code ? `Auftrag ${upcomingWorkOrder.code}` : 'Auftrag'}
                  {upcomingDefect ? ` · ${upcomingDefect.title}` : ''}
                </p>
                {range && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{range}</p>
                )}
                {upcomingDefect && (
                  <Link
                    href={`/portal/defects/${upcomingDefect.id}`}
                    className="mt-2 inline-flex text-xs font-medium text-[var(--color-primary)] hover:underline"
                  >
                    Zur Meldung →
                  </Link>
                )}
              </div>
            </div>
          </section>
        );
      })()}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Neueste Ankündigungen" href="/portal/announcements">
          {announcements.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Es liegen aktuell keine Ankündigungen vor.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {announcements.slice(0, 4).map((a) => {
                const receipt = receiptMap.get(a.id);
                const isUnread = !receipt?.read_at;
                const needsAck = a.requires_acknowledgement && !receipt?.acknowledged_at;
                return (
                  <li key={a.id} className="py-2.5">
                    <Link
                      href={`/portal/announcements/${a.id}`}
                      className="flex items-start justify-between gap-3 rounded-md hover:bg-[var(--color-muted)] -m-1 p-1"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {isUnread && (
                            <span
                              aria-label="neu"
                              className="size-2 rounded-full bg-[var(--color-primary)]"
                            />
                          )}
                          <span className="text-sm font-medium">{a.title}</span>
                        </div>
                        {a.published_at && (
                          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                            {new Date(a.published_at).toLocaleDateString('de-DE')}
                          </p>
                        )}
                      </div>
                      {needsAck && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
                          quittieren
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Ihre offenen Meldungen" href="/portal/defects">
          {defects.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Sie haben aktuell keine offenen Meldungen.
              </p>
              <Link
                href="/portal/defects/new"
                className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                Neuen Mangel melden
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)]">
              {defects.map((d) => {
                const isEmergency = d.priority === 'emergency';
                const statusLabel = STATUS_LABEL[d.status] ?? d.status;
                return (
                  <li key={d.id} className="py-2.5">
                    <Link
                      href={`/portal/defects/${d.id}`}
                      className="flex items-center justify-between gap-3 rounded-md hover:bg-[var(--color-muted)] -m-1 p-1"
                    >
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isEmergency && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              Notfall
                            </span>
                          )}
                          <span className="text-sm font-medium">{d.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                          {d.code ?? '—'} · {statusLabel}
                        </p>
                      </div>
                      <ChevronRight
                        className="size-4 text-[var(--color-muted-foreground)]"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function SummaryCard({
  href,
  label,
  value,
  hint,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  tone: 'default' | 'warning';
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 transition hover:border-[var(--color-primary)]/50 hover:shadow-sm"
    >
      <div
        className={`flex size-10 items-center justify-center rounded-lg ${
          tone === 'warning'
            ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
            : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
          {label}
        </p>
        <p className="text-2xl font-semibold leading-tight">{value}</p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{hint}</p>
      </div>
    </Link>
  );
}

function Panel({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-xs font-medium text-[var(--color-primary)] hover:underline"
        >
          Alle ansehen
        </Link>
      </div>
      {children}
    </section>
  );
}
