import 'server-only';
import { createPlatformServiceClient } from '@/lib/supabase/platform';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { activateTenantSubscription } from '@/lib/platform/activate-tenant';
import { capturePaypalOrder, isPaypalConfigured } from '@/lib/platform/paypal';

export type FinalizePaypalResult =
  | { ok: true; redirectPath: string }
  | { ok: false; error: string };

/**
 * Schließt eine PayPal-Zahlung ab: captured die Order, markiert die Rechnung
 * als bezahlt und schaltet das Abo frei.
 *
 * Bewusst `server-only` und KEINE Server-Action: die `tenantId` kommt vom
 * Aufrufer (der Return-Route, nach `requireTenantContext()`), nicht aus der
 * Anfrage. Die Rechnung wird über paypal_order_id UND tenant_id gesucht — ein
 * fremder Mandant kann also keine fremde Zahlung abschließen. Als
 * client-aufrufbare Action wäre die tenantId nicht vertrauenswürdig.
 */
export async function finalizePaypalPayment(params: {
  orderId: string;
  tenantId: string;
}): Promise<FinalizePaypalResult> {
  if (!isPaypalConfigured()) return { ok: false, error: 'PayPal ist nicht konfiguriert.' };

  const platform = createPlatformServiceClient();
  const invoice = unwrapMaybeRow(
    await platform
      .from('invoices')
      .select('id, tenant_id, plan_id, plan_interval, period_start, period_end, paid_at, status')
      .eq('paypal_order_id', params.orderId)
      .eq('tenant_id', params.tenantId)
      .maybeSingle(),
    'PayPal: Rechnung zur Order',
  );

  if (!invoice) {
    return { ok: false, error: 'Zu dieser Zahlung wurde keine Rechnung gefunden.' };
  }
  if (invoice.paid_at || invoice.status === 'paid') {
    return { ok: true, redirectPath: '/settings/subscription?paypal=bereits-bezahlt' };
  }

  try {
    const capture = await capturePaypalOrder(params.orderId);

    await platform
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paypal_capture_id: capture.captureId,
        payment_reference: `PayPal ${capture.captureId}`,
      })
      .eq('id', invoice.id);

    await activateTenantSubscription({
      tenantId: invoice.tenant_id,
      planId: invoice.plan_id,
      interval: invoice.plan_interval,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
    });

    return { ok: true, redirectPath: '/settings/subscription?paypal=erfolgreich' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler.';
    return { ok: false, error: message };
  }
}
