/**
 * Development-only logger. No-op in production builds.
 */
const isDev = process.env.NODE_ENV !== "production";

export function devLog(...args) {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

export function devWarn(...args) {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn(...args);
  }
}

export default devLog;
