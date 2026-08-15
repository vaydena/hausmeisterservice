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

export type PortalLoginState = { error?: string };

export async function portalSignInAction(
  _prev: PortalLoginState,
  formData: FormData,
): Promise<PortalLoginState> {
  // Rate-Limit-Check ZUERST — gleiche Brute-Force-Oberflaeche wie /login,
  // deshalb dieselbe Config (5 Versuche pro 15 Min). Bei gesperrter IP
  // sofort mit generischer Retry-Meldung antworten.
  const ip = getClientIp(await headers());
  const rl = await checkAuthRateLimit(ip, 'portal-login');
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

  // Prüfen, dass wirklich ein aktiver Resident-Record existiert
  const residentRes = await supabase
    .from('residents')
    .select('id, tenant_id, portal_activated_at')
    .eq('user_id', data.user.id)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  // Sprint 103: Fehlgeschlagene Query und "kein Bewohner" strikt trennen.
  // Vorher lief beides in denselben Zweig, und eine kaputte RLS oder eine
  // nicht erreichbare DB hat dem Bewohner gesagt, sein Zugang sei nicht
  // hinterlegt — eine Falschauskunft, die im Support als Datenproblem
  // ankommt statt als Stoerung. Hier bewusst kein throw: in einem
  // Login-Formular ist eine verstaendliche Meldung mehr wert als eine
  // Fehlerseite.
  if (residentRes.error) {
    await supabase.auth.signOut();
    return {
      error:
        'Die Anmeldung ist derzeit technisch nicht möglich. Bitte versuchen Sie es in einigen Minuten erneut.',
    };
  }
  const resident = residentRes.data;

  if (!resident) {
    await supabase.auth.signOut();
    return {
      error:
        'Für dieses Konto ist kein Bewohner-Portal-Zugang hinterlegt. Bitte kontaktieren Sie Ihre Verwaltung.',
    };
  }

  // Erfolgreicher Portal-Login (mit Resident-Match): Rate-Limit-Zaehler
  // fuer diese IP freigeben. Analog zu /login.
  await resetAuthRateLimit(ip, 'portal-login');

  // Sprint 29: Login als Zeile in auth_login_events schreiben — Portal-
  // Bewohner sehen ihren eigenen Anmeldeverlauf ebenfalls im Konto-
  // Bereich (bzw. der Portal-Konto-Seite, sobald die existiert).
  const hdrs = await headers();
  await logLoginEvent({
    userId: data.user.id,
    ip,
    userAgent: hdrs.get('user-agent'),
    endpoint: 'portal-login',
  });

  // Beim ersten Login: portal_activated_at setzen (best-effort, verletzt nicht Login-Flow)
  if (!resident.portal_activated_at) {
    await supabase
      .from('residents')
      .update({ portal_activated_at: new Date().toISOString() })
      .eq('id', resident.id);
  }

  // MFA-Gate (Sprint 32, analog zu staff signInAction): Wenn der Resident
  // verified TOTP-Faktoren hat, hebt Supabase das AAL-Ziel auf aal2 an.
  // Wir schicken ihn dann durch den TOTP-Verify-Schritt, BEVOR er ins
  // Portal-Dashboard kommt. /login/mfa ist user-agnostisch und akzeptiert
  // jeden /-Pfad als next — Portal-Pfade landen automatisch wieder im
  // Portal-Kontext (Layout gated selbst auf getResidentContext).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    redirect('/login/mfa?next=%2Fportal%2Fdashboard');
  }

  redirect('/portal/dashboard');
}
