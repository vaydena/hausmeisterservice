import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Liefert die session_id der aktuellen Server-Session, oder null wenn kein
 * User eingeloggt ist / der Access-Token die Claim nicht enthaelt.
 *
 * Sprint 31: Wir brauchen die aktuelle session_id, um in der Sessions-Liste
 * die eigene Zeile mit "Aktuelle Sitzung"-Badge zu markieren und den Revoke-
 * Button dafuer zu unterdruecken. Supabase Auth v2 legt die Claim in den
 * Access-Token JWT — es gibt keine dedizierte SDK-Function dafuer, wir
 * dekodieren das Payload manuell (kein Signatur-Check noetig, wir vertrauen
 * dem eigenen Auth-Provider, der die Cookies schon serverseitig validiert
 * hat).
 */
export async function getCurrentSessionId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64url = parts[1]!;
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const payload = JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8')) as {
      session_id?: unknown;
    };
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}
