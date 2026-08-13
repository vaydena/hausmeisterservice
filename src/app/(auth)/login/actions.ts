'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureTenantForUser } from '@/lib/auth/ensure-tenant';
import { logLoginEvent } from '@/lib/auth/log-login-event';
import { getClientIp } from '@/lib/security/client-ip';
import {
  checkAuthRateLimit,
  formatRateLimitError,
  resetAuthRateLimit,
} from '@/lib/security/rate-limit';

const loginSchema = z.object({
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein.'),
  password: z.string().min(1, 'Bitte geben Sie Ihr Passwort ein.'),
  next: z.string().startsWith('/').default('/dashboard'),
});

export type LoginState = { error?: string };

export async function signInAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Rate-Limit-Check ZUERST — noch vor der Zod-Validierung, damit ein
  // Angreifer nicht per malformed Payload den Zaehler umgeht. IP kommt aus
  // x-forwarded-for (Hostinger-Reverse-Proxy setzt den immer). Bei
  // gesperrter IP: sofort mit generischer Retry-Meldung antworten, keine
  // Auskunft ob die Credentials korrekt gewesen waeren.
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'login');
  if (!rl.allowed) {
    return { error: formatRateLimitError(rl.retryAfterSec) };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next') ?? '/dashboard',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Ungültige Eingaben.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !signInData.user) {
    return { error: 'Anmeldung fehlgeschlagen. Bitte prüfen Sie E-Mail und Passwort.' };
  }

  // Erfolgreicher Login: Rate-Limit-Zaehler fuer diese IP freigeben, damit
  // vergangene Tippfehler die naechste Session nicht mehr blockieren.
  await resetAuthRateLimit(ip, 'login');

  // Sprint 29: Login als Zeile in auth_login_events schreiben — der User
  // sieht seinen eigenen Anmeldeverlauf in /settings/account und kann so
  // ungewoehnliche Logins (fremde IP, fremder Browser) frueh erkennen.
  const hdrs = await headers();
  await logLoginEvent({
    userId: signInData.user.id,
    ip,
    userAgent: hdrs.get('user-agent'),
    endpoint: 'staff-login',
  });

  // MFA-Gate (Sprint 25): Wenn der User verified TOTP-Faktoren hat, hebt
  // Supabase das AAL-Ziel auf aal2 an. Wir schicken ihn dann durch den
  // TOTP-Verify-Schritt, BEVOR er ins Dashboard oder Portal kommt. Der
  // Post-Login-Router unten laeuft NACH erfolgreichem aal2-Upgrade
  // (via /login/mfa) — bis dahin darf der User trotz gueltiger aal1-
  // Session keine App-Routen erreichen.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    const mfaUrl = new URL('/login/mfa', 'http://placeholder');
    mfaUrl.searchParams.set('next', parsed.data.next);
    redirect(`${mfaUrl.pathname}${mfaUrl.search}`);
  }

  // Post-Login-Router:
  //   Staff-Membership vorhanden → next (default /dashboard)
  //   sonst Resident → /portal/dashboard
  //   sonst kein Zugriff → /no-access (bricht den Redirect-Loop
  //   zwischen /dashboard und /login, wenn der User zwar authentifiziert
  //   ist, aber weder Mitarbeiter- noch Portal-Rechte hat)
  let { data: membership } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', signInData.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  // Fallback für Self-Signup, dessen /auth/callback nicht durchgelaufen ist
  // (z. B. weil die Confirm-URL nicht an /auth/callback zurückführt oder
  // das RPC beim ersten Aufruf einen transienten Fehler hatte). Der Helper
  // ist idempotent: hat die Membership zwischenzeitlich existiert, macht
  // er nichts.
  if (!membership) {
    const provisioned = await ensureTenantForUser(signInData.user);
    if (provisioned === 'provisioned' || provisioned === 'existing') {
      const { data: fresh } = await supabase
        .from('memberships')
        .select('id')
        .eq('user_id', signInData.user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      membership = fresh;
    }
  }

  if (membership) {
    redirect(parsed.data.next);
  }

  const { data: resident } = await supabase
    .from('residents')
    .select('id')
    .eq('user_id', signInData.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (resident) redirect('/portal/dashboard');

  redirect('/no-access');
}
