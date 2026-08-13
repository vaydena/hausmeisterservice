'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getClientIp } from '@/lib/security/client-ip';
import { checkAuthRateLimit, formatRateLimitError } from '@/lib/security/rate-limit';
import { mfaVerifySchema } from '@/lib/auth/mfa-verify-schema';

export type LoginMfaState = { error?: string };

/**
 * TOTP-Verify beim Login (Sprint 25). Erwartet eine bestehende aal1-
 * Session (User hat gerade Passwort eingegeben). challengeAndVerify
 * hebt die Session bei Erfolg auf aal2 und schickt den User weiter.
 *
 * Rate-Limit auf IP-Basis (der User ist noch nicht "richtig" eingeloggt
 * im Sinne von aal2 und wir wollen nicht per E-Mail-Enumeration
 * herausfinden lassen, wer MFA aktiviert hat).
 */
export async function verifyLoginMfaAction(
  _prev: LoginMfaState,
  formData: FormData,
): Promise<LoginMfaState> {
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'mfa-verify');
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

  const nextRaw = String(formData.get('next') ?? '/dashboard');
  const next = nextRaw.startsWith('/') ? nextRaw : '/dashboard';

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

  redirect(next);
}
