'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePlatformAdmin } from '@/lib/platform/require-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { computeNextBillingPeriod, computePlanPriceCents } from '@/lib/platform/billing';
import { activateTenantSubscription } from '@/lib/platform/activate-tenant';

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
 *
 * Sprint 138 · Warum zuerst nach einer offenen Rechnung gesucht wird:
 *
 * Der Kunde kann sich unter Einstellungen→Abo selbst eine Rechnung
 * ausstellen lassen; erst dann sieht er IBAN und Verwendungszweck, kann also
 * ueberhaupt zahlen. Diese Rechnung steht auf "offen" und traegt die
 * Nummer, die auf seinem Ueberweisungstraeger steht.
 *
 * Wuerde hier bedingungslos eine zweite Rechnung angelegt, blieben beide
 * stehen: der Kunde saehe unter Einstellungen→Abo weiterhin "Offene
 * Rechnung — bitte ueberweisen", obwohl er laengst bezahlt hat und
 * freigeschaltet ist, in /platform/payments haengt ein Zahlungseingang, den
 * es nicht gibt, und /platform/invoices zaehlt den Betrag doppelt. Ein
 * Zahlungseingang, eine Rechnung.
 *
 * Passt die offene Rechnung zur Auswahl des Betreibers, wird sie bezahlt
 * gebucht — mit IHREM Zeitraum, denn das ist der Zeitraum, fuer den der
 * Kunde bezahlt hat. Weicht die Auswahl ab (der Kunde liess sich Starter
 * ausstellen, ueberwies aber Business), gewinnt der Betreiber: er hat den
 * Kontoauszug vor sich. Die alte Rechnung wird dann storniert statt
 * liegengelassen, mit Begruendung in `notes`.
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

  const paidAt = new Date();

  const { data: openInvoices, error: openErr } = await platform
    .from('invoices')
    .select('id, invoice_number, plan_id, plan_interval, period_start, period_end')
    .eq('tenant_id', tenantId)
    .eq('status', 'open')
    .order('issued_at', { ascending: false });
  if (openErr) throw openErr;

  const settle = (openInvoices ?? []).find(
    (i) => i.plan_id === planId && i.plan_interval === interval,
  );
  const stale = (openInvoices ?? []).filter((i) => i.id !== settle?.id);

  let periodStart: string;
  let periodEnd: string;

  if (settle) {
    periodStart = settle.period_start;
    periodEnd = settle.period_end;
    const { error: settleErr } = await platform
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: paidAt.toISOString(),
        payment_reference: paymentReference ?? null,
      })
      .eq('id', settle.id);
    if (settleErr) throw settleErr;
  } else {
    const priceCents = computePlanPriceCents(
      plan.monthly_price_cents,
      plan.yearly_price_cents,
      interval,
    );
    const anchor = tenant.current_period_end ?? tenant.trial_ends_at;
    const period = computeNextBillingPeriod(interval, anchor ? new Date(anchor) : null);
    periodStart = period.start.toISOString();
    periodEnd = period.end.toISOString();

    const { error: invoiceErr } = await platform.from('invoices').insert({
      tenant_id: tenantId,
      plan_id: planId,
      plan_interval: interval,
      period_start: periodStart,
      period_end: periodEnd,
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
  }

  // Was jetzt noch offen steht, gehoert zu einem Tarif, den der Betreiber
  // gerade NICHT freigeschaltet hat. Stehenlassen hiesse: der Kunde wird
  // weiter zur Zahlung aufgefordert, obwohl er bezahlt hat.
  if (stale.length > 0) {
    const { error: cancelErr } = await platform
      .from('invoices')
      .update({
        status: 'canceled',
        notes: `Storniert bei der Freischaltung auf ${plan.name} (${interval === 'yearly' ? 'jährlich' : 'monatlich'}) am ${paidAt.toISOString().slice(0, 10)}.`,
      })
      .in(
        'id',
        stale.map((i) => i.id),
      );
    if (cancelErr) throw cancelErr;
  }

  await activateTenantSubscription({ tenantId, planId, interval, periodStart, periodEnd });

  revalidatePath('/platform');
  revalidatePath('/platform/payments');
  revalidatePath('/platform/invoices');
  revalidatePath('/platform/tenants');
  revalidatePath(`/platform/tenants/${tenantId}`);
}
