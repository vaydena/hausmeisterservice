'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { requireTenantContext } from '@/lib/tenant/current';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { changePasswordSchema } from '@/lib/auth/change-password-schema';
import { changeDisplayNameSchema } from '@/lib/auth/change-display-name-schema';
import { changeEmailSchema } from '@/lib/auth/change-email-schema';
import { revokeSessionSchema } from '@/lib/auth/revoke-session-schema';
import { getCurrentSessionId } from '@/lib/auth/current-session-id';
import {
  mfaEnrollSchema,
  mfaUnenrollSchema,
  mfaVerifySchema,
} from '@/lib/auth/mfa-verify-schema';
import { generateRecoveryCodePlaintexts } from '@/lib/auth/mfa-recovery';
import { requireAal2WhenEnrolled } from '@/lib/auth/require-aal2';
import { clientEnv } from '@/lib/env';

export type AccountActionState = { error?: string; success?: string };

/**
 * Ergebnis von generateMfaRecoveryCodesAction. Bei Erfolg enthaelt `codes`
 * die 10 frisch generierten Klartext-Codes; sie werden dem User EIN MAL
 * angezeigt und sind danach nur noch als bcrypt-Hash in der DB. Bei
 * erneutem Aufruf werden alle bisherigen Codes (used oder unused)
 * gelöscht und ersetzt.
 */
export type RecoveryCodesState = AccountActionState & {
  codes?: string[];
};

/**
 * Ergebnis von enrollMfaFactorAction. Der Faktor ist nach Enroll noch
 * `unverified` — die UI muss dem User Secret/QR-Code zeigen und ihn dann
 * durch verifyMfaEnrollmentAction schleusen, damit der Faktor auf
 * `verified` wechselt und dem Konto tatsaechlich MFA-Schutz gibt.
 */
export type MfaEnrollState = AccountActionState & {
  enrollment?: {
    factorId: string;
    qrCodeDataUri: string;
    secret: string;
  };
};

export async function changePasswordAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const ctx = await requireTenantContext();
  if (!ctx.email) {
    return { error: 'Fuer dieses Konto ist keine E-Mail hinterlegt. Bitte Support kontaktieren.' };
  }

  // Sprint 27: aal2 verlangen, sobald der User MFA aktiv hat. Passwort-
  // Aenderung mit einer erbeuteten aal1-Session waere sonst der Persistenz-
  // Vektor: Angreifer setzt neues Passwort, User wird beim naechsten Login
  // ausgesperrt. Der Re-Auth-Check unten ist strikt zusaetzlich (er
  // schuetzt auch aal2-Sessions vor "Passwort im offenen Browser gesetzt").
  const supabase = await createSupabaseServerClient();
  await requireAal2WhenEnrolled(supabase, '/settings/account');

  // Rate-Limit auf E-Mail-Basis: schuetzt einen konkreten Account gegen
  // Brute-Force auf das aktuelle Passwort, falls jemand eine noch gueltige
  // Session-Cookie erbeutet hat und nur noch die Re-Auth aushebeln muesste,
  // um den Account per Passwort-Change zu uebernehmen.
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

  // Re-Auth: aktuelles Passwort verifizieren, indem wir mit der bekannten
  // E-Mail + aktuellem Passwort einen Sign-In versuchen. Bei Erfolg
  // ueberschreibt Supabase die Session-Cookies mit einer frischen Session
  // (gleicher User) — das ist ok, der User bleibt eingeloggt.
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

/**
 * E-Mail-Adresse aendern (Sprint 30). Supabase versendet eine
 * Bestaetigungs-Mail an die NEUE Adresse; wenn im Supabase-Dashboard
 * "Secure email change" aktiv ist (Default), zusaetzlich eine an die
 * alte. Der Wechsel wird erst nach Klick auf den Confirm-Link wirksam
 * — bis dahin bleibt die aktuelle Adresse gueltig.
 *
 * Sicherheitsmaßnahmen:
 *   - aal2 verlangt, wenn User MFA hat (identisch zu Passwort-Change:
 *     E-Mail-Wechsel ist Account-Takeover-Vektor, wenn Angreifer aal1
 *     hat und die neue E-Mail dann zum Passwort-Reset nutzt).
 *   - Rate-Limit 3/Stunde auf aktuelle E-Mail (verhindert Mail-Bombing
 *     der neuen Adresse und Ueberflutung des Users mit Confirm-Mails).
 *   - Redirect nach Klick geht via /auth/callback → /settings/account
 *     ?info=email-changed, damit der User eine sichtbare Bestaetigung
 *     bekommt.
 */
export async function changeEmailAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const ctx = await requireTenantContext();
  if (!ctx.email) {
    return { error: 'Fuer dieses Konto ist keine E-Mail hinterlegt. Bitte Support kontaktieren.' };
  }

  const supabase = await createSupabaseServerClient();
  await requireAal2WhenEnrolled(supabase, '/settings/account');

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

  // Callback-URL bauen: nach Confirm landet der User auf /settings/account
  // mit info=email-changed, damit die UI eine sichtbare Rueckmeldung
  // zeigen kann. URLSearchParams encodet das inner "?" automatisch.
  const redirectUrl = new URL('/auth/callback', clientEnv.NEXT_PUBLIC_APP_URL);
  redirectUrl.searchParams.set('next', '/settings/account?info=email-changed');

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
        error: 'Zu viele Anfragen an den Mail-Provider. Bitte in ein paar Minuten erneut versuchen.',
      };
    }
    return { error: 'E-Mail-Adresse konnte nicht geaendert werden. Bitte spaeter erneut.' };
  }

  return {
    success:
      'Bestaetigungs-Mail an die neue Adresse gesendet. Falls "Secure email change" aktiv ist, muessen Sie zusaetzlich den Link in der Mail an Ihre bisherige Adresse anklicken. Die Aenderung wird erst nach Bestaetigung wirksam.',
  };
}

export async function changeDisplayNameAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const ctx = await requireTenantContext();

  const parsed = changeDisplayNameSchema.safeParse({
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  if (parsed.data.displayName === ctx.displayName) {
    return { success: 'Anzeigename ist bereits aktuell.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('users')
    .update({ display_name: parsed.data.displayName })
    .eq('id', ctx.userId);
  if (error) {
    return { error: 'Anzeigename konnte nicht gespeichert werden. Bitte spaeter erneut.' };
  }

  // TenantContext ist per Request gecacht — Layout/Header + Konto-Seite ziehen
  // den neuen Namen erst nach einer Revalidierung. '/' revalidiert alle
  // gecachten Server-Routen; billiger als jede einzelne Seite aufzuzaehlen.
  revalidatePath('/', 'layout');

  return { success: 'Anzeigename aktualisiert.' };
}

export async function signOutOtherSessionsAction(
  _prev: AccountActionState,
  _formData: FormData,
): Promise<AccountActionState> {
  await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  // Sprint 27: aal2 verlangen — ohne den Guard koennte ein Angreifer mit
  // erbeuteter aal1-Session die legitime aal2-Session des Owners killen.
  await requireAal2WhenEnrolled(supabase, '/settings/account');

  // scope:'others' invalidiert alle Refresh-Tokens des Users AUSSER dem
  // der aktuellen Session — der User bleibt hier eingeloggt, auf allen
  // anderen Geraeten wird er beim naechsten Refresh abgemeldet.
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    return { error: 'Andere Sitzungen konnten nicht abgemeldet werden. Bitte spaeter erneut.' };
  }

  return { success: 'Alle anderen Sitzungen wurden abgemeldet.' };
}

/**
 * Sprint 31: Beendet eine einzelne Sitzung des eingeloggten Users. Der
 * Ownership-Check laeuft in der SECURITY-DEFINER-Function
 * revoke_user_session ueber (user_id, session_id) — der Aufrufer passt
 * ausschliesslich ctx.userId + die Zod-validierte sessionId durch.
 *
 * Verhalten:
 *   - Fehlende oder ungueltige sessionId: Fehlermeldung (Zod-Ergebnis).
 *   - sessionId == aktuelle Session: Fehler, damit der User sich nicht
 *     ausversehen aus dem Konto-Bereich aussperrt. Fuer den "aktuelle
 *     Sitzung beenden"-Fall gibt es das UserMenu → "Abmelden".
 *   - Session gehoert nicht dem User oder existiert nicht mehr: freundliche
 *     Meldung, statt einer schweigenden 0-Zeilen-Loeschung.
 *   - Erfolg: success-Meldung. Der User bleibt hier eingeloggt (nur die
 *     fremde Session ist weg); die aktuelle Sessions-Liste wird durch
 *     revalidatePath('/settings/account') nachgeladen.
 */
export async function revokeSessionAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const ctx = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  await requireAal2WhenEnrolled(supabase, '/settings/account');

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

  revalidatePath('/settings/account');
  return { success: 'Sitzung beendet.' };
}

// ============================================================================
// MFA / TOTP (Sprint 25)
// ============================================================================
//
// Supabase Auth speichert TOTP-Faktoren in auth.mfa_factors. Ein neuer
// Faktor wird per enroll angelegt (status 'unverified'), muss dann per
// challenge+verify aktiviert werden (status 'verified'). Nur verified
// Faktoren zaehlen fuer aal2. Unverified Faktoren sammeln sich sonst an,
// wenn ein User den Enroll-Flow abbricht — wir loeschen deswegen vor
// jedem neuen Enroll alle unverified Faktoren dieses Users.

export async function enrollMfaFactorAction(
  _prev: MfaEnrollState,
  formData: FormData,
): Promise<MfaEnrollState> {
  await requireTenantContext();
  const parsed = mfaEnrollSchema.safeParse({
    friendlyName: formData.get('friendlyName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // Verwaiste unverified Faktoren einsammeln — sonst laeuft der User
  // beim wiederholten Abbruch/Neustart in Supabases Faktor-Limit.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const stale = factorsData?.all?.filter((f) => f.status === 'unverified') ?? [];
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  // friendlyName muss pro User unique sein — bei Kollision mit einem
  // existierenden verified Faktor bricht enroll ab. Wir haengen einen
  // Zeitstempel-Suffix an, falls das passiert.
  const primaryName = parsed.data.friendlyName;
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: primaryName,
  });

  if (error || !data) {
    if (error?.message.toLowerCase().includes('already exists')) {
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

export async function verifyMfaEnrollmentAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const ctx = await requireTenantContext();

  // Rate-Limit auf User-ID: TOTP-Codes haben 10^6 Kombinationen, ohne
  // Sperre koennte ein Angreifer nach 4-5 Sekunden bei 1000 Codes/s
  // treffen. Zaehler laeuft ueber user_id, damit mehrere IPs den
  // Limit nicht parallel umgehen koennen.
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

  // challengeAndVerify bundlet die zwei Supabase-Calls (challenge +
  // verify) in einem Aufruf. Bei falschem Code bleibt der Faktor weiter
  // unverified; der User kann direkt einen neuen Code eingeben (die
  // naechste Aktion legt automatisch eine frische Challenge an).
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

  revalidatePath('/', 'layout');
  return { success: 'Zwei-Faktor-Authentifizierung ist aktiv.' };
}

export async function unenrollMfaFactorAction(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  await requireTenantContext();
  const parsed = mfaUnenrollSchema.safeParse({
    factorId: formData.get('factorId'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungueltige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();

  // Sprint 27: aal2 verlangen, sobald der User MFA aktiv hat. Ohne den
  // Guard koennte ein Angreifer mit erbeuteter aal1-Session den MFA-
  // Schutz einfach abschalten und den Account danach beliebig uebernehmen.
  // Die Enroll-Kaskade "unverified-Faktoren wegraeumen vor neuem enroll"
  // im enrollMfaFactorAction umgeht diesen Guard bewusst — dort ist ein
  // aal2-Prompt unmoeglich (der User hat gerade erst enroll begonnen).
  await requireAal2WhenEnrolled(supabase, '/settings/account');

  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) {
    return { error: 'Faktor konnte nicht entfernt werden. Bitte spaeter erneut.' };
  }

  revalidatePath('/', 'layout');
  return { success: 'Faktor entfernt.' };
}

// ============================================================================
// MFA Recovery-Codes (Sprint 26)
// ============================================================================

/**
 * Generiert 10 neue Recovery-Codes fuer den eingeloggten User. Loescht
 * dabei alle vorherigen (used und unused) Codes — Regenerierung ist der
 * einzige Weg, alte Codes zu invalidieren. Die Klartext-Codes werden dem
 * User EINMAL im ResponseState zurueckgegeben und sind danach nur noch
 * als bcrypt-Hash in der DB.
 */
export async function generateMfaRecoveryCodesAction(
  _prev: RecoveryCodesState,
  _formData: FormData,
): Promise<RecoveryCodesState> {
  const ctx = await requireTenantContext();

  // Sprint 27: aal2 verlangen. Ein Angreifer mit erbeuteter aal1-Session
  // koennte sonst 10 gueltige Recovery-Codes fuer sich generieren, sie
  // aufheben und Wochen spaeter fuer die vollstaendige Account-Uebernahme
  // einloesen — auch nachdem der Owner sein Passwort neu gesetzt hat.
  const supabase = await createSupabaseServerClient();
  await requireAal2WhenEnrolled(supabase, '/settings/account');

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

  revalidatePath('/', 'layout');
  return { codes: plaintexts, success: '10 neue Recovery-Codes generiert.' };
}

