import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

export interface PlatformStats {
  tenants: {
    total: number;
    trial: number;
    active: number;
    past_due: number;
    suspended: number;
    canceled: number;
  };
  mrrCents: number;
  openInvoices: { count: number; totalCents: number };
  trialEndingSoon: number;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function getPlatformStats(): Promise<PlatformStats> {
  const service = createSupabaseServiceClient();

  const { data: tenants } = await service
    .from('tenants')
    .select('subscription_status, subscription_interval, subscription_plan_id, trial_ends_at');

  const { data: plans } = await createPlatformServiceClient()
    .from('subscription_plans')
    .select('id, monthly_price_cents, yearly_price_cents');

  const { data: openInv } = await createPlatformServiceClient()
    .from('invoices')
    .select('total_cents')
    .is('paid_at', null)
    .neq('status', 'canceled');

  const planById = new Map((plans ?? []).map((p) => [p.id, p]));
  const stats: PlatformStats = {
    tenants: { total: 0, trial: 0, active: 0, past_due: 0, suspended: 0, canceled: 0 },
    mrrCents: 0,
    openInvoices: { count: 0, totalCents: 0 },
    trialEndingSoon: 0,
  };

  const oneWeekOut = Date.now() + ONE_WEEK_MS;

  for (const t of tenants ?? []) {
    stats.tenants.total += 1;
    const status = (t.subscription_status ?? 'trial') as keyof PlatformStats['tenants'];
    if (status in stats.tenants && status !== 'total') {
      stats.tenants[status] += 1;
    }
    if (status === 'trial' && t.trial_ends_at) {
      const ends = new Date(t.trial_ends_at).getTime();
      if (ends <= oneWeekOut) stats.trialEndingSoon += 1;
    }
    if (status === 'active' && t.subscription_plan_id) {
      const plan = planById.get(t.subscription_plan_id);
      if (plan) {
        const monthly =
          t.subscription_interval === 'yearly'
            ? Math.round(plan.yearly_price_cents / 12)
            : plan.monthly_price_cents;
        stats.mrrCents += monthly;
      }
    }
  }

  for (const inv of openInv ?? []) {
    stats.openInvoices.count += 1;
    stats.openInvoices.totalCents += inv.total_cents ?? 0;
  }

  return stats;
}
