import { NextResponse } from 'next/server';
import {
  buildDeepLink,
  generateQrSvg,
  isValidQrType,
  isValidUuid,
} from '@/lib/qr/generate';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  if (!isValidQrType(type)) {
    return new NextResponse('Unbekannter Entity-Typ.', { status: 400 });
  }
  if (!isValidUuid(id)) {
    return new NextResponse('Ungültige ID.', { status: 400 });
  }

  const url = buildDeepLink(type, id);
  const svg = await generateQrSvg(url);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, immutable',
    },
  });
}
