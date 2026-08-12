import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ensureTenantForUser } from '@/lib/auth/ensure-tenant';
import { clientEnv } from '@/lib/env';

// Callback für Supabase-Auth-E-Mail-Links (Signup-Confirm, Magic-Link, Reset).
// Beim Signup-Flow liegen Firma, Slug und Zustimmungs-Zeitpunkt im
// user_metadata; die eigentliche Tenant-Anlage delegiert an
// ensureTenantForUser (identisch mit dem Fallback in signInAction).
//
// Der Handler ist idempotent: erneuter Aufruf mit gleichem User führt zu
// keinem doppelten Tenant (die RPC prüft eine existierende Membership).

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const errorDescription = searchParams.get('error_description');
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;

  if (errorDescription) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Bestätigungslink ungültig oder abgelaufen. Bitte erneut anmelden oder registrieren.')}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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
