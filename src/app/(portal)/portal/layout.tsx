import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getResidentContext } from '@/lib/portal/current';
import { loadPortalUnreadThreadsSummary } from '@/lib/portal/unread-messages';
import { loadPortalUnreadAnnouncementsSummary } from '@/lib/portal/unread-announcements';
import { hasFeature } from '@/lib/tenant/features';
import { clientEnv } from '@/lib/env';
import { PortalUserMenu } from './_components/portal-user-menu';
import { PortalNav } from './_components/portal-nav';
import { PortalNotificationBell } from './_components/portal-notification-bell';

/**
 * Sprint 114: Der Bewohner darf sich abmelden, auch wenn der Tarif seiner
 * Hausverwaltung das Portal nicht mehr abdeckt — sonst bliebe er mit einer
 * Sperrmeldung und einer aktiven Session zurueck, die er nicht loswird.
 */
const ALLOWED_WHEN_PORTAL_LOCKED = ['/portal/logout', '/portal/login'];

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = await getResidentContext();

  // Sprint 114: Plan-Feature `portal`. Anders als im Staff-Bereich ist der
  // Betroffene hier NICHT der Kunde, sondern ein Bewohner, der fuer den
  // Tarif seiner Hausverwaltung nichts kann. Deshalb kein Redirect auf eine
  // Abo-Seite, die er nie oeffnen darf, sondern ein erklaerender Hinweis
  // an Ort und Stelle.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const portalLocked =
    ctx !== null &&
    !ALLOWED_WHEN_PORTAL_LOCKED.includes(pathname) &&
    !(await hasFeature(ctx.tenantId, 'portal'));

  // Sprint 46/47: Nav-Badges fuer ungelesene Threads + Ankuendigungen.
  // Beide Helper sind via React cache() dedupliziert — auf
  // /portal/dashboard treffen dieselben Aufrufe aus der Page keinen
  // zweiten Datenbank-Roundtrip.
  const [threadsSummary, announcementsSummary] =
    ctx && !portalLocked
      ? await Promise.all([
          loadPortalUnreadThreadsSummary(ctx.userId),
          loadPortalUnreadAnnouncementsSummary(ctx.userId),
        ])
      : [null, null];

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-muted)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 md:px-6">
        <Link href={ctx ? '/portal/dashboard' : '/portal/login'} className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold">
            HS
          </span>
          <span>{clientEnv.NEXT_PUBLIC_APP_NAME} — Bewohner-Portal</span>
        </Link>
        {ctx && (
          <div className="flex items-center gap-1">
            <PortalNotificationBell userId={ctx.userId} />
            <PortalUserMenu
              displayName={ctx.preferredDisplayName ?? ctx.displayName}
              email={ctx.email}
            />
          </div>
        )}
      </header>

      {ctx && !portalLocked && (
        <nav className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
            <PortalNav
              badges={{
                messages: threadsSummary?.unreadCount ?? 0,
                announcements: announcementsSummary?.unreadCount ?? 0,
              }}
            />
          </div>
        </nav>
      )}

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
          {portalLocked ? <PortalUnavailable /> : children}
        </div>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-4 text-center text-xs text-[var(--color-muted-foreground)] md:px-6">
        {ctx?.propertyName && !portalLocked && (
          <div className="mb-1">
            Sie sind angemeldet als Bewohner von {ctx.propertyName}
            {ctx.unitCode ? `, Einheit ${ctx.unitCode}` : ''}.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>© {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_APP_NAME}</span>
          <Link href="/impressum" className="hover:text-[var(--color-foreground)] hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-[var(--color-foreground)] hover:underline">
            Datenschutz
          </Link>
          <Link href="/agb" className="hover:text-[var(--color-foreground)] hover:underline">
            AGB
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * Der Bewohner erfaehrt bewusst nichts ueber Tarife oder Zahlungen seiner
 * Hausverwaltung — das geht ihn nichts an und waere obendrein eine
 * Information ueber einen Dritten. Er erfaehrt nur, dass das Portal
 * vorerst nicht zur Verfuegung steht und wie er sich stattdessen meldet.
 */
function PortalUnavailable() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Portal vorübergehend nicht verfügbar</h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Ihre Hausverwaltung hat das Bewohner-Portal derzeit nicht freigeschaltet. Ihre bisherigen
        Meldungen und Nachrichten bleiben gespeichert und sind wieder abrufbar, sobald das Portal
        erneut zur Verfügung steht.
      </p>
      <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
        Bitte wenden Sie sich in dringenden Fällen direkt an Ihre Hausverwaltung.
      </p>
      <Link
        href="/portal/logout"
        className="mt-6 inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-muted)]"
      >
        Abmelden
      </Link>
    </div>
  );
}
