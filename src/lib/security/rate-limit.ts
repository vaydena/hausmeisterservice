import 'server-only';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { AUTH_RATE_LIMITS, type AuthEndpoint } from './rate-limit-config';

export { AUTH_RATE_LIMITS, formatRateLimitError } from './rate-limit-config';
export type { AuthEndpoint } from './rate-limit-config';

/**
 * Prueft und verbraucht einen Rate-Limit-Slot fuer (identifier, endpoint).
 *
 * Delegiert an die SECURITY DEFINER-Function
 * `public.check_and_consume_auth_rate_limit` (siehe
 * `supabase/migrations/20260813150000_auth_rate_limits.sql`). Die
 * atomarizitaetskritische Logik (Sliding-Window, Row-Lock) sitzt bewusst
 * in Postgres, nicht hier — dieser Wrapper ist dumm und dient nur der
 * TS-Typisierung + zentraler Config-Verwaltung.
 *
 * @returns { allowed: true } | { allowed: false, retryAfterSec: number }
 */
export async function checkAuthRateLimit(
  identifier: string,
  endpoint: AuthEndpoint,
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const config = AUTH_RATE_LIMITS[endpoint];
  const service = createSupabaseServiceClient();
  const { data, error } = await service.rpc('check_and_consume_auth_rate_limit', {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_limit: config.limit,
    p_window_sec: config.windowSec,
    p_block_sec: config.blockSec,
  });

  // Fail-open bei DB-Fehler: der Rate-Limit-Check darf keinen legitimen
  // Login blockieren, wenn die Rate-Limit-Tabelle nicht erreichbar ist.
  // Im Log erscheint der Fehler, damit man ihn bemerkt.
  if (error) {
    console.error('[rate-limit] check_and_consume_auth_rate_limit failed', {
      identifier,
      endpoint,
      error: error.message,
    });
    return { allowed: true };
  }

  const row = data?.[0];
  if (!row) {
    console.error('[rate-limit] check_and_consume_auth_rate_limit returned no row', {
      identifier,
      endpoint,
    });
    return { allowed: true };
  }

  if (row.allowed) {
    return { allowed: true };
  }

  return { allowed: false, retryAfterSec: row.retry_after_sec };
}

/**
 * Loescht den Rate-Limit-Zaehler fuer (identifier, endpoint). Nach
 * erfolgreichem Login aufrufen, damit vergangene Fehlversuche den
 * Zugang nicht mehr blockieren.
 *
 * NICHT bei signup/reset-password aufrufen — dort schuetzt der Zaehler
 * gegen E-Mail-Enumeration, unabhaengig davon ob der einzelne Versuch
 * erfolgreich war.
 */
export async function resetAuthRateLimit(
  identifier: string,
  endpoint: Extract<AuthEndpoint, 'login' | 'portal-login' | 'owner-login'>,
): Promise<void> {
  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('reset_auth_rate_limit', {
    p_identifier: identifier,
    p_endpoint: endpoint,
  });
  if (error) {
    // Nicht kritisch — der Zaehler wird spaetestens durch das Window-Reset
    // (nach windowSec Sekunden) frei. Nur loggen.
    console.error('[rate-limit] reset_auth_rate_limit failed', {
      identifier,
      endpoint,
      error: error.message,
    });
  }
}
