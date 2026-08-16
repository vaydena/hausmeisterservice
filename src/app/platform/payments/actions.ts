'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { activateTenantSubscription } from '@/lib/platform/activate-tenant';
import { normalizePlanInterval } from '@/lib/platform/registration-queue';

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

  // Sprint 137: Der Fehler dieses Updates wurde bis dahin nicht geprueft.
  // Schlug es fehl, war die Rechnung trotzdem auf "bezahlt" gesetzt — der
  // Betreiber sah den Zahlungseingang als erledigt, waehrend der Mandant
  // weiter in 'trial' stand und nach Fristablauf ausgesperrt wurde, obwohl
  // er bezahlt hat. Sprint 138 zieht die Freischaltung in einen gemeinsamen
  // Helper, damit beide Wege denselben Zustand herstellen.
  if (!invoice.plan_id) {
    throw new Error(
      `Rechnung ${parsed.data.invoiceId} hat keinen Tarif — ohne Tarif laesst sich der Mandant nicht freischalten.`,
    );
  }
  await activateTenantSubscription({
    tenantId: invoice.tenant_id,
    planId: invoice.plan_id,
    interval: normalizePlanInterval(invoice.plan_interval) ?? 'monthly',
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
  });

  revalidatePath('/platform/payments');
  revalidatePath(`/platform/tenants/${invoice.tenant_id}`);
  revalidatePath('/platform');
}
