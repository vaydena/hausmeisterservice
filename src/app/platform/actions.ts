'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { computeNextBillingPeriod, computePlanPriceCents } from '@/lib/platform/billing';

const activateSchema = z.object({
  tenantId: z.string().uuid(),
  planId: z.string().uuid(),
  interval: z.enum(['monthly', 'yearly']),
  paymentReference: z.string().trim().max(140).optional(),
});

/**
 * Freischaltung einer Agentur nach Zahlungseingang.
 *
 * Der Betreiber bekommt sein Geld per Ueberweisung — es gibt keinen
 * automatischen Zahlungsabgleich, und dauerhaft auch keinen Kartenanbieter.
 * Der einzige Weg von "hat bezahlt" zu "darf arbeiten" fuehrt also ueber
 * diese Aktion.
 *
 * Warum die Rechnung VOR der Freischaltung geschrieben wird, obwohl das
 * Geld schon da ist: die beiden Schreibvorgaenge koennen einzeln scheitern.
 * Bleibt die Rechnung ohne Freischaltung liegen, sieht der Betreiber sie in
 * /platform/invoices und in der Warteschlange steht der Kunde weiter oben —
 * beides sichtbar, beides reparierbar. Umgekehrt waere ein freigeschalteter
 * Mandant ohne Beleg nirgends nachweisbar: keine Rechnungsnummer, kein
 * Zeitraum, keine Bankreferenz. Der unsichtbare Fehler ist der teurere.
 *
 * Der bezahlte Zeitraum schliesst an die Testphase an, nicht an den heutigen
 * Tag (computeNextBillingPeriod nimmt den Anker nur, wenn er in der Zukunft
 * liegt). Wer frueh bezahlt, verschenkt damit keine Resttage — dieselbe
 * Rechnung wie im Selbstbedienungsweg unter Einstellungen→Abo.
 */
export async function activateTenantPlanAction(formData: FormData) {
  await requirePlatformAdmin();

  const parsed = activateSchema.safeParse({
    tenantId: formData.get('tenantId'),
    planId: formData.get('planId'),
    interval: formData.get('interval'),
    paymentReference: formData.get('paymentReference')?.toString().trim() || undefined,
  });
  if (!parsed.success) {
    throw new Error('Freischaltung: Ungültige Eingabe (Mandant, Tarif oder Zahlungsintervall).');
  }

  const { tenantId, planId, interval, paymentReference } = parsed.data;
  const service = createSupabaseServiceClient();
  const platform = createPlatformServiceClient();

  const { data: tenant, error: tenantErr } = await service
    .from('tenants')
    .select('id, name, address, trial_ends_at, current_period_end')
    .eq('id', tenantId)
    .maybeSingle();
  if (tenantErr) throw tenantErr;
  if (!tenant) throw new Error('Freischaltung: Diese Agentur existiert nicht (mehr).');

  const { data: plan, error: planErr } = await platform
    .from('subscription_plans')
    .select('id, name, monthly_price_cents, yearly_price_cents')
    .eq('id', planId)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) throw new Error('Freischaltung: Dieser Tarif existiert nicht (mehr).');

  const priceCents = computePlanPriceCents(
    plan.monthly_price_cents,
    plan.yearly_price_cents,
    interval,
  );
  const anchor = tenant.current_period_end ?? tenant.trial_ends_at;
  const period = computeNextBillingPeriod(interval, anchor ? new Date(anchor) : null);
  const paidAt = new Date();

  const { error: invoiceErr } = await platform.from('invoices').insert({
    tenant_id: tenantId,
    plan_id: planId,
    plan_interval: interval,
    period_start: period.start.toISOString(),
    period_end: period.end.toISOString(),
    subtotal_cents: priceCents,
    total_cents: priceCents,
    currency: 'EUR',
    status: 'paid',
    payment_method: 'bank_transfer',
    paid_at: paidAt.toISOString(),
    payment_reference: paymentReference ?? null,
    issued_at: paidAt.toISOString(),
    due_at: paidAt.toISOString(),
    billing_address: tenant.address ?? null,
    notes: `Freischaltung durch den Plattform-Betreiber nach Zahlungseingang (${plan.name}).`,
  });
  if (invoiceErr) throw invoiceErr;

  const { error: activateErr } = await service
    .from('tenants')
    .update({
      subscription_status: 'active',
      subscription_plan_id: planId,
      subscription_interval: interval,
      current_period_start: period.start.toISOString(),
      current_period_end: period.end.toISOString(),
    })
    .eq('id', tenantId);
  if (activateErr) throw activateErr;

  revalidatePath('/platform');
  revalidatePath('/platform/invoices');
  revalidatePath('/platform/tenants');
  revalidatePath(`/platform/tenants/${tenantId}`);
}
