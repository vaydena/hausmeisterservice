'use server';

import { revalidatePath } from 'next/cache';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

export async function dismissOnboardingAction() {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) return;
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('tenants')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', ctx.tenantId)
    .is('onboarding_completed_at', null);
  if (error) throw error;
  revalidatePath('/dashboard');
}
