import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { requireTenantContext } from '@/lib/tenant/current';
import { getAvailableModules } from '@/lib/modules/enabled';
import { getEffectivePermissions } from '@/lib/permissions/effective';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hasVerifiedMfaFactor } from '@/lib/auth/mfa-status';
import { MODULES, MODULES_BY_KEY, type ModuleDomain, type ModuleKey } from '@/lib/modules/registry';
import { unwrapMaybeRow, unwrapRows } from '@/lib/supabase/unwrap';
import { hrefAvailable } from '@/lib/modules/href-guard';
import { WelcomeGuide } from './welcome-overlay';
import { ONBOARDING_STEPS } from './onboarding-steps';
import { MfaReminderBanner } from './mfa-reminder-banner';

// 7 Tage — nach dem Dismiss bleibt der Banner solange stumm. Danach kommt
// er wieder, weil Owner-Konten das sensibelste Ziel eines Angreifers sind
// und dauerhaftes "abgehakt"-Verhalten hier nicht sinnvoll ist.
const MFA_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export const metadata: Metadata = { title: 'Dashboard' };

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  // /dashboard?willkommen=1 öffnet den Erste-Schritte-Assistenten gezielt —
  // der Aufruf-Weg von der Hilfe-Seite (und jedem anderen Link) her.
  const openWelcomeViaLink = (await searchParams).willkommen === '1';

  const [enabledModules, permissions, tenantRes, rolesRes] = await Promise.all([
    // Sprint 114: bewusst die tarifbereinigte Menge — die Kachel zaehlt,
    // was der Mandant benutzen kann, nicht was er angehakt hat.
    getAvailableModules(ctx.tenantId),
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

  // Sprint 112: Beide Zeilen tragen eine Aussage ueber den Nutzer selbst, und
  // beide fielen verschluckt auf einen glaubhaften Ersatzwert zurueck.
  //
  // onboarding_completed_at steuert das Willkommens-Overlay (Sprint 13). Ein
  // Lesefehler liess es wieder aufgehen — vor einem Owner, der seinen Mandanten
  // laengst eingerichtet hat. Das ist die Umkehrung von Sprint 108: dort log
  // der Zustand den Mitarbeiter an, hier faellt eine erledigte Einrichtung
  // zurueck auf "noch nicht erledigt".
  //
  // roleNames steht darunter als "Rolle: Inhaber". Verschluckt verschwand die
  // Zeile ersatzlos — nicht als Fehler, sondern so, als haette der Nutzer
  // schlicht keine Rolle. Wer hier nachsieht, weil er sich fragt, warum eine
  // Aktion fehlt, bekommt eine Antwort auf die falsche Frage.
  const tenant = unwrapMaybeRow(tenantRes, 'Dashboard: Mandant');
  const roles = unwrapRows(rolesRes, 'Dashboard: eigene Rollen');

  const tenantName = tenant?.name ?? 'Ihr Mandant';
  // Automatisch (einmalig) nur beim ersten Mal. Der Button, um den Assistenten
  // erneut zu öffnen, steht dem Owner aber dauerhaft zur Verfügung.
  const autoShowWelcome = ctx.isOwner && !tenant?.onboarding_completed_at;

  // MFA-Reminder nur fuer Owner (nur sie koennen dem Tenant Schaden
  // zufuegen), nur ohne verifizierten Faktor, und nur wenn der letzte
  // Dismiss ausserhalb des Cooldowns liegt.
  let showMfaReminder = false;
  if (ctx.isOwner) {
    const enrolled = await hasVerifiedMfaFactor(supabase);
    if (!enrolled) {
      const dismissed = (await cookies()).get('mfa_reminder_dismissed_at')?.value;
      const dismissedAt = dismissed ? Number(dismissed) : 0;
      const cooldownActive =
        Number.isFinite(dismissedAt) &&
        dismissedAt > 0 &&
        Date.now() - dismissedAt < MFA_REMINDER_COOLDOWN_MS;
      showMfaReminder = !cooldownActive;
    }
  }

  const roleNames = roles.map((r) => r.roles?.name).filter((n): n is string => Boolean(n));

  const activeToggleable = [...enabledModules].filter((key) => !MODULES_BY_KEY[key]?.core);

  // Sprint 121: Schritte, deren Ziel in einem abgeschalteten Modul liegt,
  // faellt der Knopf weg — der erklaerende Text bleibt. Ueber `hrefAvailable`
  // und nicht ueber `enabledModules` direkt, damit es genau eine Stelle gibt,
  // die "Ziel erreichbar?" beantwortet. Die Menge ist `cache`d; die vier
  // Aufrufe kosten keine zusaetzliche Abfrage.
  // Für Owner immer berechnen (nicht nur beim ersten Mal), da der Assistent
  // jederzeit erneut geöffnet werden kann. Die vier `hrefAvailable`-Aufrufe
  // sind `cache`d und kosten keine zusätzliche Abfrage.
  const onboardingSteps = ctx.isOwner
    ? await Promise.all(
        ONBOARDING_STEPS.map(async (step) =>
          !step.href || (await hrefAvailable(step.href))
            ? step
            : { ...step, href: undefined, cta: undefined },
        ),
      )
    : [];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}
            {ctx.displayName ? `, ${ctx.displayName.split(' ')[0]}` : ''}.
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Mandant: <span className="font-medium text-[var(--color-foreground)]">{tenantName}</span>
            {roleNames.length > 0 && (
              <>
                {' · '}Rolle{roleNames.length > 1 ? 'n' : ''}:{' '}
                <span className="font-medium text-[var(--color-foreground)]">
                  {roleNames.join(', ')}
                </span>
              </>
            )}
          </p>
        </div>
        {ctx.isOwner && (
          <WelcomeGuide
            tenantName={tenantName}
            steps={onboardingSteps}
            autoShow={autoShowWelcome}
            openViaLink={openWelcomeViaLink}
          />
        )}
      </section>

      {showMfaReminder && <MfaReminderBanner />}

      <StatsGrid
        moduleCount={activeToggleable.length}
        permissionCount={permissions.size}
        isOwner={ctx.isOwner}
      />

      {activeToggleable.length === 0 ? (
        <EmptyModulesCard />
      ) : (
        <OrderedModuleSections enabled={activeToggleable} />
      )}
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
    {
      label: 'Aktive Module',
      value: String(moduleCount),
      hint: 'zusätzlich zu den Kern-Modulen',
    },
    {
      label: 'Ihre Berechtigungen',
      value: String(permissionCount),
      hint: 'effektive Permissions im Mandanten',
    },
    {
      label: 'Rolle',
      value: isOwner ? 'Mandant-Owner' : 'Mitglied',
      hint: 'Zugriffsebene',
    },
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

/**
 * Die Bereiche des Dashboards in der Reihenfolge, in der ein Betrieb sie
 * sinnvoll abarbeitet: erst die Stammdaten (was und wer), dann das
 * Tagesgeschaeft, dann Auswertung und System. Gruppiert wird ueber das
 * `domain`-Feld der Registry — die bleibt die einzige Wahrheit darueber,
 * welches Modul zu welcher Domaene gehoert; hier steht nur, wie die Domaenen
 * fuer diese Ansicht heissen und in welcher Reihenfolge sie erscheinen.
 *
 * `core`, `platform` sind bewusst getrennt: Kern-Module sind ohnehin
 * ausgefiltert (activeToggleable), `platform` ist der Abschluss "System".
 */
const DASHBOARD_SECTIONS: readonly { domain: ModuleDomain; title: string; purpose: string }[] = [
  { domain: 'objects', title: 'Objekte & Anlagen', purpose: 'Der Anfang: Liegenschaften, Gebäude und technische Anlagen erfassen.' },
  { domain: 'people', title: 'Personen', purpose: 'Wer beteiligt ist: Mitarbeiter, Bewohner und Eigentümer anlegen.' },
  { domain: 'tasks', title: 'Aufgaben & Wartung', purpose: 'Das Tagesgeschäft: Aufträge, Meldungen, Wartungen und Checklisten.' },
  { domain: 'field', title: 'Einsatz vor Ort', purpose: 'Arbeitszeit erfassen und Einsätze planen.' },
  { domain: 'resources', title: 'Ressourcen', purpose: 'Schlüssel, Zähler, Material, Fahrzeuge und Dokumente verwalten.' },
  { domain: 'communication', title: 'Kommunikation', purpose: 'Nachrichten und Ankündigungen an Team, Bewohner und Eigentümer.' },
  { domain: 'finance', title: 'Finanzen', purpose: 'Kosten abrechnen und Kennzahlen auswerten.' },
  { domain: 'platform', title: 'System', purpose: 'QR-Codes und Automatisierungen einrichten.' },
];

function OrderedModuleSections({ enabled }: { enabled: ModuleKey[] }) {
  const enabledSet = new Set(enabled);

  // Pro Abschnitt die aktiven Module in Registry-Reihenfolge sammeln (statt in
  // der ungeordneten `enabled`-Menge), damit die Karten deterministisch stehen.
  // Nur nicht-leere Abschnitte werden gerendert und fortlaufend nummeriert —
  // ein Mandant ohne z.B. Einsatz-Module bekommt keine Luecke in der Zaehlung.
  const sections = DASHBOARD_SECTIONS.map((section) => ({
    ...section,
    modules: MODULES.filter(
      (m) => m.domain === section.domain && !m.core && enabledSet.has(m.key),
    ),
  })).filter((section) => section.modules.length > 0);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
          Ihre Bereiche
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          In empfohlener Reihenfolge — von der Einrichtung bis zum Tagesgeschäft.
        </p>
      </div>

      {sections.map((section, index) => (
        <div key={section.domain}>
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
              {index + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold leading-tight">{section.title}</h3>
              <p className="text-xs text-[var(--color-muted-foreground)]">{section.purpose}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:pl-10 lg:grid-cols-3">
            {section.modules.map((mod) => (
              <div
                key={mod.key}
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
            ))}
          </div>
        </div>
      ))}
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
