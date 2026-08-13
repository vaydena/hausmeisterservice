import 'server-only';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Erzwingt eine aal2-Session (per TOTP verifiziert), FALLS der aktuelle
 * User ueberhaupt einen MFA-Faktor registriert hat. Ohne registrierten
 * Faktor (nextLevel != 'aal2') ist der User nicht in Reichweite dieser
 * Anforderung — die Funktion tut in dem Fall nichts und laesst den
 * Aufrufer weiterlaufen.
 *
 * Sprint 27: Sensitive Konto-Actions (MFA-Faktor entfernen, Recovery-Codes
 * neu generieren, andere Sitzungen abmelden, Passwort aendern) sollen nicht
 * allein mit einer aal1-Session ausfuehrbar sein — ein Angreifer, der ein
 * Session-Cookie erbeutet hat, koennte sich sonst dauerhaft im Konto ein-
 * nisten (MFA raus, Recovery-Codes fuer spaeter speichern, andere Sessions
 * killen). Dieser Guard hebt jede solche Action auf das gleiche Sicher-
 * heits-Niveau wie den Login-Prompt.
 *
 * Verhalten:
 *   - aal2 vorhanden -> return (Aktion darf weiterlaufen)
 *   - Kein MFA-Faktor -> return (User hat sich bewusst gegen MFA entschieden,
 *     wir zwingen ihn nicht durch einen Prompt, den er nicht bestehen kann)
 *   - aal1, aber MFA aktiv -> redirect nach /login/mfa?next=<pfad>
 *
 * `nextPath` sollte auf die Seite verweisen, auf der der User die Action
 * ausgeloest hat (typischerweise '/settings/account'), damit er nach
 * dem TOTP-Prompt wieder dort landet und die Action erneut anstossen kann.
 */
export async function requireAal2WhenEnrolled(
  supabase: SupabaseClient<Database>,
  nextPath: string,
): Promise<void> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal) return;
  // currentLevel === 'aal2' passt bereits, currentLevel === 'aal1' ohne
  // registrierten Faktor (nextLevel !== 'aal2') ebenfalls — nur der
  // aal1+enrolled Fall loest den Redirect aus.
  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    redirect(`/login/mfa?next=${encodeURIComponent(nextPath)}`);
  }
}
