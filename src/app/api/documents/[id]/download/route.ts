import { NextResponse } from 'next/server';
import { moduleGate } from '@/lib/modules/api-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { unwrapMaybeRow } from '@/lib/supabase/unwrap';
import { DOC_BUCKET } from '@/lib/schemas/documents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Sprint 120: Download eines Dokuments ueber seine ID.
 *
 * Die zentrale Liste unter `/documents` zeigt bis zu 50 Zeilen. Signierte
 * URLs schon beim Rendern zu erzeugen — so macht es `DocumentList` auf den
 * Detailseiten — waeren dort 50 Storage-Aufrufe pro Seitenaufbau, fuer Links,
 * von denen der Nutzer meist keinen anklickt. Die Signatur entsteht deshalb
 * erst beim Klick.
 *
 * Der Umweg ueber die ID statt ueber den storage_path ist der eigentliche
 * Punkt: `documents` hat zwei SELECT-Policies, eine davon prueft
 * `documents.view` im Property-Scope. Wer den Pfad direkt signieren liesse,
 * haette nur noch die Storage-RLS — und die kennt bloss die Mandantengrenze,
 * nicht die Objektberechtigung. Findet die Query keine Zeile, ist beides
 * moeglich (gibt es nicht / darf man nicht sehen); beide Faelle beantworten
 * wir gleich, sonst wird die Antwort zum Existenznachweis.
 *
 * Kurze TTL: die signierte URL wandert in die Adresszeile und damit in den
 * Verlauf. 60 Sekunden reichen fuer den Redirect, den der Browser sofort
 * ausfuehrt.
 */
const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await moduleGate('documents');
  if (blocked) return blocked;

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const doc = unwrapMaybeRow(
    await supabase
      .from('documents')
      .select('storage_path, original_filename')
      .eq('id', id)
      .maybeSingle(),
    'Dokument-Download',
  );
  if (!doc) return textResponse('Nicht gefunden.', 404);

  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, {
      download: doc.original_filename,
    });
  if (error || !data) return textResponse('Datei nicht verfügbar.', 502);

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
