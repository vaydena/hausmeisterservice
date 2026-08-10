// Next.js Instrumentation-Hook
//
// register() wird vor der ersten Request-Verarbeitung genau einmal
// pro Runtime aufgerufen. Wir laden die passende Sentry-Konfiguration
// dynamisch je nach Runtime, damit weder Edge- noch Node-spezifische
// APIs versehentlich in der falschen Umgebung landen.
//
// onRequestError bündelt HTTP-Fehler aus Route-Handlern und Server-
// Components und leitet sie an Sentry weiter — no-op ohne DSN.
//
// server-only-Marker: instrumentation.ts wird von Next.js ausschließlich
// server-/edge-seitig geladen; der Import stellt sicher, dass ein
// versehentlicher Client-Import den Build stoppt (Coverage-Guard).

import 'server-only';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
