'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { clientEnv } from '@/lib/env';
import { requireTenantContext } from '@/lib/tenant/current';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { computeNextBillingPeriod, computePlanPriceCents } from '@/lib/platform/billing';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { isPaypalConfigured, createPaypalOrder } from '@/lib/platform/paypal';

const uuidSchema = z.string().uuid();

const selectPlanSchema = z.object({
  planId: uuidSchema,
  interval: z.enum(['monthly', 'yearly']),
});

export async function selectPlanAction(formData: FormData) {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann das Abo verwalten.');
  const parsed = selectPlanSchema.safeParse({
    planId: formData.get('planId'),
    interval: formData.get('interval'),
  });
  if (!parsed.success) throw new Error('Ungültige Auswahl.');
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('tenants')
    .update({
      subscription_plan_id: parsed.data.planId,
      subscription_interval: parsed.data.interval,
    })
    .eq('id', ctx.tenantId);
  if (error) throw error;
  revalidatePath('/settings/subscription');
}

const switchMethodSchema = z.object({
  method: z.enum(['bank_transfer', 'stripe', 'paypal']),
});

export async function switchPaymentMethodAction(formData: FormData) {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann die Zahlungsart ändern.');
  const parsed = switchMethodSchema.safeParse({ method: formData.get('method') });
  if (!parsed.success) throw new Error('Ungültige Zahlungsart.');
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from('tenants')
    .update({ payment_method: parsed.data.method })
    .eq('id', ctx.tenantId);
  if (error) throw error;
  revalidatePath('/settings/subscription');
}

export async function requestBankTransferInvoiceAction() {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann eine Rechnung anfordern.');
  const service = createSupabaseServiceClient();

  const { data: tenant, error: tErr } = await service
    .from('tenants')
    .select(
      'id, subscription_plan_id, subscription_interval, current_period_end, trial_ends_at, address',
    )
    .eq('id', ctx.tenantId)
    .single();
  if (tErr) throw tErr;
  if (!tenant.subscription_plan_id || !tenant.subscription_interval) {
    throw new Error('Bitte zuerst einen Plan und Zahlungsintervall wählen.');
  }

  const { data: plan, error: pErr } = await createPlatformServiceClient()
    .from('subscription_plans')
    .select('monthly_price_cents, yearly_price_cents')
    .eq('id', tenant.subscription_plan_id)
    .single();
  if (pErr) throw pErr;

  const anchor = tenant.current_period_end
    ? new Date(tenant.current_period_end)
    : tenant.trial_ends_at
      ? new Date(tenant.trial_ends_at)
      : null;
  const period = computeNextBillingPeriod(tenant.subscription_interval, anchor);
  const priceCents = computePlanPriceCents(
    plan.monthly_price_cents,
    plan.yearly_price_cents,
    tenant.subscription_interval,
  );

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 14);

  const { error: iErr } = await createPlatformServiceClient().from('invoices').insert({
    tenant_id: tenant.id,
    plan_id: tenant.subscription_plan_id,
    plan_interval: tenant.subscription_interval,
    period_start: period.start.toISOString(),
    period_end: period.end.toISOString(),
    subtotal_cents: priceCents,
    total_cents: priceCents,
    currency: 'EUR',
    payment_method: 'bank_transfer',
    due_at: dueAt.toISOString(),
    billing_address: tenant.address ?? null,
  });
  if (iErr) throw iErr;

  await service
    .from('tenants')
    .update({ payment_method: 'bank_transfer' })
    .eq('id', tenant.id);

  revalidatePath('/settings/subscription');
}

/**
 * Startet eine PayPal-Zahlung für das Abo: legt (oder findet) eine offene
 * Rechnung, erzeugt eine PayPal-Order und leitet zur Freigabe-URL weiter. Der
 * eigentliche Geldfluss wird erst in der Return-Route captured
 * (`/api/paypal/return` → finalizePaypalPayment).
 */
export async function startPaypalPaymentAction() {
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) throw new Error('Nur der Inhaber kann das Abo verwalten.');
  if (!isPaypalConfigured()) throw new Error('PayPal ist nicht konfiguriert.');

  const service = createSupabaseServiceClient();
  const platform = createPlatformServiceClient();

  const { data: tenant, error: tErr } = await service
    .from('tenants')
    .select(
      'id, subscription_plan_id, subscription_interval, current_period_end, trial_ends_at, address',
    )
    .eq('id', ctx.tenantId)
    .single();
  if (tErr) throw tErr;
  if (!tenant.subscription_plan_id || !tenant.subscription_interval) {
    throw new Error('Bitte zuerst einen Plan und Zahlungsintervall wählen.');
  }
  const interval = tenant.subscription_interval;

  // Offene, unbezahlte Rechnung wiederverwenden, damit wiederholte Klicks
  // keine Dubletten erzeugen.
  const pending = unwrapMaybeRow(
    await platform
      .from('invoices')
      .select('id, invoice_number, total_cents')
      .eq('tenant_id', tenant.id)
      .eq('status', 'open')
      .is('paid_at', null)
      .order('issued_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'PayPal: offene Rechnung',
  );

  let invoiceId: string;
  let invoiceNumber: string;
  let amountCents: number;

  if (pending) {
    invoiceId = pending.id;
    invoiceNumber = pending.invoice_number;
    amountCents = pending.total_cents;
  } else {
    const { data: plan, error: pErr } = await platform
      .from('subscription_plans')
      .select('monthly_price_cents, yearly_price_cents')
      .eq('id', tenant.subscription_plan_id)
      .single();
    if (pErr) throw pErr;

    const anchor = tenant.current_period_end
      ? new Date(tenant.current_period_end)
      : tenant.trial_ends_at
        ? new Date(tenant.trial_ends_at)
        : null;
    const period = computeNextBillingPeriod(interval, anchor);
    amountCents = computePlanPriceCents(
      plan.monthly_price_cents,
      plan.yearly_price_cents,
      interval,
    );

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + 14);

    const { data: inserted, error: iErr } = await platform
      .from('invoices')
      .insert({
        tenant_id: tenant.id,
        plan_id: tenant.subscription_plan_id,
        plan_interval: interval,
        period_start: period.start.toISOString(),
        period_end: period.end.toISOString(),
        subtotal_cents: amountCents,
        total_cents: amountCents,
        currency: 'EUR',
        payment_method: 'paypal',
        due_at: dueAt.toISOString(),
        billing_address: tenant.address ?? null,
      })
      .select('id, invoice_number')
      .single();
    if (iErr) throw iErr;
    invoiceId = inserted.id;
    invoiceNumber = inserted.invoice_number;
  }

  // Mandant auf PayPal als Zahlungsart stellen.
  await service.from('tenants').update({ payment_method: 'paypal' }).eq('id', tenant.id);

  const base = clientEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const order = await createPaypalOrder({
    amountEur: amountCents / 100,
    invoiceId,
    description: `Vaydena Hausmeisterservice — Rechnung ${invoiceNumber}`,
    returnUrl: `${base}/api/paypal/return`,
    cancelUrl: `${base}/settings/subscription?paypal=abgebrochen`,
  });

  await platform
    .from('invoices')
    .update({ paypal_order_id: order.id, payment_method: 'paypal' })
    .eq('id', invoiceId);

  // redirect() wirft NEXT_REDIRECT — bewusst außerhalb von try/catch, damit es
  // nicht als Fehler verschluckt wird. Führt den Browser zur PayPal-Freigabe.
  redirect(order.approvalUrl);
}
