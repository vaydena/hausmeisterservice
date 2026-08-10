import { withSentryConfig } from '@sentry/nextjs';

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
//   - *.sentry.io       Error-Ingest (nur wenn NEXT_PUBLIC_SENTRY_DSN gesetzt)
//
// Der Service-Worker unter /sw.js läuft same-origin — `worker-src 'self'`
// deckt das ab. Web-Push braucht keine zusätzlichen CSP-Direktiven,
// weil die Push-Kommunikation direkt zwischen Browser-Push-Service
// und unserem VAPID-Backend läuft, ohne DOM-Zugriff.

function buildCsp({ isDev, sentryEnabled }) {
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";
  const connectHosts = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'];
  if (sentryEnabled) {
    connectHosts.push('https://*.sentry.io', 'https://*.ingest.sentry.io', 'https://*.ingest.us.sentry.io');
  }
  if (isDev) {
    connectHosts.push('ws:', 'http://localhost:*');
  }
  const connectSrc = `connect-src ${connectHosts.join(' ')}`;
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
    const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
    const commonHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      { key: 'Content-Security-Policy', value: buildCsp({ isDev: !isProd, sentryEnabled }) },
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

// Sentry-Wrap: Aktiviert Source-Map-Upload beim Build wenn SENTRY_AUTH_TOKEN
// gesetzt ist, sonst harmlos. `silent` unterdrückt Log-Rauschen außerhalb
// von CI. `hideSourceMaps` verhindert öffentlich abrufbare Source-Maps.
const sentryOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  telemetry: false,
};

export default withSentryConfig(nextConfig, sentryOptions);
