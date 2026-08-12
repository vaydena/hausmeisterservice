import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

export type FeatureKey = 'gps' | 'portal' | 'vehicles' | 'automations' | 'api';

const DEFAULT_FEATURES: Record<FeatureKey, boolean> = {
  gps: false,
  portal: false,
  vehicles: false,
  automations: false,
  api: false,
};

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
    const { data: tenant } = await service
      .from('tenants')
      .select('subscription_plan_id, subscription_status')
      .eq('id', tenantId)
      .maybeSingle();
    if (!tenant) return DEFAULT_FEATURES;

    // Während der Testphase (oder ohne gewählten Plan) sieht der User alles —
    // sonst könnte er die Software nicht evaluieren.
    if (tenant.subscription_status === 'trial' || !tenant.subscription_plan_id) {
      return { gps: true, portal: true, vehicles: true, automations: true, api: true };
    }

    const { data: plan } = await createPlatformServiceClient()
      .from('subscription_plans')
      .select('features')
      .eq('id', tenant.subscription_plan_id)
      .maybeSingle();
    if (!plan?.features) return DEFAULT_FEATURES;

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
 */
export async function requireFeature(tenantId: string, feature: FeatureKey): Promise<void> {
  if (!(await hasFeature(tenantId, feature))) {
    redirect('/settings/subscription?upgrade=' + feature);
  }
}
