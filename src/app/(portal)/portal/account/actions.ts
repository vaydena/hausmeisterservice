'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireResidentContext } from '@/lib/portal/current';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { changePasswordSchema } from '@/lib/auth/change-password-schema';
import { changeEmailSchema } from '@/lib/auth/change-email-schema';
import { revokeSessionSchema } from '@/lib/auth/revoke-session-schema';
import { clientEnv } from '@/lib/env';
import { getCurrentSessionId } from '@/lib/auth/current-session-id';
import {
  mfaEnrollSchema,
  mfaUnenrollSchema,
  mfaVerifySchema,
} from '@/lib/auth/mfa-verify-schema';
import { requireAal2WhenEnrolled } from '@/lib/auth/require-aal2';
import { generateRecoveryCodePlaintexts } from '@/lib/auth/mfa-recovery';

export type PortalAccountActionState = { error?: string; success?: string };

/**
 * Ergebnis von generatePortalMfaRecoveryCodesAction. Bei Erfolg enthaelt
 * `codes` die 10 frisch generierten Klartext-Codes; sie werden dem Resident
 * EIN MAL angezeigt und sind danach nur noch als bcrypt-Hash in der DB.
 */
export type PortalRecoveryCodesState = PortalAccountActionState & {
  codes?: string[];
};

/**
 * Sprint 38: Portal-E-Mail-Aenderung. Semantisch identisch zur Staff-
 * Action (changeEmailAction, Sprint 30): Supabase versendet eine
 * Bestaetigungs-Mail an die NEUE Adresse; bei aktivem "Secure email
 * change" (Default) zusaetzlich eine an die alte. Der Wechsel wird
 * erst nach Klick auf beide Confirm-Links wirksam — bis dahin bleibt
 * die aktuelle Adresse als Login gueltig.
 *
 * Sicherheitsmaßnahmen (deckungsgleich zu Sprint 30):
 *   - aal2 verlangt, wenn Resident MFA hat (E-Mail-Wechsel ist bei aal1-
 *     Session sonst Account-Takeover-Vektor via anschliessendem Passwort-
 *     Reset).
 *   - Rate-Limit 3/Stunde auf aktuelle E-Mail (verhindert Mail-Bombing
 *     der neuen Adresse). Wir teilen bewusst den 'email-change'-Bucket
 *     mit Staff — identifier ist die E-Mail, endpoint-Typ egal.
 *   - Redirect nach Klick geht via /auth/callback → /portal/account
 *     ?info=email-changed.
 */
export async function changePortalEmailAction(
  _prev: PortalAccountActionState,
  formData: FormData,
): Promise<PortalAccountActionState> {
  const ctx = await requireResidentContext();
  if (!ctx.email) {
    return {
      error:
        'Fuer dieses Konto ist keine E-Mail hinterlegt. Bitte Hausverwaltung kontaktieren.',
    };
  }

  const supabase = await createSupabaseServerClient();
  await requireAal2WhenEnrolled(supabase, '/portal/account');

  const rl = await checkAuthRateLimit(ctx.email, 'email-change');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = changeEmailSchema.safeParse({
    newEmail: formData.get('newEmail'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  if (parsed.data.newEmail === ctx.email.toLowerCase()) {
    return { error: 'Die neue E-Mail-Adresse ist mit der aktuellen identisch.' };
  }

  const redirectUrl = new URL('/auth/callback', clientEnv.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set('next', '/portal/account?info=email-changed');

  const { error } = await supabase.auth.updateUser(
    { email: parsed.data.newEmail },
    { emailRedirectTo: redirectUrl.toString() },
  );
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return { error: 'Diese E-Mail-Adresse ist bereits vergeben.' };
    }
    if (msg.includes('rate') || msg.includes('too many')) {
      return {
        error:
          'Zu viele Anfragen an den Mail-Provider. Bitte in ein paar Minuten erneut versuchen.',
      };
    }
    return { error: 'E-Mail-Adresse konnte nicht geaendert werden. Bitte spaeter erneut.' };
  }

  return {
    success:
      'Bestaetigungs-Mail an die neue Adresse gesendet. Falls "Secure email change" aktiv ist, muessen Sie zusaetzlich den Link in der Mail an Ihre bisherige Adresse anklicken. Die Aenderung wird erst nach Bestaetigung wirksam.',
  };
}

/**
 * Sprint 33: Portal-Passwort-Aenderung. Semantisch identisch zur Staff-
 * Action (changePasswordAction): Re-Auth mit aktuellem Passwort,
 * Rate-Limit auf E-Mail-Basis (password-change bucket, 5/15min),
 * aal2-Guard falls MFA aktiv. Der einzige Unterschied ist der Guard:
 * Portal-Residents haben keine Tenant-Membership.
 */
export async function changePortalPasswordAction(
  _prev: PortalAccountActionState,
  formData: FormData,
): Promise<PortalAccountActionState> {
  const ctx = await requireResidentContext();
  if (!ctx.email) {
    return {
      error:
        'Fuer dieses Konto ist keine E-Mail hinterlegt. Bitte Hausverwaltung kontaktieren.',
    };
  }

  const supabase = await createSupabaseServerClient();

  // aal2 verlangen, sobald der User MFA aktiv hat (Sprint 32). Ein
  // Angreifer mit erbeuteter aal1-Session koennte sonst per Passwort-
  // Aenderung dauerhaft in den Account rutschen — Owner wird beim
  // naechsten Login ausgesperrt.
  await requireAal2WhenEnrolled(supabase, '/portal/account');

  const rl = await checkAuthRateLimit(ctx.email, 'password-change');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
    newPasswordConfirm: formData.get('newPasswordConfirm'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  // Re-Auth: aktuelles Passwort verifizieren. Bei Erfolg ueberschreibt
  // Supabase die Session-Cookies mit einer frischen Session (gleicher
  // User) — der Resident bleibt eingeloggt.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: ctx.email,
    password: parsed.data.currentPassword,
  });
  if (reauthError) {
    return { error: 'Das aktuelle Passwort ist nicht korrekt.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: parsed.data.newPassword,
  });
  if (updateError) {
    const msg = updateError.message.toLowerCase();
    if (msg.includes('should be different')) {
      return { error: 'Das neue Passwort muss sich vom aktuellen unterscheiden.' };
    }
    if (msg.includes('weak') || msg.includes('pwned') || msg.includes('leaked')) {
      return {
        error:
          'Dieses Passwort wurde in bekannten Datenlecks gefunden. Bitte waehlen Sie ein anderes.',
      };
    }
    return { error: 'Passwort konnte nicht geaendert werden. Bitte spaeter erneut versuchen.' };
  }

  return { success: 'Passwort erfolgreich geaendert.' };
}

// ============================================================================
// Sessions (Sprint 34)
// ============================================================================
//
// Portal-Variante von signOutOtherSessionsAction/revokeSessionAction. Die
// zugrundeliegenden RPCs (list_user_sessions, revoke_user_session) sind
// user-agnostisch — sie kommen aus Sprint 31 und bekommen p_user_id vom
// Server-Aufrufer. Der einzige Unterschied zu den Staff-Actions ist der
// Guard: requireResidentContext statt requireTenantContext.

export async function signOutOtherPortalSessionsAction(
  _prev: PortalAccountActionState,
  _formData: FormData,
): Promise<PortalAccountActionState> {
  await requireResidentContext();
  const supabase = await createSupabaseServerClient();

  // aal2 verlangen sobald MFA aktiv ist — sonst koennte ein Angreifer mit
  // erbeuteter aal1-Session die legitime aal2-Session des Residents killen.
  await requireAal2WhenEnrolled(supabase, '/portal/account');

  // scope:'others' invalidiert alle Refresh-Tokens des Users AUSSER dem
  // der aktuellen Session — der Resident bleibt hier eingeloggt.
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    return { error: 'Andere Sitzungen konnten nicht abgemeldet werden. Bitte spaeter erneut.' };
  }

  return { success: 'Alle anderen Sitzungen wurden abgemeldet.' };
}

/**
 * Beendet eine einzelne Session des eingeloggten Residents. Ownership-Check
 * laeuft in der SECURITY-DEFINER-Function revoke_user_session ueber
 * (user_id, session_id); die Server-Action passt ausschliesslich
 * ctx.userId + die Zod-validierte sessionId durch.
 *
 * Die aktuelle Session zu beenden wird geblockt — dafuer gibt es das
 * User-Menue oben rechts ("Abmelden").
 */
export async function revokePortalSessionAction(
  _prev: PortalAccountActionState,
  formData: FormData,
): Promise<PortalAccountActionState> {
  const ctx = await requireResidentContext();
  const supabase = await createSupabaseServerClient();

  await requireAal2WhenEnrolled(supabase, '/portal/account');

  const parsed = revokeSessionSchema.safeParse({
    sessionId: formData.get('sessionId'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const currentSessionId = await getCurrentSessionId(supabase);
  if (currentSessionId && currentSessionId === parsed.data.sessionId) {
    return {
      error:
        'Sie koennen Ihre aktuelle Sitzung nicht hier beenden. Nutzen Sie dazu "Abmelden" im Benutzermenue oben rechts.',
    };
  }

  const service = createSupabaseServiceClient();
  const { data: affected, error } = await service.rpc('revoke_user_session', {
    p_user_id: ctx.userId,
    p_session_id: parsed.data.sessionId,
  });
  if (error) {
    return { error: 'Sitzung konnte nicht beendet werden. Bitte spaeter erneut.' };
  }
  if (!affected || affected === 0) {
    return {
      error: 'Diese Sitzung ist bereits abgelaufen oder nicht mehr aktiv.',
    };
  }

  revalidatePath('/portal/account');
  return { success: 'Sitzung beendet.' };
}

/**
 * Sprint 32: Portal-MFA. Parallel zu den Staff-Actions in
 * src/app/(app)/settings/account/actions.ts, aber gegated auf
 * requireResidentContext statt requireTenantContext — Portal-Residents
 * haben keine Tenant-Membership und wuerden sonst durch die Staff-Guard
 * fallen. Die drei Supabase-Auth-MFA-Endpoints (enroll/challengeAndVerify/
 * unenroll) sind user-agnostisch: der anon+cookie-Client operiert
 * automatisch auf dem eingeloggten User. Kein service_role noetig.
 *
 * Sprint 35: Recovery-Codes sind auch fuer Portal-Residents verfuegbar
 * (siehe generatePortalMfaRecoveryCodesAction unten). Residents koennen
 * sich damit selbst wiederherstellen, wenn sie ihr Authenticator-Geraet
 * verlieren, ohne die Verwaltung kontaktieren zu muessen.
 */

export type PortalMfaEnrollState = PortalAccountActionState & {
  enrollment?: {
    factorId: string;
    qrCodeDataUri: string;
    secret: string;
  };
};

export async function enrollPortalMfaFactorAction(
  _prev: PortalMfaEnrollState,
  formData: FormData,
): Promise<PortalMfaEnrollState> {
  await requireResidentContext();
  const parsed = mfaEnrollSchema.safeParse({
    friendlyName: formData.get('friendlyName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // Verwaiste unverified Faktoren einsammeln — sonst laeuft der User bei
  // wiederholten Abbruch/Neustart in Supabases Faktor-Limit.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const stale = factorsData?.all?.filter((f) => f.status === 'unverified') ?? [];
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const primaryName = parsed.data.friendlyName;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: primaryName,
  });

  if (error || !data) {
    if (error?.message.toLowerCase().includes('already exists')) {
      // Name-Kollision mit bestehendem verified Faktor — Datum anhaengen.
      const suffixed = `${primaryName} (${new Date().toISOString().slice(0, 10)})`;
      const retry = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: suffixed,
      });
      if (retry.error || !retry.data) {
        return { error: 'MFA-Faktor konnte nicht angelegt werden. Bitte spaeter erneut.' };
      }
      return {
        enrollment: {
          factorId: retry.data.id,
          qrCodeDataUri: retry.data.totp.qr_code,
          secret: retry.data.totp.secret,
        },
      };
    }
    return { error: 'MFA-Faktor konnte nicht angelegt werden. Bitte spaeter erneut.' };
  }

  return {
    enrollment: {
      factorId: data.id,
      qrCodeDataUri: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}

export async function verifyPortalMfaEnrollmentAction(
  _prev: PortalAccountActionState,
  formData: FormData,
): Promise<PortalAccountActionState> {
  const ctx = await requireResidentContext();

  // Rate-Limit auf User-ID: TOTP-Codes haben 10^6 Kombinationen; die Sperre
  // verhindert, dass jemand mit erbeutetem Enrollment-Link (unverified
  // Faktor) den Code durch Brute-Force verifiziert.
  const rl = await checkAuthRateLimit(`user:${ctx.userId}`, 'mfa-verify');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = mfaVerifySchema.safeParse({
    factorId: formData.get('factorId'),
    code: formData.get('code'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) {
    return {
      error: 'Der Code ist nicht gueltig. Bitte einen frischen Code aus der App eingeben.',
    };
  }

  revalidatePath('/portal', 'layout');
  return { success: 'Zwei-Faktor-Authentifizierung ist aktiv.' };
}

export async function unenrollPortalMfaFactorAction(
  _prev: PortalAccountActionState,
  formData: FormData,
): Promise<PortalAccountActionState> {
  await requireResidentContext();
  const parsed = mfaUnenrollSchema.safeParse({
    factorId: formData.get('factorId'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // aal2-Guard identisch zum Staff-Flow: sobald der User MFA aktiv hat,
  // darf ein Angreifer mit erbeuteter aal1-Session den Schutz nicht
  // einfach abschalten. Die Enroll-Kaskade (unverified Faktoren beim
  // neuen Enroll wegraeumen) umgeht diesen Guard bewusst — dort gibt es
  // noch keine aal2-Session, die geprueft werden koennte.
  await requireAal2WhenEnrolled(supabase, '/portal/account');

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) {
    return { error: 'Faktor konnte nicht entfernt werden. Bitte spaeter erneut.' };
  }

  revalidatePath('/portal', 'layout');
  return { success: 'Faktor entfernt.' };
}

// ============================================================================
// MFA Recovery-Codes (Sprint 35)
// ============================================================================
//
// Portal-Variante von generateMfaRecoveryCodesAction. Der Consume-Flow
// (Einloesen beim Login) liegt bereits in /login/mfa/recovery/actions.ts
// und ist seit Sprint 32 fuer portal-Redirects vorbereitet — nur die
// Generierung fehlte fuer Residents.
//
// Warum service_role: Die RPC generate_mfa_recovery_codes_for_user ist
// SECURITY DEFINER mit REVOKE EXECUTE FROM anon/authenticated (Sprint 21
// Lockdown). Der anon+cookie Server-Client kann sie also nicht aufrufen.

/**
 * Generiert 10 neue Recovery-Codes fuer den eingeloggten Portal-Resident.
 * Loescht alle vorherigen Codes (used und unused) — Regenerierung ist der
 * einzige Weg, alte Codes zu invalidieren. Die Klartext-Codes werden dem
 * Resident EINMAL im ResponseState zurueckgegeben und sind danach nur noch
 * als bcrypt-Hash in der DB.
 */
export async function generatePortalMfaRecoveryCodesAction(
  _prev: PortalRecoveryCodesState,
  _formData: FormData,
): Promise<PortalRecoveryCodesState> {
  const ctx = await requireResidentContext();

  // aal2-Guard identisch zum Staff-Flow: ein Angreifer mit erbeuteter
  // aal1-Session koennte sonst 10 gueltige Codes fuer sich generieren, sie
  // aufheben und Wochen spaeter fuer die vollstaendige Account-Uebernahme
  // einloesen — auch nachdem der Resident sein Passwort neu gesetzt hat.
  const supabase = await createSupabaseServerClient();
  await requireAal2WhenEnrolled(supabase, '/portal/account');

  const plaintexts = generateRecoveryCodePlaintexts();
  // Die RPC erwartet die Codes ohne Bindestrich (bcrypt-Hash geht ueber
  // den Rohtext); wir speichern nur die 8 Alphabet-Zeichen.
  const rawForHash = plaintexts.map((c) => c.replace(/-/g, ''));

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc('generate_mfa_recovery_codes_for_user', {
    p_user_id: ctx.userId,
    p_plaintext_codes: rawForHash,
  });
  if (error) {
    return { error: 'Recovery-Codes konnten nicht erstellt werden. Bitte spaeter erneut.' };
  }

  revalidatePath('/portal', 'layout');
  return { codes: plaintexts, success: '10 neue Recovery-Codes generiert.' };
}
