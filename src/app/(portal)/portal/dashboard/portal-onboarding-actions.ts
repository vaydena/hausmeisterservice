'use server';

import { revalidatePath } from 'next/cache';
import { requireResidentContext } from '@/lib/portal/current';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

/**
 * Sprint 40 · Portal-Willkommens-Overlay dauerhaft ausblenden.
 * Analog zu dismissOnboardingAction (Staff, Sprint 13.1), aber pro
 * Resident-Datensatz — jeder Bewohner sieht den Rundgang genau einmal.
 * requireResidentContext stellt sicher, dass die Action nur mit
 * gueltigem Resident-Login laeuft; ohne diesen Kontext wirft der
 * Helper und die Server-Action-Auth-Coverage-Regel bleibt gewahrt.
 */
export async function dismissPortalOnboardingAction() {
  const ctx = await requireResidentContext();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('residents')
    .update({ portal_onboarding_completed_at: new Date().toISOString() })
    .eq('id', ctx.residentId)
    .is('portal_onboarding_completed_at', null);
  if (error) throw error;
  revalidatePath('/portal/dashboard');
}
