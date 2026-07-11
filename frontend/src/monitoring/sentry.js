/**
 * Optional Sentry loader for web/admin monitoring.
 * Enabled only when REACT_APP_SENTRY_DSN is set at build time.
 */

export function initFrontendSentry() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn || typeof window === "undefined") {
    return Promise.resolve(false);
  }

  return import(/* webpackIgnore: true */ "@sentry/browser")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
        tracesSampleRate: Number(process.env.REACT_APP_SENTRY_TRACES_SAMPLE_RATE || 0.1),
      });
      return true;
    })
    .catch(() => false);
}
