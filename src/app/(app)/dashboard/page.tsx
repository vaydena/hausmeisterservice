import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEnabledModules } from '@/lib/modules/enabled';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MODULES_BY_KEY, type ModuleKey } from '@/lib/modules/registry';
import { WelcomeOverlay } from './welcome-overlay';

export const metadata: Metadata = { title: 'Dashboard' };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export default async function DashboardPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [enabledModules, permissions, tenant, roles] = await Promise.all([
    getEnabledModules(ctx.tenantId),
    getEffectivePermissions(ctx.userId, ctx.tenantId),
    supabase
      .from('tenants')
      .select('name, onboarding_completed_at')
      .eq('id', ctx.tenantId)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('role_id, roles(name)')
      .eq('user_id', ctx.userId)
      .eq('tenant_id', ctx.tenantId)
      .returns<{ role_id: string; roles: { name: string } | null }[]>(),
  ]);

  const tenantName = tenant.data?.name ?? 'Ihr Mandant';
  const showWelcome = ctx.isOwner && !tenant.data?.onboarding_completed_at;
  const roleNames =
    (roles.data ?? [])
      .map((r) => r.roles?.name)
      .filter((n): n is string => Boolean(n));

  const activeToggleable = [...enabledModules].filter(
    (key) => !MODULES_BY_KEY[key]?.core,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}
          {ctx.displayName ? `, ${ctx.displayName.split(' ')[0]}` : ''}.
        </h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Mandant: <span className="font-medium text-[var(--color-foreground)]">{tenantName}</span>
          {roleNames.length > 0 && (
            <>
              {' · '}Rolle{roleNames.length > 1 ? 'n' : ''}:{' '}
              <span className="font-medium text-[var(--color-foreground)]">{roleNames.join(', ')}</span>
            </>
          )}
        </p>
      </section>

      <StatsGrid
        moduleCount={activeToggleable.length}
        permissionCount={permissions.size}
        isOwner={ctx.isOwner}
      />

      {activeToggleable.length === 0 ? (
        <EmptyModulesCard />
      ) : (
        <ActiveModulesGrid enabled={activeToggleable} />
      )}

      {showWelcome && <WelcomeOverlay tenantName={tenantName} />}
    </div>
  );
}

function StatsGrid({
  moduleCount,
  permissionCount,
  isOwner,
}: {
  moduleCount: number;
  permissionCount: number;
  isOwner: boolean;
}) {
  const items: { label: string; value: string; hint?: string }[] = [
    { label: 'Aktive Module', value: String(moduleCount), hint: 'zusätzlich zu den Kern-Modulen' },
    { label: 'Ihre Berechtigungen', value: String(permissionCount), hint: 'effektive Permissions im Mandanten' },
    { label: 'Rolle', value: isOwner ? 'Mandant-Owner' : 'Mitglied', hint: 'Zugriffsebene' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4"
        >
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted-foreground)]">
            {item.label}
          </div>
          <div className="mt-2 text-2xl font-semibold">{item.value}</div>
          {item.hint && (
            <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{item.hint}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ActiveModulesGrid({ enabled }: { enabled: ModuleKey[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        Aktivierte Bereiche
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {enabled.map((key) => {
          const mod = MODULES_BY_KEY[key];
          if (!mod) return null;
          return (
            <div
              key={key}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4"
            >
              <div className="text-sm font-medium">{mod.labelDe}</div>
              <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {mod.description}
              </div>
              {mod.menuPath && (
                <a
                  href={mod.menuPath}
                  className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline"
                >
                  Öffnen →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EmptyModulesCard() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] p-6 text-center">
      <div className="text-sm font-medium">Keine zusätzlichen Module aktiv</div>
      <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
        Nur die Kern-Module (Mandant, Benutzer &amp; Rollen, Audit-Log) sind eingeschaltet.
        Aktivieren Sie weitere Bereiche unter{' '}
        <a href="/settings/tenant" className="text-[var(--color-primary)] hover:underline">
          Einstellungen → Mandant → Module
        </a>
        , sobald sie im System eingerichtet sind.
      </p>
    </div>
  );
}
