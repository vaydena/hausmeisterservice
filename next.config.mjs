/** @type {import('next').NextConfig} */

// Content-Security-Policy — restriktiv nach Least-Privilege.
//
// `unsafe-inline` bei Skripten/Styles ist nötig, weil Next.js beim
// Hydration-Bootstrap Inline-Skripte einbettet und Tailwind zur
// Laufzeit Inline-Styles nutzt. Eine Nonce-Migration ist möglich,
// aber komplex und außerhalb des Sprint-1-Scopes. `unsafe-eval` ist
// nur im Dev-Modus nötig (React-Refresh, HMR).
//
// Erlaubte externe Hosts:
//   - *.supabase.co     Datenbank, Auth, Storage (REST + Realtime WebSocket)
//
// Der Service-Worker unter /sw.js läuft same-origin — `worker-src 'self'`
// deckt das ab. Web-Push braucht keine zusätzlichen CSP-Direktiven,
// weil die Push-Kommunikation direkt zwischen Browser-Push-Service
// und unserem VAPID-Backend läuft, ohne DOM-Zugriff.

function buildCsp({ isDev }) {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectSrc = isDev
    ? "connect-src 'self' https://*.supabase.co wss://*.supabase.co ws: http://localhost:*"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data:",
    connectSrc,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes bewusst aus: erzwingt Route-Cast bei jedem dynamischen
  // <Link href> / redirect(). Kann später über Adapter zurückkommen.
  typedRoutes: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const commonHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      { key: 'Content-Security-Policy', value: buildCsp({ isDev: !isProd }) },
    ];
    // HSTS nur im Prod-Build ausliefern — auf localhost:HTTP ist der
    // Header wirkungslos, im Prod-Betrieb (immer HTTPS) sinnvoll.
    // Bewusst OHNE includeSubDomains/preload: andere Subdomains von
    // vaydena.de (z. B. Zeiterfassung) sollen unabhängig entscheiden.
    if (isProd) {
      commonHeaders.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }
    return [{ source: '/(.*)', headers: commonHeaders }];
  },
};

export default nextConfig;
