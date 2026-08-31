import { useCallback, useEffect, useRef, useState } from "react";

import { subscribeOperationsUpdates } from "./opsSocket";
import {
  fetchOpsAlerts,
  fetchOpsDashboard,
  fetchOpsHandovers,
  fetchOpsTrips,
} from "./opsDashboardApi";

const POLL_MS = 12000;

export function useOpsDashboardData(cityId) {
  const [dashboard, setDashboard] = useState(null);
  const [tripsPage, setTripsPage] = useState({ trips: [], page: 1, page_size: 25, total: 0 });
  const [handovers, setHandovers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loadMs, setLoadMs] = useState(null);
  const [tripFilters, setTripFilters] = useState({
    status: "",
    search: "",
    sort: "waiting_desc",
    page: 1,
    page_size: 25,
  });
  const mountedRef = useRef(true);
  const hiddenRef = useRef(typeof document !== "undefined" ? document.hidden : false);
  const seenEventsRef = useRef(new Set());

  const params = cityId ? { city_id: cityId } : {};

  const loadCore = useCallback(
    async ({ silent = false } = {}) => {
      if (hiddenRef.current && silent) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const started = performance.now();
      try {
        setError("");
        const [dash, trips, handoff] = await Promise.all([
          fetchOpsDashboard(params),
          fetchOpsTrips({ ...params, ...tripFilters }),
          fetchOpsHandovers({ status: "submitted" }).catch(() => ({ handovers: [] })),
        ]);
        if (!mountedRef.current) return;
        setDashboard(dash);
        setTripsPage(trips);
        setHandovers(handoff.handovers || []);
        setLastRefresh(new Date());
        setLoadMs(Math.round(performance.now() - started));
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err?.response?.data?.detail || err?.response?.data?.error || err?.message || "Failed to load operations");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cityId, tripFilters]
  );

  const refreshTrips = useCallback(async (nextFilters) => {
    const filters = nextFilters || tripFilters;
    if (nextFilters) setTripFilters(filters);
    try {
      const trips = await fetchOpsTrips({ ...params, ...filters });
      setTripsPage(trips);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Failed to refresh trips");
    }
  }, [cityId, tripFilters]);

  const refreshAlerts = useCallback(async () => {
    try {
      const data = await fetchOpsAlerts(params);
      setDashboard((prev) => (prev ? { ...prev, alerts: data.alerts || data } : prev));
    } catch {
      /* best effort */
    }
  }, [cityId]);

  useEffect(() => {
    mountedRef.current = true;
    loadCore({ silent: false });
    const timer = window.setInterval(() => loadCore({ silent: true }), POLL_MS);

    const onVisibility = () => {
      hiddenRef.current = document.hidden;
      if (!document.hidden) loadCore({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    const unsubscribe = subscribeOperationsUpdates((event) => {
      const key = `${event?.type || "evt"}-${event?.ride_id || event?.delivery_id || event?.incident_id || ""}-${event?.at || ""}`;
      if (seenEventsRef.current.has(key)) return;
      seenEventsRef.current.add(key);
      if (seenEventsRef.current.size > 200) {
        seenEventsRef.current = new Set([...seenEventsRef.current].slice(-100));
      }
      if (!hiddenRef.current) loadCore({ silent: true });
    });

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [loadCore]);

  return {
    dashboard,
    tripsPage,
    handovers,
    loading,
    refreshing,
    error,
    lastRefresh,
    loadMs,
    tripFilters,
    setTripFilters,
    refresh: () => loadCore({ silent: true }),
    refreshTrips,
    refreshAlerts,
    pollMs: POLL_MS,
  };
}
