'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const uuidSchema = z.string().uuid();

const setStatusSchema = z.object({
  tenantId: uuidSchema,
  status: z.enum(['trial', 'active', 'past_due', 'suspended', 'canceled']),
});

export async function setTenantStatusAction(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = setStatusSchema.parse({
    tenantId: formData.get('tenantId'),
    status: formData.get('status'),
  });
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('tenants')
    .update({ subscription_status: parsed.status })
    .eq('id', parsed.tenantId);
  if (error) throw error;
  revalidatePath(`/platform/tenants/${parsed.tenantId}`);
  revalidatePath('/platform/tenants');
  revalidatePath('/platform');
}

const extendTrialSchema = z.object({
  tenantId: uuidSchema,
  days: z.coerce.number().int().min(1).max(365).default(14),
});

export async function extendTrialAction(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = extendTrialSchema.parse({
    tenantId: formData.get('tenantId'),
    days: formData.get('days'),
  });
  const service = createSupabaseServiceClient();
  const { data: tenant, error: readErr } = await service
    .from('tenants')
    .select('trial_ends_at')
    .eq('id', parsed.tenantId)
    .single();
  if (readErr) throw readErr;

  const base = tenant?.trial_ends_at ? new Date(tenant.trial_ends_at) : new Date();
  if (base.getTime() < Date.now()) base.setTime(Date.now());
  base.setDate(base.getDate() + parsed.days);

  const { error } = await service
    .from('tenants')
    .update({
      trial_ends_at: base.toISOString(),
      subscription_status: 'trial',
    })
    .eq('id', parsed.tenantId);
  if (error) throw error;
  revalidatePath(`/platform/tenants/${parsed.tenantId}`);
  revalidatePath('/platform/tenants');
}

const changePlanSchema = z.object({
  tenantId: uuidSchema,
  planId: uuidSchema,
  interval: z.enum(['monthly', 'yearly']),
});

export async function changeTenantPlanAction(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = changePlanSchema.parse({
    tenantId: formData.get('tenantId'),
    planId: formData.get('planId'),
    interval: formData.get('interval'),
  });
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('tenants')
    .update({
      subscription_plan_id: parsed.planId,
      subscription_interval: parsed.interval,
    })
    .eq('id', parsed.tenantId);
  if (error) throw error;
  revalidatePath(`/platform/tenants/${parsed.tenantId}`);
  revalidatePath('/platform/tenants');
}

const deleteSchema = z.object({
  tenantId: uuidSchema,
  confirmName: z.string().min(1),
});

export async function deleteTenantAction(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = deleteSchema.parse({
    tenantId: formData.get('tenantId'),
    confirmName: formData.get('confirmName'),
  });
  const service = createSupabaseServiceClient();

  const { data: tenant, error: readErr } = await service
    .from('tenants')
    .select('id, name')
    .eq('id', parsed.tenantId)
    .single();
  if (readErr) throw readErr;
  if (tenant.name !== parsed.confirmName) {
    throw new Error(`Bestätigungsname stimmt nicht ("${parsed.confirmName}" vs "${tenant.name}")`);
  }

  // Storage-Cascade händisch — Postgres-Trigger können storage.objects nicht anfassen.
  const { data: objects } = await service.storage
    .from('employee-documents')
    .list(parsed.tenantId, { limit: 1000 });
  if (objects && objects.length > 0) {
    const paths = objects.map((o) => `${parsed.tenantId}/${o.name}`);
    await service.storage.from('employee-documents').remove(paths);
  }

  const { error: delErr } = await service.from('tenants').delete().eq('id', parsed.tenantId);
  if (delErr) throw delErr;

  redirect('/platform/tenants');
}
