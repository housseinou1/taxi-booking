import { useCallback, useEffect, useRef, useState } from "react";

import { fetchPendingWithdrawals } from "../executive/executiveApi";
import {
  fetchCeoMasterDashboard,
  fetchExecutiveMap,
  fetchProductionHealth,
} from "./ceoDashboardApi";

const REFRESH_MS = 15000;

export function useCeoDashboardData(cityId) {
  const [master, setMaster] = useState(null);
  const [mapData, setMapData] = useState(null);
  const [health, setHealth] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [loadMs, setLoadMs] = useState(null);
  const mountedRef = useRef(true);

  const params = cityId ? { city_id: cityId } : {};

  const loadCore = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const started = performance.now();
      try {
        setError("");
        const [masterData, mapPayload, healthData, pendingWithdrawals] = await Promise.all([
          fetchCeoMasterDashboard(params),
          fetchExecutiveMap(params).catch(() => null),
          fetchProductionHealth().catch(() => null),
          fetchPendingWithdrawals().catch(() => []),
        ]);
        if (!mountedRef.current) return;
        setMaster(masterData);
        setMapData(mapPayload);
        setHealth(healthData);
        setWithdrawals(pendingWithdrawals.slice(0, 20));
        setLastRefresh(new Date());
        setLoadMs(Math.round(performance.now() - started));
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err?.response?.data?.detail || err?.message || "Failed to load CEO dashboard");
      } finally {
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [cityId]
  );

  const refreshMap = useCallback(async () => {
    try {
      const mapPayload = await fetchExecutiveMap(params);
      setMapData(mapPayload);
    } catch (error) {
      // Map refresh is best-effort.
    }
  }, [cityId]);

  useEffect(() => {
    mountedRef.current = true;
    loadCore({ silent: false });
    const timer = window.setInterval(() => loadCore({ silent: true }), REFRESH_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [loadCore]);

  return {
    master,
    mapData,
    health,
    withdrawals,
    loading,
    refreshing,
    error,
    lastRefresh,
    loadMs,
    refresh: () => loadCore({ silent: true }),
    refreshMap,
  };
}
