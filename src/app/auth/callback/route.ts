import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureTenantForUser } from '@/lib/auth/ensure-tenant';
import { clientEnv } from '@/lib/env';

// Callback für Supabase-Auth-E-Mail-Links (Signup-Confirm, Magic-Link, Reset).
// Beim Signup-Flow liegen Firma, Slug und Zustimmungs-Zeitpunkt im
// user_metadata; die eigentliche Tenant-Anlage delegiert an
// ensureTenantForUser (identisch mit dem Fallback in signInAction).
//
// Zwei Eingangsvarianten, absichtlich in EINEM Handler (gemeinsame
// Tenant-Provisionierung, ein Rückweg):
//   • ?token_hash=…&type=signup — bevorzugt für die Bestätigungs-Mail. Der
//     Link in der Mail zeigt dann auf die EIGENE Domain
//     (hausmeisterservice.vaydena.de) statt auf *.supabase.co. Absender-
//     und Link-Domain stimmen so überein → GMX/web.de stuft die Mail nicht
//     mehr als Phishing/Spam ein. Bestätigung via verifyOtp.
//   • ?code=<pkce> — klassischer PKCE-Rückweg (Magic-Link, OAuth, sowie
//     bereits verschickte ältere Bestätigungs-Mails mit supabase.co-Link).
//     Bestätigung via exchangeCodeForSession. Bleibt aus Kompatibilität
//     erhalten — schon versendete Links funktionieren weiter.
//
// Der Handler ist idempotent: erneuter Aufruf mit gleichem User führt zu
// keinem doppelten Tenant (die RPC prüft eine existierende Membership).

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

// Nur bekannte Typen zulassen; Default 'signup', weil ausschließlich die
// Bestätigungs-Mail auf den token_hash-Weg umgestellt ist (Reset/Magic-Link
// laufen weiter über ?code).
function parseOtpType(value: string | null): EmailOtpType {
  return value && (EMAIL_OTP_TYPES as readonly string[]).includes(value)
    ? (value as EmailOtpType)
    : 'signup';
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const nextParam = searchParams.get('next');
  const errorDescription = searchParams.get('error_description');
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;

  if (errorDescription) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Bestätigungslink ungültig oder abgelaufen. Bitte erneut anmelden oder registrieren.')}`,
    );
  }

  if (!tokenHash && !code) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const supabase = await createSupabaseServerClient();

  // token_hash (Domain-eigener Link) hat Vorrang; sonst PKCE-Code.
  const { data, error } = tokenHash
    ? await supabase.auth.verifyOtp({
        type: parseOtpType(searchParams.get('type')),
        token_hash: tokenHash,
      })
    : await supabase.auth.exchangeCodeForSession(code ?? '');

  if (error || !data.user) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Bestätigung fehlgeschlagen. Bitte erneut anmelden.')}`,
    );
  }

  const result = await ensureTenantForUser(data.user);

  if (result === 'error') {
    // Tenant-Anlage fehlgeschlagen — Session ist trotzdem aktiv. User landet
    // im Login mit einer Info; beim nächsten signInAction versucht der
    // Fallback die Provisionierung erneut.
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Konto bestätigt, aber Mandanten-Einrichtung fehlgeschlagen. Bitte erneut anmelden oder den Support kontaktieren.')}`,
    );
  }

  // Egal ob frisch provisioniert, bereits existierend oder Magic-Link
  // ohne Signup-Kontext: der User ist eingeloggt und darf ins Dashboard.
  return NextResponse.redirect(`${appUrl}${safeNext(nextParam)}`);
}

function safeNext(next: string | null): string {
  if (!next) return '/dashboard';
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}
