// Sentry — Edge-Runtime (Proxy / Middleware)
//
// Wird über src/instrumentation.ts geladen, wenn Next.js in der
// Edge-Runtime startet (z. B. src/proxy.ts).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production';

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  tracesSampleRate: isProd ? 0.1 : 0,
  debug: false,
  sendDefaultPii: false,
});
