// Wird von Next.js 15.3+ als Client-Instrumentation-Entry erkannt.
// Wir re-exportieren die Client-Config, damit Sentry sich beim ersten
// Client-Rendering initialisiert. Der Router-Transition-Hook aktiviert
// automatisches Tracing bei App-Router-Navigationen.

export { onRouterTransitionStart } from '../sentry.client.config';
