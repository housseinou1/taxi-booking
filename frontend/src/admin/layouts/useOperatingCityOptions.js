import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchOperatingLocationCitiesWithFallback } from "./operatingCitiesApi";
import {
  mapOperatingCitiesToNameFilterOptions,
  mapOperatingCitiesToOptions,
  mapOperatingCitiesToRegistryOptions,
} from "./operatingCitySelect";

/**
 * YALA operating metros (13 cities) — ids from ``GET /locations/operating-cities/``.
 */
export function useOperatingCityOptions({ includeAll = true } = {}) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchOperatingLocationCitiesWithFallback();
      setCities(list);
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Could not load operating cities");
      setCities([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const options = useMemo(
    () => mapOperatingCitiesToOptions(cities, { includeAll }),
    [cities, includeAll]
  );

  const nameFilterOptions = useMemo(() => mapOperatingCitiesToNameFilterOptions(cities), [cities]);

  const registryOptions = useMemo(() => mapOperatingCitiesToRegistryOptions(cities), [cities]);

  return { options, nameFilterOptions, registryOptions, cities, loading, error, reload: load };
}
