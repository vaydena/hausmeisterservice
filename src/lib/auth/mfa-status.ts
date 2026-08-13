import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * true, wenn der aktuell eingeloggte User mindestens einen verifizierten
 * TOTP-Faktor hat. Unverified-Faktoren (Ueberbleibsel abgebrochener Enroll-
 * Flows) zaehlen bewusst nicht — sie geben dem Konto keinen aktiven MFA-
 * Schutz. Fuer UX-Nudges wie den MFA-Empfehlungs-Banner ist diese Frage
 * das richtige Kriterium: "hat der User echten Schutz oder nicht?".
 *
 * Nutzt die aal1/aal2-Session des Users selbst — kein service_role noetig,
 * listFactors ist per RLS auf den eigenen User gescopt.
 */
export async function hasVerifiedMfaFactor(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data } = await supabase.auth.mfa.listFactors();
  if (!data) return false;
  const factors = data.totp ?? [];
  return factors.some((f) => f.status === 'verified');
}
