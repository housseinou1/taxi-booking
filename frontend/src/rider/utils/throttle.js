/**
 * Throttle a function — at most one call per waitMs, with trailing edge.
 */
export function throttle(fn, waitMs) {
  let lastCall = 0;
  let trailingTimer = null;
  let trailingArgs = null;

  function throttled(...args) {
    const now = Date.now();
    const remaining = waitMs - (now - lastCall);

    if (remaining <= 0) {
      if (trailingTimer) {
        clearTimeout(trailingTimer);
        trailingTimer = null;
        trailingArgs = null;
      }
      lastCall = now;
      fn(...args);
      return;
    }

    trailingArgs = args;
    if (!trailingTimer) {
      trailingTimer = setTimeout(() => {
        lastCall = Date.now();
        trailingTimer = null;
        if (trailingArgs) {
          fn(...trailingArgs);
          trailingArgs = null;
        }
      }, remaining);
    }
  }

  throttled.cancel = () => {
    if (trailingTimer) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
    trailingArgs = null;
  };

  return throttled;
}

/**
 * Debounce a function — call after waitMs of inactivity.
 */
export function debounce(fn, waitMs) {
  let timer = null;

  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}

export default throttle;
