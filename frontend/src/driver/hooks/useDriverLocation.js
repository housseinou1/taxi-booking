import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Custom hook for GPS tracking at 5-second intervals.
 *
 * Features:
 * - Tracks driver GPS position while online
 * - Transmits coordinates every 5 seconds via provided callback
 * - Handles GPS permission denied / unavailable states
 * - Provides last known location as fallback
 *
 * @param {Object} options
 * @param {boolean} options.isOnline - Whether the driver is currently online
 * @param {function} options.onLocationUpdate - Callback invoked with { lat, lng } every 5 seconds
 * @param {Object} [options.defaultLocation] - Default location { lat, lng } when GPS is unavailable
 * @returns {Object} { location, locationError, isTracking }
 */
export default function useDriverLocation({
  isOnline,
  onLocationUpdate,
  defaultLocation,
}) {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);

  const watchIdRef = useRef(null);
  const intervalRef = useRef(null);
  const latestLocationRef = useRef(null);
  const onLocationUpdateRef = useRef(onLocationUpdate);
  const defaultLocationRef = useRef(defaultLocation || { lat: 18.0735, lng: -15.9582 });

  // Keep refs in sync
  useEffect(() => {
    onLocationUpdateRef.current = onLocationUpdate;
  }, [onLocationUpdate]);

  useEffect(() => {
    if (defaultLocation) {
      defaultLocationRef.current = defaultLocation;
    }
  }, [defaultLocation]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(
        "GPS is not available in this browser. Please enable location services."
      );
      // Use default location as fallback
      const fallback = { lat: defaultLocationRef.current.lat, lng: defaultLocationRef.current.lng };
      setLocation(fallback);
      latestLocationRef.current = fallback;
      return;
    }

    setLocationError(null);
    setIsTracking(true);

    // Watch position for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setLocation(newLocation);
        setLocationError(null);
        latestLocationRef.current = newLocation;
      },
      (error) => {
        let errorMessage;
        // GeolocationPositionError codes: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
        switch (error.code) {
          case 1: // PERMISSION_DENIED
            errorMessage =
              "Location access is required. Please enable location services to use the driver app.";
            break;
          case 2: // POSITION_UNAVAILABLE
            errorMessage =
              "GPS position is currently unavailable. Using last known location.";
            break;
          case 3: // TIMEOUT
            errorMessage = "GPS request timed out. Retrying...";
            break;
          default:
            errorMessage = "An unknown GPS error occurred.";
        }
        setLocationError(errorMessage);

        // Use default location if no previous location exists
        if (!latestLocationRef.current) {
          const fallback = { lat: defaultLocationRef.current.lat, lng: defaultLocationRef.current.lng };
          setLocation(fallback);
          latestLocationRef.current = fallback;
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      }
    );

    // Transmit location every 5 seconds
    intervalRef.current = setInterval(() => {
      if (latestLocationRef.current && onLocationUpdateRef.current) {
        onLocationUpdateRef.current(latestLocationRef.current);
      }
    }, 5000);
  }, []);

  // Start/stop tracking based on online status
  useEffect(() => {
    if (isOnline) {
      startTracking();
    } else {
      stopTracking();
    }

    return () => {
      stopTracking();
    };
  }, [isOnline, startTracking, stopTracking]);

  return {
    location,
    locationError,
    isTracking,
  };
}
