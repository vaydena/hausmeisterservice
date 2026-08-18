import { NextResponse } from 'next/server';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { DOC_BUCKET } from '@/lib/schemas/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Owner-scoped Foto-Auslieferung. Kein moduleGate — die Berechtigung kommt aus
 * getOwnerContext + photos_select_owner: der Owner-RLS-Read liefert die Zeile
 * nur, wenn das Foto zu einem Objekt des Eigentümers gehört. Die kurzlebige
 * Signed-URL erzeugt danach der Service-Client (Storage-RLS ist mandantsmember-
 * gebunden und würde den externen Eigentümer sonst abweisen).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOwnerContext();
  if (!ctx) return textResponse('Nicht angemeldet.', 401);

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const photo = unwrapMaybeRow(
    await supabase.from('photos').select('storage_path').eq('id', id).maybeSingle(),
    'Eigentümerportal: Foto-Auslieferung',
  );
  if (!photo) return textResponse('Nicht gefunden.', 404);

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.storage
    .from(DOC_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return textResponse('Bild nicht verfügbar.', 502);

  return NextResponse.redirect(data.signedUrl, 307);
}

function textResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}
