import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/current';
import { getResidentContext } from '@/lib/portal/current';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { getAvailableModules } from '@/lib/modules/enabled';
import { moduleForPath } from '@/lib/modules/module-map';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { getUserRoleNames } from '@/lib/permissions/user-roles';
import { formatUserRoleLabel } from '@/lib/permissions/user-role-label';
import { isPlatformAdmin } from '@/lib/platform/is-platform-admin';
import { evaluateSubscriptionAccess, isPathAllowedWhenBlocked } from '@/lib/tenant/subscription-guard';
import { hasFeature } from '@/lib/tenant/features';
import { featureForPath } from '@/lib/tenant/feature-map';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { NAV_GROUPS, MOBILE_NAV_ITEMS, filterNavGroups, filterNavItems } from '@/components/layout/nav-config';
import { clientEnv } from '@/lib/env';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    // Ein Bewohner oder Eigentümer ohne Staff-Membership landet hier —
    // weiter ins jeweilige Portal. Ein User ganz ohne Zugriff (keine
    // Membership, kein Resident, kein Owner) darf NICHT zu /login: der Proxy
    // schickt eingeloggte Sessions von /login sofort wieder auf /dashboard →
    // ERR_TOO_MANY_REDIRECTS. /no-access bricht den Loop.
    const resident = await getResidentContext();
    if (resident) redirect('/portal/dashboard');
    const owner = await getOwnerContext();
    redirect(owner ? '/owner/dashboard' : '/no-access');
  }

  // Subscription-Gate: geblockte Tenants dürfen nur /settings/subscription + Legal
  // erreichen, damit der Inhaber selbst freischalten kann.
  const pathname = (await headers()).get('x-pathname') ?? '';
  const access = await evaluateSubscriptionAccess(ctx.tenantId);
  if (access.access === 'blocked' && !isPathAllowedWhenBlocked(pathname)) {
    redirect('/zahlung-erforderlich');
  }

  // Sprint 114: Plan-Feature-Gate auf Routen-Ebene. Muss hier sitzen und
  // nicht nur in der Navigation — ein ausgeblendeter Menuepunkt sperrt
  // nichts, die URL bleibt tippbar und Deep-Links aus alten E-Mails und
  // Lesezeichen zeigen weiter auf die Route.
  const requiredFeature = featureForPath(pathname);
  if (requiredFeature && !(await hasFeature(ctx.tenantId, requiredFeature))) {
    redirect(`/tarif-erforderlich?feature=${requiredFeature}`);
  }

  const [enabledModules, permissions, roleNames, platformAdmin] = await Promise.all([
    getAvailableModules(ctx.tenantId),
    getEffectivePermissions(ctx.userId, ctx.tenantId),
    getUserRoleNames(ctx.userId, ctx.tenantId),
    isPlatformAdmin(ctx.userId),
  ]);

  // Sprint 117: Modul-Gate auf Routen-Ebene. Die Registry sagt seit dem
  // ersten Tag "routes return 404, not 403" — bis hierher galt nur die
  // halbe Zusage: der Menuepunkt verschwand, die Route blieb offen.
  //
  // 404 und nicht 403, weil das die ehrlichere Auskunft ist: fuer diesen
  // Mandanten gibt es diese Seite nicht. Ein 403 wuerde bestaetigen, dass
  // es sie gibt, und nach einer Berechtigung klingen, die niemand vergeben
  // kann — abschalten war eine Entscheidung des Inhabers, keine Rechtefrage.
  //
  // Bewusst NACH dem Tarif-Gate: ein tarifgesperrtes Modul soll die
  // erklaerende Seite zeigen ("dafuer braucht es Tarif X"), nicht ein 404,
  // das wie ein Fehler aussieht. Geprueft wird gegen getAvailableModules —
  // faellt ein Pfad kuenftig durch die FEATURE_PATHS-Tabelle, sperrt dieses
  // Gate ihn trotzdem, statt ihn durchzulassen.
  const requiredModule = moduleForPath(pathname);
  if (requiredModule && !enabledModules.has(requiredModule)) {
    notFound();
  }

  const navGroups = filterNavGroups(NAV_GROUPS, enabledModules, permissions, ctx.isOwner);
  const mobileItems = filterNavItems(MOBILE_NAV_ITEMS, enabledModules, permissions, ctx.isOwner);

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={navGroups} appName={clientEnv.NEXT_PUBLIC_APP_NAME} />
      <div className="flex flex-1 flex-col">
        <Header
          displayName={ctx.displayName}
          email={ctx.email}
          tenantName={ctx.tenantName}
          roleLabel={formatUserRoleLabel({
            userClass: 'staff',
            isOwner: ctx.isOwner,
            roleNames,
          })}
          isPlatformAdmin={platformAdmin}
        />
        <main className="flex-1 overflow-x-hidden bg-[var(--color-muted)] p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
        <footer className="hidden border-t border-[var(--color-border)] bg-[var(--color-background)] px-6 py-3 text-xs text-[var(--color-muted-foreground)] md:flex md:items-center md:justify-between">
          <span>© {new Date().getFullYear()} {clientEnv.NEXT_PUBLIC_APP_NAME}</span>
          <nav className="flex gap-4">
            <Link href="/impressum" className="hover:text-[var(--color-foreground)] hover:underline">Impressum</Link>
            <Link href="/datenschutz" className="hover:text-[var(--color-foreground)] hover:underline">Datenschutz</Link>
            <Link href="/agb" className="hover:text-[var(--color-foreground)] hover:underline">AGB</Link>
            <Link href="/avv" className="hover:text-[var(--color-foreground)] hover:underline">AVV</Link>
          </nav>
        </footer>
      </div>
      <MobileNav items={mobileItems} />
    </div>
  );
}
