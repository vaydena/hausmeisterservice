import { NextResponse } from 'next/server';
import { pdf } from '@react-pdf/renderer';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { getBankDetails } from '@/lib/platform/bank-transfer';
import { PlatformInvoiceDocument, type PlatformInvoiceData } from '@/lib/pdf/PlatformInvoiceDocument';
import { createPlatformServiceClient } from '@/lib/supabase/platform';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const service = createSupabaseServiceClient();
  const { data: invoice, error: iErr } = await createPlatformServiceClient()
    .from('invoices')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (iErr || !invoice) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Access: Platform-Admin oder Tenant-Owner der zugehörigen Agentur
  const { data: adminRow } = await createPlatformServiceClient()
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  let allowed = !!adminRow;
  if (!allowed) {
    const { data: ownership } = await service
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', invoice.tenant_id)
      .eq('is_owner', true)
      .eq('status', 'active')
      .maybeSingle();
    allowed = !!ownership;
  }
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: tenant } = await service
    .from('tenants')
    .select('name, address')
    .eq('id', invoice.tenant_id)
    .maybeSingle();
  const { data: plan } = await createPlatformServiceClient()
    .from('subscription_plans')
    .select('name')
    .eq('id', invoice.plan_id)
    .maybeSingle();

  const addressStr = formatAddress(invoice.billing_address ?? tenant?.address);

  const data: PlatformInvoiceData = {
    invoiceNumber: invoice.invoice_number,
    issuedAt: invoice.issued_at,
    dueAt: invoice.due_at,
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end,
    planName: plan?.name ?? 'Abo',
    planInterval: invoice.plan_interval as 'monthly' | 'yearly',
    subtotalCents: invoice.subtotal_cents,
    totalCents: invoice.total_cents,
    currency: invoice.currency,
    paymentMethod: invoice.payment_method as 'bank_transfer' | 'stripe',
    paidAt: invoice.paid_at,
    paymentReference: invoice.payment_reference,
    billTo: {
      name: tenant?.name ?? '—',
      address: addressStr,
    },
    bank: invoice.payment_method === 'bank_transfer' ? getBankDetails() : null,
  };

  const buffer = await pdf(<PlatformInvoiceDocument data={data} />).toBuffer();
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}

function formatAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof a.street === 'string') lines.push(a.street);
  const zip = typeof a.zip === 'string' ? a.zip : '';
  const city = typeof a.city === 'string' ? a.city : '';
  const zipCity = `${zip} ${city}`.trim();
  if (zipCity) lines.push(zipCity);
  return lines.join('\n') || null;
}
