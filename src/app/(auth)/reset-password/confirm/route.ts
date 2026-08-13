import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { clientEnv } from '@/lib/env';

// Callback-Endpoint fuer Passwort-Reset-E-Mails. Supabase's
// resetPasswordForEmail schickt den User mit ?code=<pkce> hierher.
// Der Handler tauscht den Code gegen eine Recovery-Session und leitet
// dann auf /reset-password/new weiter, wo der User das neue Passwort
// setzt. Die Route ist bewusst ein GET-Handler und keine Page: nur so
// kann Supabase die Session-Cookies schreiben — in einer Server
// Component wuerde setAll() silently failen (Next-Cookie-API laesst
// Set-Cookie ausserhalb von Route Handlern / Server Actions nicht zu).

export async function GET(request: NextRequest) {
  const appUrl = clientEnv.NEXT_PUBLIC_APP_URL;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const errorDescription = searchParams.get('error_description');

  if (errorDescription) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Reset-Link ungueltig oder abgelaufen. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Reset-Link ist unvollstaendig. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Haeufigster Fall: Code wurde bereits verwendet (User hat schon
    // geklickt, oder Mail-Client hat den Link vorab abgerufen).
    return NextResponse.redirect(
      `${appUrl}/login?error=${encodeURIComponent('Reset-Link ungueltig oder bereits verwendet. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  return NextResponse.redirect(`${appUrl}/reset-password/new`);
}
