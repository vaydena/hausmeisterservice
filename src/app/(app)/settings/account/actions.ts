'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/current';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { changePasswordSchema } from '@/lib/auth/change-password-schema';

export type AccountActionState = { error?: string; success?: string };

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
