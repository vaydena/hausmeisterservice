import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { FEATURE_KEYS, type FeatureKey } from '@/lib/tenant/feature-map';

/**
 * Plan-Features des Mandanten.
 *
 * Sprint 114: Bis hierher hatte dieses Modul keinen einzigen Importeur — die
 * Features standen auf /preise und unter Einstellungen->Abo, wurden zur
 * Laufzeit aber nirgends durchgesetzt. Wer Starter buchte, bekam den vollen
 * Funktionsumfang. Jetzt haengen drei Schichten daran:
 *
 *   1. Route:   src/app/(app)/layout.tsx  ueber featureForPath()
 *   2. Menue:   getAvailableModules() in src/lib/modules/enabled.ts
 *   3. Aktion:  requireFeature() in tours/vehicles/automations-Actions
 *               und im Portal-Layout
 *
 * Alle drei sind noetig. Ein Menueeintrag auszublenden ist kein Gate — die
 * Route bleibt per URL erreichbar, und Server Actions laufen ganz ohne
 * Layout. Die Zuordnung Feature -> Route/Modul steht in feature-map.ts.
 *
 * Der Zeitpunkt war bewusst gewaehlt: beide Live-Mandanten stehen auf
 * `trial` ohne Plan und bekommen deshalb unveraendert alles (siehe unten).
 * Scharf werden die Gates erst fuer den ersten Mandanten mit gebuchtem Plan.
 */
export type { FeatureKey };

/**
 * Was ist im aktuellen Plan des Tenants freigeschaltet?
 * Cached pro Request. Wenn kein Plan gesetzt ist (frischer Tenant), sind
 * alle optionalen Features im Trial trotzdem sichtbar — der Trial soll
 * das volle Produkt zeigen. Erst nach Trial-Ende + aktiviertem Plan
 * greifen die Gates.
 */
export const getEnabledFeatures = cache(
  async (tenantId: string): Promise<Record<FeatureKey, boolean>> => {
    const service = createSupabaseServiceClient();
    // Sprint 104: "alles gesperrt" ist der restriktive Default. Als Fallback
    // fuer einen Query-Fehler hiesse das: requireFeature() schickt den Kunden
    // auf die Tarif-Sperrseite — die Software fordert ihn also auf, etwas
    // nachzukaufen, das er bereits bezahlt hat. Nur der echte Fall "keine
    // Tenant-Zeile" behaelt den restriktiven Default.
    const tenant = unwrapMaybeRow(
      await service
        .from('tenants')
        .select('subscription_plan_id, subscription_status')
        .eq('id', tenantId)
        .maybeSingle(),
      'Plan-Features: Mandant',
    );
    if (!tenant) return noFeatures();

    // Während der Testphase (oder ohne gewählten Plan) sieht der User alles —
    // sonst könnte er die Software nicht evaluieren.
    if (tenant.subscription_status === 'trial' || !tenant.subscription_plan_id) {
      return allFeatures();
    }

    const plan = unwrapMaybeRow(
      await createPlatformServiceClient()
        .from('subscription_plans')
        .select('features')
        .eq('id', tenant.subscription_plan_id)
        .maybeSingle(),
      'Plan-Features: Tarif',
    );
    if (!plan?.features) return noFeatures();

    const raw = plan.features as Record<string, unknown>;
    return {
      gps:         raw.gps === true,
      portal:      raw.portal === true,
      vehicles:    raw.vehicles === true,
      automations: raw.automations === true,
      api:         raw.api === true,
    };
  },
);

export async function hasFeature(tenantId: string, feature: FeatureKey): Promise<boolean> {
  const enabled = await getEnabledFeatures(tenantId);
  return enabled[feature];
}

/**
 * Redirect wenn das Feature im aktuellen Plan nicht enthalten ist. Für
 * Server-Component-Pages und Server-Actions als erster Aufruf.
 *
 * Sprint 114: Ziel ist /tarif-erforderlich, nicht mehr direkt
 * /settings/subscription. Diese Seite redirected Nicht-Inhaber sofort auf
 * /dashboard — ein Mitarbeiter waere also wortlos weggeleitet worden, ohne
 * je zu erfahren, warum "Fuhrpark" nicht mehr aufgeht. Die neue Seite
 * benennt das fehlende Feature und schickt nur Inhaber weiter zum Tarif.
 */
export async function requireFeature(tenantId: string, feature: FeatureKey): Promise<void> {
  if (!(await hasFeature(tenantId, feature))) {
    redirect(`/tarif-erforderlich?feature=${feature}`);
  }
}

/** Alle Features aus — der restriktive Default, wenn es den Mandanten nicht gibt. */
function noFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>;
}

/** Alle Features an — Testphase und Mandanten ohne gewaehlten Plan. */
function allFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as Record<FeatureKey, boolean>;
}
