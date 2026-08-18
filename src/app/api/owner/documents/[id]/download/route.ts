import { NextResponse } from 'next/server';
import { getOwnerContext } from '@/lib/owner-portal/current';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { DOC_BUCKET } from '@/lib/schemas/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Owner-scoped Dokument-Download. Kein moduleGate — Berechtigung über
 * getOwnerContext + documents_select_owner (nur objektgebundene Dokumente
 * eigener Objekte). Signed-URL mit download-Disposition erzeugt der
 * Service-Client, nachdem der Owner-RLS-Read den Zugriff bewiesen hat.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOwnerContext();
  if (!ctx) return textResponse('Nicht angemeldet.', 401);

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const doc = unwrapMaybeRow(
    await supabase
      .from('documents')
      .select('storage_path, original_filename')
      .eq('id', id)
      .maybeSingle(),
    'Eigentümerportal: Dokument-Download',
  );
  if (!doc) return textResponse('Nicht gefunden.', 404);

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, { download: doc.original_filename });
  if (error || !data) return textResponse('Datei nicht verfügbar.', 502);

  return NextResponse.redirect(data.signedUrl, 307);
}

function textResponse(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}
