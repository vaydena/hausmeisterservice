import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const STAFF_PUBLIC_ROUTES = ['/', '/login', '/signup', '/reset-password', '/invite', '/preise'];
const PORTAL_PUBLIC_ROUTES = ['/portal/login', '/portal/reset-password'];
// Rechtspflicht-Seiten: von jeder Seite erreichbar für alle Besucher —
// dürfen weder Auth-Redirect noch Portal-Redirect auslösen.
const LEGAL_ROUTES = ['/impressum', '/datenschutz', '/agb'];
// Supabase-Auth-Callbacks (E-Mail-Verify, Magic-Link, Reset). Der Handler
// führt selbst exchangeCodeForSession aus — kein Session-Redirect davor.
const AUTH_CALLBACK_ROUTES = ['/auth/callback'];
// Externe Aufrufer (Cron / Webhooks) — Auth wird per Bearer-Token in der Route
// selbst geprüft, nicht per Session-Cookie.
const PUBLIC_API_PREFIXES = ['/api/cron/'];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStaffPublic(pathname: string): boolean {
  return STAFF_PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPortalPublic(pathname: string): boolean {
  return PORTAL_PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPortalRoute(pathname: string): boolean {
  return pathname === '/portal' || pathname.startsWith('/portal/');
}

function isLegalRoute(pathname: string): boolean {
  return LEGAL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isAuthCallback(pathname: string): boolean {
  return AUTH_CALLBACK_ROUTES.some((route) => pathname === route);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Public API-Routes (Cron, Webhooks) laufen ohne Session-Refresh.
  if (isPublicApi(pathname)) {
    return NextResponse.next();
  }

  // Auth-Callback muss immer durchlaufen — der Handler setzt die Session
  // selbst über exchangeCodeForSession. Kein vorgeschalteter Auth-Check.
  if (isAuthCallback(pathname)) {
    return NextResponse.next();
  }

  // Rechtspflicht-Seiten sind immer erreichbar — sowohl ohne Session
  // (Interessenten müssen Impressum/Datenschutz vor Anmeldung lesen können)
  // als auch mit Session (kein Auth-Redirect ins Dashboard).
  if (isLegalRoute(pathname)) {
    const { response } = await updateSession(request);
    return response;
  }

  const { response, user } = await updateSession(request);

  // Unauthenticated user
  if (!user) {
    // Public routes (Staff + Portal) always allowed
    if (isStaffPublic(pathname) || isPortalPublic(pathname)) return response;

    // Portal requests → /portal/login
    if (isPortalRoute(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/portal/login';
      url.search = '';
      return NextResponse.redirect(url);
    }

    // Staff / rest → /login?next=…
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  // Authenticated user hitting a public login/reset route → send to their app
  if (isStaffPublic(pathname) || isPortalPublic(pathname)) {
    // Let dashboards decide via Server Component redirect based on ctx (Staff→/dashboard, Resident→/portal/dashboard)
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Expose the current pathname to Server Components (subscription guard reads it
  // to whitelist /settings/subscription while the rest of the app is blocked).
  response.headers.set('x-pathname', pathname);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image
     * - favicon, robots, sitemap
     * - Files with a file extension (Fonts, images, PDFs)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|pdf|css|js)$).*)',
  ],
};
