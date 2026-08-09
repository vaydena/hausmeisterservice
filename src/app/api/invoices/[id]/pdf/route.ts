import { NextResponse } from 'next/server';
import { loadBillingDocumentData } from '@/lib/pdf/loader';
import { renderBillingPdf } from '@/lib/pdf/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const data = await loadBillingDocumentData('invoice', id);
  if (!data) {
    return new NextResponse('Rechnung nicht gefunden.', { status: 404 });
  }

  const buffer = await renderBillingPdf(data);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Rechnung-${data.code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
