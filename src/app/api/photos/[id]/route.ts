import { NextResponse } from 'next/server';
import { moduleGate } from '@/lib/modules/api-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { DOC_BUCKET } from '@/lib/schemas/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Bildauslieferung für die Galerie. Wie beim Dokument-Download (Sprint 120)
 * geht der Weg bewusst über die Foto-ID, nicht über den storage_path: `photos`
 * hat zwei SELECT-Policies, eine prüft `photos.view` im Objekt-Scope. Wer den
 * Pfad direkt signieren ließe, hinge nur an der Storage-RLS — und die kennt
 * bloß die Mandantengrenze, nicht das Objektrecht.
 *
 * Anders als beim Download ohne `download`-Option: die signierte URL liefert
 * das Bild inline aus, damit es im <img>-Tag erscheint. Kurze TTL, weil die
 * URL im Bildcache des Browsers landet.
 */
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await moduleGate('photos');
  if (blocked) return blocked;

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const photo = unwrapMaybeRow(
    await supabase.from('photos').select('storage_path').eq('id', id).maybeSingle(),
    'Foto-Auslieferung',
  );
  if (!photo) return textResponse('Nicht gefunden.', 404);

  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(photo.storage_path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return textResponse('Bild nicht verfügbar.', 502);

  return NextResponse.redirect(data.signedUrl, 307);
}

function textResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
