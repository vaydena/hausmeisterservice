/**
 * Pure Konstanten und Formatierung fuer Auth-Rate-Limits. Bewusst OHNE
 * `server-only` und ohne DB-Client-Import, damit die Config in Tests
 * (Vitest laeuft im Node-Env) und in Client-Rendering-Kontexten (falls
 * jemals noetig) referenziert werden kann. Die tatsaechlichen RPC-Calls
 * sitzen in `./rate-limit.ts` (server-only).
 */

/**
 * Sprint 20: Rate-Limits fuer Auth-Endpoints.
 *
 * Die Werte sind bewusst konservativ:
 *   - login / portal-login: 5 Fehlversuche in 15 Minuten, dann 15 Minuten
 *     gesperrt. Ein legitimer User, der Passwort und Layout korrekt hat,
 *     braucht selten mehr als 2 Versuche; 5 laesst Tippfehler zu, ohne
 *     Brute-Force zu erlauben (max. 20 Passwortversuche/Stunde bei 1
 *     Sperre alle 15 min).
 *   - signup / reset-password: 3 Aktionen pro Stunde. Beide Endpoints sind
 *     E-Mail-Enumeration-Vektoren (Signup revealed "E-Mail schon vergeben"
 *     zumindest indirekt, Reset schickt Mail nur an bestehende Konten).
 *     Bei 3/Stunde kann ein Angreifer maximal 72 E-Mails/Tag durchprobieren
 *     — praktisch unbrauchbar fuer Enumeration.
 *   - password-change: 5 Fehlversuche in 15 Minuten, 15 Minuten Sperre.
 *     Sprint 22: Passwort-Aenderung im Konto-Bereich verlangt Re-Auth mit
 *     dem aktuellen Passwort. Zaehler ist auf die E-Mail des eingeloggten
 *     Users bezogen, damit ein Angreifer mit gestohlener Session nicht per
 *     Brute-Force das aktuelle Passwort erraten kann (was ihn dann in die
 *     Lage versetzen wuerde, es zu aendern und den Account zu uebernehmen).
 *     KEIN Reset auf Erfolg — die 15 Minuten Sperre nach 5 Fehlversuchen
 *     bleiben Sicherheitsnetz auch bei einer legitimen Aenderung.
 *   - mfa-verify: 5 Fehlversuche in 15 Minuten, 15 Minuten Sperre.
 *     Sprint 25: Verify-Schritt beim Login mit TOTP-Faktor. TOTP-Codes
 *     sind 6-stellig => 10^6 Kombinationen; bei 5/15min braucht ein
 *     Brute-Force im Erwartungswert 250 Jahre pro Faktor. Zaehler ist
 *     per User (Faktor-Owner), damit die 5-Fehlversuche-Grenze nicht
 *     durch mehrere IPs parallel umgangen werden kann. KEIN Reset auf
 *     Erfolg — das rotierende 30-Sekunden-Fenster von TOTP haelt den
 *     naechsten legitimen Code sowieso frei; der Rate-Limit-Zaehler
 *     laeuft ueber `windowSec` von selbst aus.
 *   - mfa-recovery: 5 Fehlversuche in 15 Minuten, 15 Minuten Sperre.
 *     Sprint 26: Recovery-Code-Einloesen beim Login. Codes sind 10 chars
 *     aus Base32-Alphabet (32^10 ~= 1.1e15 Moeglichkeiten). Rate-Limit
 *     ist per User + IP-basiert im Login-Kontext (User-ID kennen wir
 *     erst nach Passwort-Login, IP schon vorher — sicherheitshalber
 *     beides). KEIN Reset auf Erfolg — verwendete Codes sind sowieso
 *     verbrannt, Rate-Limit-Zaehler laeuft von selbst aus.
 *   - email-change: 3 Aktionen pro Stunde. Sprint 30: E-Mail-Aenderung
 *     im Konto-Bereich versendet eine Confirm-Mail an die NEUE Adresse
 *     (und, wenn "Secure email change" aktiv, auch an die alte). Ohne
 *     Rate-Limit koennte ein Angreifer mit gestohlener Session in kurzer
 *     Zeit viele Wechsel-Mails triggern, was den User mit Bestaetigungs-
 *     Mails ueberschwemmt und ihm die legitime Aktivitaet verdeckt.
 *     Zaehler ist auf die AKTUELLE E-Mail des eingeloggten Users bezogen
 *     (nicht auf die neue — die kann bei jedem Versuch anders sein).
 *     KEIN Reset auf Erfolg — die 3/Stunde sind hart, auch nach einem
 *     bestaetigten Wechsel.
 *
 * Zaehler wird bei erfolgreichem Login/Portal-Login geloescht (siehe
 * `resetAuthRateLimit` in ./rate-limit.ts), damit ein legitimes Passwort
 * das Rate-Limit befreit. Fuer Signup/Reset-Password/Password-Change/
 * MFA-Verify/MFA-Recovery/Email-Change KEIN Reset auf Erfolg — sonst
 * waere die E-Mail-Enumeration- bzw. die Session-Hijack-Schutzwirkung weg.
 */
export const AUTH_RATE_LIMITS = {
  login: { limit: 5, windowSec: 900, blockSec: 900 },
  'portal-login': { limit: 5, windowSec: 900, blockSec: 900 },
  signup: { limit: 3, windowSec: 3600, blockSec: 3600 },
  'reset-password': { limit: 3, windowSec: 3600, blockSec: 3600 },
  'password-change': { limit: 5, windowSec: 900, blockSec: 900 },
  'mfa-verify': { limit: 5, windowSec: 900, blockSec: 900 },
  'mfa-recovery': { limit: 5, windowSec: 900, blockSec: 900 },
  'email-change': { limit: 3, windowSec: 3600, blockSec: 3600 },
} as const;

export type AuthEndpoint = keyof typeof AUTH_RATE_LIMITS;

/**
 * Formatiert die Retry-After-Sekunden als benutzerfreundliche deutsche
 * Fehlermeldung. Rundet auf Minuten (aber min. 1 Minute), damit der
 * Text nicht "Bitte in 903 Sekunden erneut versuchen" heisst.
 */
export function formatRateLimitError(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Zu viele Versuche. Bitte in ${minutes} Minute${minutes === 1 ? '' : 'n'} erneut versuchen.`;
}
