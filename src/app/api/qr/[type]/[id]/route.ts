import { NextResponse } from 'next/server';
import { moduleGate } from '@/lib/modules/api-guard';
import {
  buildDeepLink,
  generateQrSvg,
  isValidQrType,
  isValidUuid,
} from '@/lib/qr/generate';

export const runtime = 'nodejs';
// Sprint 118: Das Modul-Gate liest den Mandanten aus der Session — die Route
// darf nicht statisch vorgerendert werden.
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  // Vor der Parameterpruefung: fuer einen Mandanten ohne QR-Modul gibt es
  // diesen Endpunkt nicht, und dann auch keinen Unterschied zwischen einem
  // gueltigen und einem unsinnigen Entity-Typ.
  const blocked = await moduleGate('qr_codes');
  if (blocked) return blocked;

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
