import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Megaphone, Wrench, MessageSquare, Home, ChevronRight } from 'lucide-react';
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

  const [announcementsRes, defectsRes, receiptsRes, threadsSummary, announcementsSummary] =
    await Promise.all([
      supabase
        .from('announcements')
        .select('id, title, published_at, requires_acknowledgement, target_type')
        .eq('status', 'published')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(5),
      supabase
        .from('defect_reports')
        .select('id, code, title, status, priority, created_at')
        .eq('reporter_user_id', ctx.userId)
        .in('status', ['new', 'reviewing'])
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('announcement_receipts')
        .select('announcement_id, read_at, acknowledged_at')
        .eq('user_id', ctx.userId),
      // Sprint 46/47: gemeinsame Zaehlung mit dem Layout-Nav-Badge —
      // beide Helper sind via React cache() dedupliziert.
      loadPortalUnreadThreadsSummary(ctx.userId),
      loadPortalUnreadAnnouncementsSummary(ctx.userId),
    ]);

  const announcements = announcementsRes.data ?? [];
  const defects = defectsRes.data ?? [];
  const receipts = receiptsRes.data ?? [];
  const { totalCount: threadsTotalCount, unreadCount: unreadThreadsCount } = threadsSummary;
  // Sprint 47: SummaryCard-Zahlen kommen aus dem Helper, damit sie ueber
  // ALLE Ankuendigungen zaehlen und nicht nur ueber die hier gerenderten
  // Top-5. Die per-announcement receiptMap-Marker bleiben davon
  // unberuehrt, weil sie sich weiterhin nur auf die angezeigten Karten
  // beziehen.
  const { unreadCount, openAckCount } = announcementsSummary;

  const receiptMap = new Map(receipts.map((r) => [r.announcement_id, r]));

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
          value={defects.length}
          hint={defects.length === 0 ? 'keine offenen' : 'Bearbeitung läuft'}
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
              {defects.map((d) => (
                <li key={d.id} className="py-2.5">
                  <Link
                    href={`/portal/defects/${d.id}`}
                    className="flex items-center justify-between gap-3 rounded-md hover:bg-[var(--color-muted)] -m-1 p-1"
                  >
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                        {d.code ?? '—'} · Status: {d.status}
                      </p>
                    </div>
                    <ChevronRight
                      className="size-4 text-[var(--color-muted-foreground)]"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
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
