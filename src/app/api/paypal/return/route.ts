import { NextResponse, type NextRequest } from 'next/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { finalizePaypalPayment } from '@/lib/platform/paypal-finalize';

/**
 * Rückkehr-Ziel nach der PayPal-Freigabe. PayPal hängt die Order-ID als
 * `?token=` an (PayPal-Konvention). Diese Route ist KEIN PayPal-Webhook,
 * sondern der Browser-Redirect: Die Echtheit sichert die eingeloggte
 * Owner-Session (requireTenantContext) + der tenant_id-Abgleich in
 * finalizePaypalPayment, nicht eine Signatur. Danach zurück auf die Abo-Seite
 * mit Status-Query.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const fail = (meldung?: string) => {
    const url = new URL('/settings/subscription', origin);
    url.searchParams.set('paypal', 'fehler');
    if (meldung) url.searchParams.set('meldung', meldung);
    return NextResponse.redirect(url);
  };

  // Auth-Gate: nur der eingeloggte Inhaber darf eine Zahlung abschließen. Die
  // tenant_id stammt aus der Session, nicht aus der Anfrage.
  const ctx = await requireTenantContext();
  if (!ctx.isOwner) return fail();

  const orderId = request.nextUrl.searchParams.get('token');
  if (!orderId) return fail();

  const result = await finalizePaypalPayment({ orderId, tenantId: ctx.tenantId });
  if (!result.ok) return fail(result.error);

  return NextResponse.redirect(new URL(result.redirectPath, origin));
}
