import type { ReactNode } from 'react';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { PlatformSidebar } from '@/components/platform/platform-sidebar';
import { Header } from '@/components/layout/header';
import { formatUserRoleLabel } from '@/lib/permissions/user-role-label';
import { clientEnv } from '@/lib/env';

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="flex min-h-dvh">
      <PlatformSidebar appName={clientEnv.NEXT_PUBLIC_APP_NAME} />
      <div className="flex flex-1 flex-col">
        <Header
          displayName={ctx.displayName}
          email={ctx.email}
          roleLabel={formatUserRoleLabel({ userClass: 'platform' })}
        />
        <main className="flex-1 overflow-x-hidden bg-[var(--color-muted)] p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
