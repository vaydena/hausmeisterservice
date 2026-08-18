import { NextResponse } from 'next/server';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { loadOwnerInvoiceData } from '@/lib/owner-portal/billing';
import { renderBillingPdf } from '@/lib/pdf/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Owner-scoped Rechnungs-PDF. Kein moduleGate — Berechtigung über
 * getOwnerContext + invoices_select_owner (in loadOwnerInvoiceData). Gibt 404
 * zurück, wenn die Rechnung dem Eigentümer nicht gehört (oder nicht existiert).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOwnerContext();
  if (!ctx) return textResponse('Nicht angemeldet.', 401);

  const { id } = await params;
  const data = await loadOwnerInvoiceData(id, ctx.tenantId);
  if (!data) return textResponse('Rechnung nicht gefunden.', 404);

  const buffer = await renderBillingPdf(data);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Rechnung-${data.code.replace(/[^\w.-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function textResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}
