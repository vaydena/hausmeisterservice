import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';

export type PlanInterval = 'monthly' | 'yearly';

export interface PeriodRange {
  start: Date;
  end: Date;
}

/**
 * Berechnet den nächsten Abrechnungszeitraum, der lückenlos an die letzte
 * bezahlte Periode oder — wenn es keine gibt — an die Testphase anschließt.
 * Fällt auf `now` zurück, wenn keiner der beiden Anker vorhanden ist.
 */
export function computeNextBillingPeriod(
  interval: PlanInterval,
  anchor: Date | null,
): PeriodRange {
  const start = anchor && anchor.getTime() > Date.now() ? new Date(anchor) : new Date();
  const end = new Date(start);
  if (interval === 'yearly') end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export function computePlanPriceCents(
  monthlyCents: number,
  yearlyCents: number,
  interval: PlanInterval,
): number {
  return interval === 'yearly' ? yearlyCents : monthlyCents;
}

export interface TenantBillingContext {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  planId: string | null;
  planName: string | null;
  planMonthlyCents: number | null;
  planYearlyCents: number | null;
  interval: PlanInterval;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  paymentMethod: 'bank_transfer' | 'stripe' | 'paypal';
  billingAddress: unknown;
}

export async function getTenantBillingContext(
  tenantId: string,
): Promise<TenantBillingContext | null> {
  const service = createSupabaseServiceClient();
  // Sprint 116: `null` heisst hier "diesen Mandanten gibt es nicht" und
  // fuehrt an den Call-Sites zu notFound(). Ein verschluckter Query-Fehler
  // wurde damit zu einer 404 auf einen existierenden Mandanten — die
  // Abo-Seite behauptete, das eigene Konto sei verschwunden.
  const tenant = unwrapMaybeRow(
    await service
      .from('tenants')
      .select(
        'id, name, slug, subscription_plan_id, subscription_interval, subscription_status, trial_ends_at, current_period_end, payment_method, address',
      )
      .eq('id', tenantId)
      .maybeSingle(),
    'Abrechnungskontext: Mandant',
  );
  if (!tenant) return null;

  let planName: string | null = null;
  let planMonthlyCents: number | null = null;
  let planYearlyCents: number | null = null;
  if (tenant.subscription_plan_id) {
    // Der Preis des gebuchten Tarifs. Fiel diese Query aus, blieben Name und
    // Betraege null — die Rechnung wurde dann ueber 0,00 EUR gestellt bzw.
    // die Abo-Seite zeigte einen gebuchten Tarif ohne Preis an.
    const plan = unwrapMaybeRow(
      await createPlatformServiceClient()
        .from('subscription_plans')
        .select('name, monthly_price_cents, yearly_price_cents')
        .eq('id', tenant.subscription_plan_id)
        .maybeSingle(),
      'Abrechnungskontext: Tarif',
    );
    if (plan) {
      planName = plan.name;
      planMonthlyCents = plan.monthly_price_cents;
      planYearlyCents = plan.yearly_price_cents;
    }
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    planId: tenant.subscription_plan_id ?? null,
    planName,
    planMonthlyCents,
    planYearlyCents,
    interval: (tenant.subscription_interval ?? 'monthly') as PlanInterval,
    status: tenant.subscription_status,
    trialEndsAt: tenant.trial_ends_at ?? null,
    currentPeriodEnd: tenant.current_period_end ?? null,
    paymentMethod: (tenant.payment_method ?? 'bank_transfer') as
      | 'bank_transfer'
      | 'stripe'
      | 'paypal',
    billingAddress: tenant.address,
  };
}
