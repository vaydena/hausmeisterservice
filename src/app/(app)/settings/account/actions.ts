'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { changePasswordSchema } from '@/lib/auth/change-password-schema';
import { changeDisplayNameSchema } from '@/lib/auth/change-display-name-schema';
import {
  mfaEnrollSchema,
  mfaUnenrollSchema,
  mfaVerifySchema,
} from '@/lib/auth/mfa-verify-schema';

export type AccountActionState = { error?: string; success?: string };

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

  const supabase = await createSupabaseServerClient();

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

  // scope:'others' invalidiert alle Refresh-Tokens des Users AUSSER dem
  // der aktuellen Session — der User bleibt hier eingeloggt, auf allen
  // anderen Geraeten wird er beim naechsten Refresh abgemeldet.
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) {
    return { error: 'Andere Sitzungen konnten nicht abgemeldet werden. Bitte spaeter erneut.' };
  }

  return { success: 'Alle anderen Sitzungen wurden abgemeldet.' };
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
  const { error } = await supabase.auth.mfa.unenroll({ factorId: parsed.data.factorId });
  if (error) {
    return { error: 'Faktor konnte nicht entfernt werden. Bitte spaeter erneut.' };
  }

  revalidatePath('/', 'layout');
  return { success: 'Faktor entfernt.' };
}

