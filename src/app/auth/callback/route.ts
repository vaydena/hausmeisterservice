import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { clientEnv } from '@/lib/env';

// Callback für Supabase-Auth-E-Mail-Links (Signup-Confirm, Magic-Link, Reset).
// Beim Signup-Flow liegen Firma, Slug und Zustimmungs-Zeitpunkt im
// user_metadata; die eigentliche Tenant-Anlage findet hier via
// SECURITY-DEFINER-RPC statt, weil RLS Anon-Inserts auf tenants blockiert.
//
// Der Handler ist idempotent: erneuter Aufruf mit gleichem User führt zu
// keinem doppelten Tenant (die RPC prüft eine existierende Membership).

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const errorDescription = searchParams.get('error_description');
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;

  // Supabase gibt bei abgelaufenen/ungültigen Links `error_description` mit.
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

  const user = data.user;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const signupCompanyName = typeof metadata.signup_company_name === 'string' ? metadata.signup_company_name : null;
  const signupSlug = typeof metadata.signup_slug === 'string' ? metadata.signup_slug : null;
  const signupTermsAcceptedAt =
    typeof metadata.signup_terms_accepted_at === 'string' ? metadata.signup_terms_accepted_at : null;

  // Wenn kein Signup-Kontext im metadata liegt (z. B. Reset-Password- oder
  // Magic-Link-Callback), einfach zur gewünschten oder Default-Seite leiten.
  if (!signupCompanyName || !signupSlug) {
    return NextResponse.redirect(`${appUrl}${safeNext(nextParam)}`);
  }

  const service = createSupabaseServiceClient();
  const { error: rpcError } = await service.rpc('provision_signup_tenant', {
    p_user_id: user.id,
    p_slug: signupSlug,
    p_company_name: signupCompanyName,
    p_terms_accepted_at: signupTermsAcceptedAt ?? new Date().toISOString(),
  });

  if (rpcError) {
    // Tenant-Anlage fehlgeschlagen — Session ist trotzdem aktiv. User landet
    // im Login mit einer Info; Support-Kontakt wäre der nächste Schritt.
    console.error('provision_signup_tenant failed', rpcError);
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Konto bestätigt, aber Mandanten-Einrichtung fehlgeschlagen. Bitte den Support kontaktieren.')}`,
    );
  }

  return NextResponse.redirect(`${appUrl}/dashboard`);
}

function safeNext(next: string | null): string {
  if (!next) return '/dashboard';
  if (!next.startsWith('/') || next.startsWith('//')) return '/dashboard';
  return next;
}
