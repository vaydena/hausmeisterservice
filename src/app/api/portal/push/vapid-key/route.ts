import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sprint 43 · Portal-Variante der VAPID-Key-Route. Bewusst public wie
// die Staff-Route /api/push/vapid-key: Der Public-Key ist per Definition
// nicht geheim, ausserdem koennen anonyme Requests damit ohnehin nichts
// anfangen (subscribe ist auth-gated). Duplikat statt Shared-Route, weil
// der Portal-Proxy /api/portal/* separat freischalten soll.
export function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  if (!publicKey) {
    return NextResponse.json({ error: 'push_not_configured' }, { status: 503 });
  }
  return NextResponse.json({ public_key: publicKey });
}
