import React, { Suspense, useEffect, useId, useState } from "react";

import { MARKET } from "../marketConfig";
import DeliveryMapView from "./DeliveryMapView";
import { fetchDrivingRoute } from "./deliveryRouting";
import { buildRoutePoints } from "./deliveryTrip";

export default function DeliveryMapBackdrop({ activeDelivery = null, recenterToken = 0 }) {
  const mapSessionKey = useId();
  const [courierPosition, setCourierPosition] = useState(MARKET.center);
  const [routePath, setRoutePath] = useState([]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setCourierPosition([position.coords.latitude, position.coords.longitude]);
      },
      () => setCourierPosition(MARKET.center),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!recenterToken || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCourierPosition([position.coords.latitude, position.coords.longitude]);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }, [recenterToken]);

  useEffect(() => {
    let cancelled = false;

    const loadRoute = async () => {
      const points = buildRoutePoints(activeDelivery, courierPosition);
      if (points.length < 2) {
        setRoutePath([]);
        return;
      }
      const path = await fetchDrivingRoute(points);
      if (!cancelled) setRoutePath(path);
    };

    loadRoute();
    return () => {
      cancelled = true;
    };
  }, [activeDelivery, courierPosition]);

  const mapDelivery = activeDelivery
    ? {
        id: activeDelivery.id,
        pickup_lat: activeDelivery.pickup_lat,
        pickup_lng: activeDelivery.pickup_lng,
        destination_lat: activeDelivery.destination_lat,
        destination_lng: activeDelivery.destination_lng,
        stops: activeDelivery.stops,
      }
    : null;

  return (
    <div className="delivery-uber__map-layer">
      <Suspense fallback={<div className="delivery-uber__map delivery-uber__map--fallback" aria-hidden />}>
        <DeliveryMapView
          key={mapSessionKey}
          courierPosition={courierPosition}
          activeDelivery={mapDelivery}
          routePath={routePath}
          routeColor="#FF6B00"
        />
      </Suspense>
    </div>
  );
}
