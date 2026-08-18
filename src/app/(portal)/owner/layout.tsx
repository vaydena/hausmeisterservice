import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { hasFeature } from '@/lib/tenant/features';
import { clientEnv } from '@/lib/env';
import { OwnerUserMenu } from './_components/owner-user-menu';
import { OwnerNav } from './_components/owner-nav';

/**
 * Der Eigentuemer darf sich abmelden, auch wenn der Tarif seiner
 * Hausverwaltung das Portal nicht mehr abdeckt — sonst bliebe er mit einer
 * Sperrmeldung und einer aktiven Session zurueck, die er nicht loswird.
 * (Muster aus dem Bewohnerportal, Sprint 114.)
 */
const ALLOWED_WHEN_PORTAL_LOCKED = ['/owner/logout', '/owner/login'];

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const ctx = await getOwnerContext();

  // Plan-Feature `portal` deckt beide Portale ab (FEATURE_MODULES.portal =
  // [resident_portal, owner_portal]). Betroffen ist hier NICHT der Kunde,
  // sondern ein Eigentuemer, der fuer den Tarif seiner Hausverwaltung nichts
  // kann — deshalb kein Redirect auf eine Abo-Seite, sondern ein
  // erklaerender Hinweis an Ort und Stelle.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const portalLocked =
    ctx !== null &&
    !ALLOWED_WHEN_PORTAL_LOCKED.includes(pathname) &&
    !(await hasFeature(ctx.tenantId, 'portal'));

  const objectCount = ctx?.properties.length ?? 0;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-muted)]">
      <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-background)] px-4 md:px-6">
        <Link
          href={ctx ? '/owner/dashboard' : '/owner/login'}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold">
            HS
          </span>
          <span>{clientEnv.NEXT_PUBLIC_APP_NAME} — Eigentümer-Portal</span>
        </Link>
        {ctx && (
          <div className="flex items-center gap-1">
            <OwnerUserMenu
              displayName={ctx.preferredDisplayName ?? ctx.displayName}
              email={ctx.email}
            />
          </div>
        )}
      </header>

      {ctx && !portalLocked && (
        <nav className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 py-2 md:px-6">
            <OwnerNav />
          </div>
        </nav>
      )}

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
          {portalLocked ? <OwnerPortalUnavailable /> : children}
        </div>
      </main>

      <footer className="border-t border-[var(--color-border)] bg-[var(--color-background)] px-4 py-4 text-center text-xs text-[var(--color-muted-foreground)] md:px-6">
        {ctx && !portalLocked && (
          <div className="mb-1">
            Sie sind angemeldet als Eigentümer
            {objectCount > 0
              ? ` · ${objectCount} ${objectCount === 1 ? 'Objekt' : 'Objekte'}`
              : ''}
            .
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
 * Der Eigentuemer erfaehrt bewusst nichts ueber Tarife oder Zahlungen seiner
 * Hausverwaltung — das geht ihn nichts an und waere eine Information ueber
 * einen Dritten. Er erfaehrt nur, dass das Portal vorerst nicht zur
 * Verfuegung steht und wie er sich stattdessen meldet.
 */
function OwnerPortalUnavailable() {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-6 shadow-sm">
      <h1 className="text-xl font-semibold tracking-tight">Portal vorübergehend nicht verfügbar</h1>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Ihre Hausverwaltung hat das Eigentümer-Portal derzeit nicht freigeschaltet. Ihre bisherigen
        Daten bleiben gespeichert und sind wieder abrufbar, sobald das Portal erneut zur Verfügung
        steht.
      </p>
      <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
        Bitte wenden Sie sich in dringenden Fällen direkt an Ihre Hausverwaltung.
      </p>
      <Link
        href="/owner/logout"
        className="mt-6 inline-flex h-10 items-center rounded-md border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-muted)]"
      >
        Abmelden
      </Link>
    </div>
  );
}
