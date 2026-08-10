// Sentry — Node-Server-Runtime
//
// Wird über src/instrumentation.ts geladen, wenn Next.js in der
// Node-Runtime startet (Server Components, Route Handler, Actions).

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
  // sendDefaultPii=false hält IP-Adressen, User-Agents und Cookies aus
  // den Events raus — konservative DSGVO-Voreinstellung.
  sendDefaultPii: false,
});
