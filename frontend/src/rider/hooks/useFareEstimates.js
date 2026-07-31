import { useState, useEffect, useMemo } from 'react';
import { estimateFare } from '../services/apiService';

const DEFAULT_TYPES = ['regular', 'xl', 'comfort', 'share'];

/**
 * Fetch authoritative backend fare estimates for each category.
 * Returns a map { regular: { estimated_fare, base_fare, ... }, ... }.
 */
export function useFareEstimates(distanceKm, rideTypes = DEFAULT_TYPES) {
  const [estimates, setEstimates] = useState({});

  useEffect(() => {
    const d = Number(distanceKm);
    if (!Number.isFinite(d) || d < 0) {
      setEstimates({});
      return;
    }

    let cancelled = false;
    const rounded = Math.round(d * 100) / 100;

    Promise.all(
      rideTypes.map((type) =>
        estimateFare({ ride_type: type, distance_km: rounded }).catch((err) => ({
          error: err,
          ride_type: type,
          estimated_fare: null,
        }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((r) => {
        if (r && r.ride_type) {
          map[r.ride_type] = r;
        }
      });
      setEstimates(map);
    });

    return () => {
      cancelled = true;
    };
  }, [distanceKm, rideTypes]);

  return useMemo(() => estimates, [estimates]);
}

export default useFareEstimates;
