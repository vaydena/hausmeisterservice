'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logLoginEvent } from '@/lib/auth/log-login-event';
import { getClientIp } from '@/lib/security/client-ip';
import {
  checkAuthRateLimit,
  formatRateLimitError,
  resetAuthRateLimit,
} from '@/lib/security/rate-limit';

const schema = z.object({
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
  password: z.string().min(1, 'Bitte geben Sie Ihr Passwort ein.'),
});

export type OwnerLoginState = { error?: string };

/**
 * Eigentuemer-Portal-Login. Spiegelt portalSignInAction (Bewohner), prueft
 * aber gegen `owners` statt `residents` und leitet auf /owner/dashboard.
 * Eigener Rate-Limit-Bucket 'owner-login' (gleiche Config wie /login).
 */
export async function ownerSignInAction(
  _prev: OwnerLoginState,
  formData: FormData,
): Promise<OwnerLoginState> {
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'owner-login');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.' };
  }

  // Aktiven owners-Datensatz prüfen. owners_select_own (user_id = auth.uid())
  // macht diese Zeile für den Eigentümer selbst sichtbar.
  const ownerRes = await supabase
    .from('owners')
    .select('id, tenant_id, portal_activated_at')
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  // Query-Fehler und "kein Eigentümer" strikt trennen (Muster aus dem
  // Bewohnerportal). Eine kaputte RLS oder nicht erreichbare DB darf dem
  // Eigentümer nicht sagen, sein Zugang sei nicht hinterlegt.
  if (ownerRes.error) {
    await supabase.auth.signOut();
    return {
      error:
        'Die Anmeldung ist derzeit technisch nicht möglich. Bitte versuchen Sie es in einigen Minuten erneut.',
    };
  }
  const owner = ownerRes.data;

  if (!owner) {
    await supabase.auth.signOut();
    return {
      error:
        'Für dieses Konto ist kein Eigentümer-Portal-Zugang hinterlegt. Bitte kontaktieren Sie Ihre Hausverwaltung.',
    };
  }

  await resetAuthRateLimit(ip, 'owner-login');

  const hdrs = await headers();
  await logLoginEvent({
    userId: data.user.id,
    ip,
    userAgent: hdrs.get('user-agent'),
    endpoint: 'owner-login',
  });

  // Beim ersten Login: portal_activated_at setzen (best-effort).
  if (!owner.portal_activated_at) {
    await supabase
      .from('owners')
      .update({ portal_activated_at: new Date().toISOString() })
      .eq('id', owner.id);
  }

  // MFA-Gate (analog Staff/Bewohner): verified TOTP hebt das AAL-Ziel auf
  // aal2 — dann erst durch den TOTP-Verify-Schritt, bevor das Dashboard kommt.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    redirect('/login/mfa?next=%2Fowner%2Fdashboard');
  }

  redirect('/owner/dashboard');
}
