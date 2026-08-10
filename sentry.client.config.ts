// Sentry — Browser/Client
//
// Wird von Next.js über instrumentation-client.ts / withSentryConfig
// automatisch gebündelt und beim ersten Client-Rendering initialisiert.
//
// Ohne NEXT_PUBLIC_SENTRY_DSN läuft die App normal weiter — Sentry ist
// dann komplett aus (enabled:false). Das erlaubt lokale Entwicklung
// und Deployments ohne aktives Error-Tracking.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: isProd ? 0.1 : 0,
  debug: false,
  sendDefaultPii: false,
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'Loading chunk',
    'Loading CSS chunk',
    'NetworkError',
    'AbortError',
  ],
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^moz-extension:\/\//i,
    /^safari-extension:\/\//i,
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
