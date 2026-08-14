// Kein 'server-only': UserSession-Typ wird vom Client-Component
// sessions-list.tsx importiert. parseUserSessions ist pure JSON-Logik
// ohne DB-Zugriff und darf theoretisch auch im Client laufen (Aufrufer
// ist aktuell aber ausschliesslich page.tsx → Server-Component).
import type { Json } from '@/types/database';

/**
 * Sprint 31: Kanonische Form einer aktiven User-Session, wie sie die UI
 * und die Server-Action revokeSessionAction verarbeiten. Sie ist der
 * TypeScript-Spiegel der json_build_object-Struktur in der Postgres-
 * Function list_user_sessions.
 *
 * Alle Felder sind read-only vom TS-Layer aus: das Loeschen einer Session
 * geht ausschliesslich ueber revoke_user_session. Absicht: die Konto-UI
 * bleibt der einzige Ort, an dem der User seine Sessions verwaltet.
 */
export interface UserSession {
  id: string;
  createdAt: string;
  updatedAt: string | null;
  refreshedAt: string | null;
  notAfter: string | null;
  userAgent: string | null;
  ip: string | null;
  aal: 'aal1' | 'aal2' | string;
  factorId: string | null;
}

interface RawUserSession {
  id: unknown;
  created_at: unknown;
  updated_at: unknown;
  refreshed_at: unknown;
  not_after: unknown;
  user_agent: unknown;
  ip: unknown;
  aal: unknown;
  factor_id: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * Parst das JSON-Payload von list_user_sessions in typisierte Rows. Wirft
 * NICHT bei unerwarteten Feldern — statt dessen fallback auf null; die
 * UI darf mit einer teilweisen Zeile umgehen, damit ein Supabase-Auth-
 * Schema-Aenderung nicht die ganze Konto-Seite crasht.
 */
export function parseUserSessions(data: Json | null | undefined): UserSession[] {
  if (!Array.isArray(data)) return [];
  const out: UserSession[] = [];
  for (const row of data as unknown[]) {
    if (!row || typeof row !== 'object') continue;
    const r = row as RawUserSession;
    const id = asString(r.id);
    const createdAt = asString(r.created_at);
    if (!id || !createdAt) continue;
    out.push({
      id,
      createdAt,
      updatedAt: asString(r.updated_at),
      refreshedAt: asString(r.refreshed_at),
      notAfter: asString(r.not_after),
      userAgent: asString(r.user_agent),
      ip: asString(r.ip),
      aal: asString(r.aal) ?? 'aal1',
      factorId: asString(r.factor_id),
    });
  }
  return out;
}
