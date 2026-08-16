import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import type { PlanInterval } from '@/lib/platform/billing';

/**
 * Sprint 138 · Der Mandant wird arbeitsfaehig geschaltet.
 *
 * Es gibt zwei Wege zu einem Zahlungseingang — die Warteschlange in
 * /platform und die Bestaetigung einer einzelnen Rechnung in
 * /platform/payments. Beide muessen danach denselben Zustand herstellen,
 * sonst haengt der Zugang davon ab, ueber welchen Knopf der Betreiber
 * gegangen ist.
 *
 * Der gepruefte Fehler ist der eigentliche Grund fuer diese Funktion:
 * schlaegt das Update fehl, ist die Rechnung bereits bezahlt gebucht. Der
 * Betreiber haelt den Fall fuer erledigt, waehrend der Kunde nach
 * Fristablauf ausgesperrt wird, obwohl er ueberwiesen hat. Der Fehler muss
 * an die Oberflaeche, damit er noch im selben Klick auffaellt.
 */
export async function activateTenantSubscription(params: {
  tenantId: string;
  planId: string;
  interval: PlanInterval;
  periodStart: string;
  periodEnd: string;
}): Promise<void> {
  const { error } = await createSupabaseServiceClient()
    .from('tenants')
    .update({
      subscription_status: 'active',
      subscription_plan_id: params.planId,
      subscription_interval: params.interval,
      current_period_start: params.periodStart,
      current_period_end: params.periodEnd,
    })
    .eq('id', params.tenantId);
  if (error) throw error;
}
