import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useOfflineCache - Caches active ride data in localStorage for offline resilience.
 *
 * Features:
 * - Caches active ride data in localStorage under `yala_active_ride_cache`
 * - Detects online/offline status via navigator.onLine and events
 * - Shows stale-data indicator when offline (isStale flag)
 * - Restores from cache on reconnect if no fresh data available
 * - Timestamps cached data for staleness detection
 *
 * @param {Object} options
 * @param {Object|null} options.activeRide - Current active ride data
 * @param {string} [options.cacheKey] - localStorage key (default: yala_active_ride_cache)
 * @returns {{ cachedRide: Object|null, isOffline: boolean, isStale: boolean, clearCache: function }}
 */

const DEFAULT_CACHE_KEY = "yala_active_ride_cache";
const STALE_THRESHOLD_MS = 60000; // Data older than 60s is considered stale

export default function useOfflineCache({ activeRide, cacheKey = DEFAULT_CACHE_KEY } = {}) {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [cachedRide, setCachedRide] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const lastFreshDataRef = useRef(Date.now());

  // ─── Monitor online/offline status ──────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setIsStale(false);
      lastFreshDataRef.current = Date.now();
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ─── Cache active ride data when it changes ─────────────────────────────
  useEffect(() => {
    if (activeRide) {
      const cacheEntry = {
        data: activeRide,
        timestamp: Date.now(),
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
      } catch {
        // localStorage full or unavailable
      }
      setCachedRide(activeRide);
      lastFreshDataRef.current = Date.now();
      setIsStale(false);
    } else {
      // Clear cache when ride ends
      try {
        localStorage.removeItem(cacheKey);
      } catch {
        // ignore
      }
      setCachedRide(null);
      setIsStale(false);
    }
  }, [activeRide, cacheKey]);

  // ─── Restore from cache on mount (for page reload while offline) ────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.data) {
          setCachedRide(parsed.data);
          const age = Date.now() - (parsed.timestamp || 0);
          if (age > STALE_THRESHOLD_MS) {
            setIsStale(true);
          }
        }
      }
    } catch {
      // Invalid cache data
    }
  }, [cacheKey]);

  // ─── Mark data as stale when offline for too long ───────────────────────
  useEffect(() => {
    if (!isOffline) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastFreshDataRef.current;
      if (elapsed > STALE_THRESHOLD_MS) {
        setIsStale(true);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isOffline]);

  // ─── Clear cache manually ──────────────────────────────────────────────
  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // ignore
    }
    setCachedRide(null);
    setIsStale(false);
  }, [cacheKey]);

  return {
    cachedRide,
    isOffline,
    isStale,
    clearCache,
  };
}
