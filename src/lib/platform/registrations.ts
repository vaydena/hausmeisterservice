import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapRows } from '@/lib/supabase/unwrap';
import {
  computeTrialDaysLeft,
  normalizePlanInterval,
  sortRegistrationQueue,
  type PlatformPlanOption,
  type TenantRegistration,
} from '@/lib/platform/registration-queue';

export type { PlatformPlanOption, TenantRegistration };

export interface PlatformRegistrationsView {
  plans: PlatformPlanOption[];
  /** Warteschlange: wartet auf Freischaltung. Dringlichste zuerst. */
  pending: TenantRegistration[];
  /** Freigeschaltet und zahlend. */
  active: TenantRegistration[];
  /** Suspendiert oder gekuendigt. */
  archived: TenantRegistration[];
}

/**
 * Alle Agenturen, gruppiert nach dem einzigen Zustand, der den Betreiber
 * interessiert: freigeschaltet oder nicht.
 *
 * Warum der gewuenschte Tarif aus zwei Quellen kommt:
 *
 * `ensure-tenant.ts` schreibt die Tarifwahl aus dem Signup in den Mandanten
 * — aber nur beim ersten Provisionieren, und bewusst ohne throw, weil der
 * Mandant an der Stelle schon existiert. Schlaegt der Tarif-Lookup fehl,
 * geht die Wahl still verloren (Meldung an Sentry). Genau das ist passiert:
 * das `platform`-Schema war fuer PostgREST nicht sichtbar, und "Firma ABC"
 * hat am 16.08.2026 `starter/monthly` gewaehlt, ohne dass es am Mandanten
 * ankam. Der Wunsch steht aber unveraendert im user_metadata des Inhabers.
 *
 * Deshalb wird hier beides gelesen. Der Betreiber soll sehen, was der Kunde
 * bestellt hat, auch wenn die Zuordnung an der Mandantenzeile fehlt — sonst
 * ruft er wegen einer Information an, die das System bereits hat.
 */
export async function loadPlatformRegistrations(): Promise<PlatformRegistrationsView> {
  const service = createSupabaseServiceClient();

  const [tenantsResult, plansResult] = await Promise.all([
    service
      .from('tenants')
      .select(
        'id, name, slug, subscription_status, subscription_plan_id, subscription_interval, trial_ends_at, current_period_end, created_at',
      )
      .order('created_at', { ascending: true }),
    createPlatformServiceClient()
      .from('subscription_plans')
      .select('id, code, name, monthly_price_cents, yearly_price_cents')
      .order('sort_order'),
  ]);

  // Sprint 116er Regel: ein verschluckter Fehler waere hier die Aussage
  // "es wartet keine Registrierung" — also genau die Aussage, auf die hin
  // der Betreiber nichts tut und der Kunde nach Fristablauf ausgesperrt
  // wird, obwohl er bezahlt hat.
  const tenants = unwrapRows(tenantsResult, 'Registrierungen: Agenturen');
  const planRows = unwrapRows(plansResult, 'Registrierungen: Tarife');

  const ownerships = unwrapRows(
    await service
      .from('memberships')
      .select('tenant_id, user_id, created_at')
      .eq('is_owner', true)
      .eq('status', 'active'),
    'Registrierungen: Inhaber',
  );

  // Ein Aufruf statt einer getUserById-Runde pro Mandant. perPage deckt die
  // absehbare Kundenzahl; waechst sie darueber hinaus, fehlen E-Mail und
  // Tarifwunsch der hinteren Seiten — dann muss hier paginiert werden.
  const { data: userPage } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const usersById = new Map((userPage?.users ?? []).map((u) => [u.id, u]));

  const ownerByTenant = new Map<string, string>();
  for (const m of ownerships) {
    if (!ownerByTenant.has(m.tenant_id)) ownerByTenant.set(m.tenant_id, m.user_id);
  }

  const plans: PlatformPlanOption[] = planRows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    monthlyCents: p.monthly_price_cents,
    yearlyCents: p.yearly_price_cents,
  }));

  const now = new Date();
  const all: TenantRegistration[] = tenants.map((t) => {
    const ownerId = ownerByTenant.get(t.id);
    const owner = ownerId ? usersById.get(ownerId) : undefined;
    const meta = (owner?.user_metadata ?? {}) as Record<string, unknown>;
    const { daysLeft, expired } = computeTrialDaysLeft(t.trial_ends_at, now);

    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      ownerEmail: owner?.email ?? null,
      registeredAt: t.created_at,
      subscriptionStatus: t.subscription_status ?? 'trial',
      trialEndsAt: t.trial_ends_at ?? null,
      currentPeriodEnd: t.current_period_end ?? null,
      assignedPlanId: t.subscription_plan_id ?? null,
      assignedInterval: normalizePlanInterval(t.subscription_interval),
      requestedPlanCode:
        typeof meta.signup_plan_code === 'string' ? meta.signup_plan_code : null,
      requestedInterval: normalizePlanInterval(meta.signup_plan_interval),
      trialDaysLeft: daysLeft,
      trialExpired: expired,
    };
  });

  return {
    plans,
    pending: sortRegistrationQueue(
      all.filter((t) => t.subscriptionStatus === 'trial' || t.subscriptionStatus === 'past_due'),
    ),
    active: all.filter((t) => t.subscriptionStatus === 'active'),
    archived: all.filter(
      (t) => t.subscriptionStatus === 'suspended' || t.subscriptionStatus === 'canceled',
    ),
  };
}
