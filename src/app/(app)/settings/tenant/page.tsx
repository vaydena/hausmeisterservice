import type { Metadata } from 'next';
import { requireTenantContext } from '@/lib/tenant/current';
import { getEnabledModules } from '@/lib/modules/enabled';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { MODULES, type ModuleDomain } from '@/lib/modules/registry';
import { formatDate } from '@/lib/utils/format';
import { parseTenantAddress, parseTenantInvoiceData } from '@/lib/schemas/tenant';
import { countDemoDataForTenant } from '@/lib/tenant/demo-data';
import {
  toggleModuleAction,
  loadDemoDataAction,
  removeDemoDataAction,
} from './actions';
import { TenantBillingForm } from './billing-form';

export const metadata: Metadata = { title: 'Mandant' };

const DOMAIN_LABEL: Record<ModuleDomain, string> = {
  core: 'Kern',
  objects: 'Objekte',
  people: 'Personen',
  tasks: 'Aufgaben',
  field: 'Einsatz',
  resources: 'Ressourcen',
  communication: 'Kommunikation',
  finance: 'Finanzen',
  platform: 'Plattform',
};

const DOMAIN_ORDER: ModuleDomain[] = [
  'core',
  'objects',
  'people',
  'tasks',
  'field',
  'resources',
  'communication',
  'finance',
  'platform',
];

export default async function TenantSettingsPage() {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [tenant, enabled, permissions, demoCount] = await Promise.all([
    supabase
      .from('tenants')
      .select('name, slug, timezone, currency, locale, status, created_at, address, invoice_data')
      .eq('id', ctx.tenantId)
      .maybeSingle(),
    getEnabledModules(ctx.tenantId),
    getEffectivePermissions(ctx.userId, ctx.tenantId),
    countDemoDataForTenant(ctx.tenantId),
  ]);

  const canManage = permissions.has('core.tenants.manage');
  const t = tenant.data;
  const address = parseTenantAddress(t?.address);
  const invoiceData = parseTenantInvoiceData(t?.invoice_data);

  const grouped = DOMAIN_ORDER.map((domain) => ({
    domain,
    modules: MODULES.filter((m) => m.domain === domain),
  })).filter((g) => g.modules.length > 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Mandant</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Grunddaten und aktivierte Module Ihres Mandanten.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Stammdaten
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DataRow label="Name" value={t?.name ?? '–'} />
          <DataRow label="Kürzel" value={t?.slug ?? '–'} />
          <DataRow label="Zeitzone" value={t?.timezone ?? 'Europe/Berlin'} />
          <DataRow label="Währung" value={t?.currency ?? 'EUR'} />
          <DataRow label="Sprache" value={t?.locale ?? 'de-DE'} />
          <DataRow label="Status" value={t?.status ?? '–'} />
          <DataRow label="Angelegt am" value={t?.created_at ? formatDate(t.created_at) : '–'} />
        </dl>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Firmen- & Rechnungsdaten
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Absender-Anschrift, Steuer-IDs, Bankverbindung und Zahlungsbedingungen für PDF-Rechnungen und -Angebote.
            {!ctx.isOwner && ' Zum Ändern benötigen Sie die Inhaber-Rolle.'}
          </p>
        </div>
        <TenantBillingForm address={address} invoiceData={invoiceData} disabled={!ctx.isOwner} />
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Module
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Nur aktivierte Module erscheinen im Menü. Kern-Module lassen sich nicht deaktivieren.
              {!canManage && ' Zum Ändern benötigen Sie die Berechtigung „Module verwalten".'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <div key={group.domain}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
                {DOMAIN_LABEL[group.domain]}
              </h3>
              <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
                {group.modules.map((mod) => {
                  const isEnabled = enabled.has(mod.key);
                  return (
                    <li
                      key={mod.key}
                      className="flex items-start justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{mod.labelDe}</span>
                          {mod.core && (
                            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
                              Kern
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                          {mod.description}
                        </p>
                      </div>
                      {mod.core ? (
                        <span className="whitespace-nowrap rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">
                          Immer aktiv
                        </span>
                      ) : canManage ? (
                        <form action={toggleModuleAction}>
                          <input type="hidden" name="module_key" value={mod.key} />
                          <input type="hidden" name="enabled" value={String(!isEnabled)} />
                          <button
                            type="submit"
                            role="switch"
                            aria-checked={isEnabled}
                            aria-label={`${mod.labelDe} ${isEnabled ? 'deaktivieren' : 'aktivieren'}`}
                            className={
                              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition ' +
                              (isEnabled
                                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                                : 'border-[var(--color-border)] bg-[var(--color-muted)]')
                            }
                          >
                            <span
                              className={
                                'inline-block size-4 rounded-full bg-white shadow transition ' +
                                (isEnabled ? 'translate-x-6' : 'translate-x-1')
                              }
                            />
                          </button>
                        </form>
                      ) : (
                        <StatusPill enabled={isEnabled} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {ctx.isOwner && (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Beispieldaten
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Legt drei Beispiel-Objekte und vier Aufträge an, damit Sie die App
              ohne echten Datenbestand ausprobieren können. Alle Einträge tragen
              das Präfix „[Demo]" und lassen sich mit einem Klick wieder entfernen.
            </p>
          </div>
          {demoCount > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                Aktuell sind <strong>{demoCount}</strong> Demo-Objekte plus zugehörige Aufträge geladen.
              </span>
              <form action={removeDemoDataAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-md border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)]/50"
                >
                  Beispieldaten entfernen
                </button>
              </form>
            </div>
          ) : (
            <form action={loadDemoDataAction}>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-[var(--color-primary)] px-3 text-sm font-medium text-[var(--color-primary-foreground)] transition hover:opacity-90"
              >
                Beispieldaten laden
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function StatusPill({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="whitespace-nowrap rounded-full bg-[var(--color-success)]/10 px-2.5 py-1 text-xs font-medium text-[var(--color-success)]">
        Aktiv
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-[var(--color-muted)] px-2.5 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">
      Inaktiv
    </span>
  );
}
