'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

const confirmSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentReference: z.string().optional(),
});

export async function confirmBankTransferAction(formData: FormData) {
  await requirePlatformAdmin();
  const parsed = confirmSchema.safeParse({
    invoiceId: formData.get('invoiceId'),
    paymentReference: formData.get('paymentReference')?.toString() || undefined,
  });
  if (!parsed.success) throw new Error('Ungültige Rechnungs-ID.');
  const service = createSupabaseServiceClient();

  const paidAt = new Date();
  const { data: invoice, error: invErr } = await createPlatformServiceClient()
    .from('invoices')
    .update({
      paid_at: paidAt.toISOString(),
      status: 'paid',
      payment_reference: parsed.data.paymentReference ?? null,
    })
    .eq('id', parsed.data.invoiceId)
    .select('tenant_id, period_start, period_end, plan_id, plan_interval')
    .single();
  if (invErr) throw invErr;

  await service
    .from('tenants')
    .update({
      subscription_status: 'active',
      subscription_plan_id: invoice.plan_id,
      subscription_interval: invoice.plan_interval,
      current_period_start: invoice.period_start,
      current_period_end: invoice.period_end,
    })
    .eq('id', invoice.tenant_id);

  revalidatePath('/platform/payments');
  revalidatePath(`/platform/tenants/${invoice.tenant_id}`);
  revalidatePath('/platform');
}
