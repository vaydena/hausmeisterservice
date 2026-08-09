import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/current';
import { getResidentContext } from '@/lib/portal/current';
import { getEnabledModules } from '@/lib/modules/enabled';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MobileNav } from '@/components/layout/mobile-nav';
import { NAV_GROUPS, MOBILE_NAV_ITEMS, filterNavGroups, filterNavItems } from '@/components/layout/nav-config';
import { clientEnv } from '@/lib/env';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getTenantContext();
  if (!ctx) {
    // Ein Bewohner ohne Staff-Membership landet hier — weiter ins Portal.
    const resident = await getResidentContext();
    redirect(resident ? '/portal/dashboard' : '/login');
  }

  const [enabledModules, permissions] = await Promise.all([
    getEnabledModules(ctx.tenantId),
    getEffectivePermissions(ctx.userId, ctx.tenantId),
  ]);

  const navGroups = filterNavGroups(NAV_GROUPS, enabledModules, permissions);
  const mobileItems = filterNavItems(MOBILE_NAV_ITEMS, enabledModules, permissions);

  return (
    <div className="flex min-h-dvh">
      <Sidebar groups={navGroups} appName={clientEnv.NEXT_PUBLIC_APP_NAME} />
      <div className="flex flex-1 flex-col">
        <Header displayName={ctx.displayName} email={ctx.email} />
        <main className="flex-1 overflow-x-hidden bg-[var(--color-muted)] p-4 pb-20 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileNav items={mobileItems} />
    </div>
  );
}
