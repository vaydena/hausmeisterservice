import { NextResponse } from 'next/server';
import { moduleGate } from '@/lib/modules/api-guard';
import { loadBillingDocumentData } from '@/lib/pdf/loader';
import { renderBillingPdf } from '@/lib/pdf/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await moduleGate('billing');
  if (blocked) return blocked;

  const { id } = await params;

  const data = await loadBillingDocumentData('offer', id);
  if (!data) {
    return new NextResponse('Angebot nicht gefunden.', { status: 404 });
  }

  const buffer = await renderBillingPdf(data);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Angebot-${data.code}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
