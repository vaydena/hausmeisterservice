import { execFileSync } from 'node:child_process';
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */

// Sprint 99: Build-Marker fuer /api/health (Details in src/lib/build-info.ts).
//
// Die beiden Werte werden hier ermittelt, weil diese Datei zur Build-Zeit
// laeuft — und nur ein zur Build-Zeit eingefrorener Wert kann belegen,
// WELCHER Build gerade antwortet. Zur Laufzeit gelesen waere derselbe Wert
// auch auf dem alten Build zu sehen und damit wertlos.
//
// Reihenfolge beim SHA: ein bereits gesetztes APP_BUILD_SHA gewinnt, damit
// eine Build-Umgebung ohne .git-Verzeichnis den Wert einfach vorgeben kann.
// Sonst wird git gefragt. Schlaegt beides fehl, bleibt der Wert leer und
// build-info liefert 'unknown' — der Zeitstempel traegt den Beweis dann
// allein.
function resolveBuildSha() {
  const preset = (process.env.APP_BUILD_SHA ?? '').trim();
  if (preset.length > 0) return preset;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      // stderr verschlucken: ausserhalb eines Repos ist das Scheitern der
      // Normalfall und keine Meldung wert.
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return '';
  }
}

// In process.env festschreiben statt nur in eine Konstante: `next build`
// laedt diese Datei in seinen Worker-Prozessen erneut, und die erben das
// env des Elternprozesses. Ohne das Festschreiben bekaeme jeder Worker
// einen eigenen Zeitstempel — und der Marker koennte dann nicht mehr
// sagen, welcher davon "der" Build ist.
process.env.APP_BUILD_SHA = resolveBuildSha();
process.env.APP_BUILD_TIME = (process.env.APP_BUILD_TIME ?? '').trim() || new Date().toISOString();

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
  // sharp ist ein natives Modul (libvips) und darf nicht mitgebundelt
  // werden. Gebundelt sucht es seine .node-Binaries an Pfaden, die es im
  // Build-Output nicht gibt; auf dem Server wirft dann bereits der Import.
  // Lokal faellt das nicht auf, weil dort dieselben node_modules auf der
  // Platte liegen, gegen die gebaut wurde.
  //
  // Betrifft alle drei Upload-Pfade, die EXIF-Daten per Re-Encode
  // entfernen: Dokumente (src/lib/documents/actions.ts), Portal-Fotos
  // (src/app/(portal)/portal/defects/actions.ts) und die oeffentliche
  // Meldestrecke (src/app/melden/[token]/actions.ts).
  // nodemailer (SMTP-Versand) nutzt dynamische requires — wie sharp extern
  // halten, sonst stolpert der Bundler beim Build darüber.
  serverExternalPackages: ['sharp', 'nodemailer'],
  // Kompiliert die beiden Marker-Werte fest ins Bundle. Next.js ersetzt
  // dabei nur die woertliche Property-Schreibweise `process.env.APP_BUILD_*`
  // — siehe die Warnung in src/lib/build-info.ts.
  env: {
    APP_BUILD_SHA: process.env.APP_BUILD_SHA,
    APP_BUILD_TIME: process.env.APP_BUILD_TIME,
  },
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
