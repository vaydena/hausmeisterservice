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
  // Sprint 39: Portal-Flag entscheidet ueber den Fehler-Rueckweg. Ein
  // Bewohner, der einen abgelaufenen Reset-Link oeffnet, soll auf
  // /portal/login landen (nicht auf der Staff-Anmeldung), damit er den
  // Link dort neu anfordern kann. owner=1 ist die Eigentuemer-Variante und
  // hat Vorrang — ein Eigentuemer-Reset traegt nie zusaetzlich portal=1.
  const isPortal = searchParams.get('portal') === '1';
  const isOwner = searchParams.get('owner') === '1';
  const failureBase = isOwner ? '/owner/login' : isPortal ? '/portal/login' : '/login';

  if (errorDescription) {
    return NextResponse.redirect(
      `${appUrl}${failureBase}?error=${encodeURIComponent('Reset-Link ungueltig oder abgelaufen. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}${failureBase}?error=${encodeURIComponent('Reset-Link ist unvollstaendig. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Haeufigster Fall: Code wurde bereits verwendet (User hat schon
    // geklickt, oder Mail-Client hat den Link vorab abgerufen).
    return NextResponse.redirect(
      `${appUrl}${failureBase}?error=${encodeURIComponent('Reset-Link ungueltig oder bereits verwendet. Bitte fordern Sie einen neuen an.')}`,
    );
  }

  const nextUrl = new URL('/reset-password/new', appUrl);
  if (isOwner) nextUrl.searchParams.set('owner', '1');
  else if (isPortal) nextUrl.searchParams.set('portal', '1');
  return NextResponse.redirect(nextUrl.toString());
}
