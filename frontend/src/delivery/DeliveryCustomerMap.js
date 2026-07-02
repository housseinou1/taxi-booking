import React, { Suspense, useEffect, useId, useMemo, useState } from "react";

import { MARKET } from "../marketConfig";
import DeliveryMapView from "./DeliveryMapView";
import { fetchDrivingRoute } from "./deliveryRouting";

const NEARBY_COURIER_OFFSETS = [
  { top: "38%", left: "22%", icon: "🏍️", delay: "0s" },
  { top: "52%", left: "68%", icon: "🚲", delay: "0.4s" },
  { top: "44%", left: "48%", icon: "🏍️", delay: "0.8s" },
  { top: "58%", left: "32%", icon: "🚗", delay: "1.2s" },
];

export default function DeliveryCustomerMap({
  pickup = null,
  destination = null,
  courierPosition = null,
  deliveryStatus = null,
  showUserLocation = true,
  showNearbyCouriers = false,
}) {
  const mapSessionKey = useId();
  const [userPosition, setUserPosition] = useState(MARKET.center);
  const [routePath, setRoutePath] = useState([]);

  useEffect(() => {
    if (!showUserLocation || !navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => setUserPosition([position.coords.latitude, position.coords.longitude]),
      () => setUserPosition(MARKET.center),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [showUserLocation]);

  useEffect(() => {
    let cancelled = false;
    const loadRoute = async () => {
      const points = [];
      if (
        courierPosition?.lat &&
        courierPosition?.lng &&
        ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering", "arriving_soon"].includes(deliveryStatus)
      ) {
        points.push([courierPosition.lat, courierPosition.lng]);
      } else if (pickup?.lat && pickup?.lng) {
        points.push([pickup.lat, pickup.lng]);
      }

      if (["picked_up", "in_transit", "delivering"].includes(deliveryStatus)) {
        if (destination?.lat && destination?.lng) points.push([destination.lat, destination.lng]);
      } else if (pickup?.lat && pickup?.lng && points.length === 0) {
        points.push([pickup.lat, pickup.lng]);
      } else if (
        pickup?.lat &&
        pickup?.lng &&
        !points.some((point) => point[0] === pickup.lat && point[1] === pickup.lng)
      ) {
        points.push([pickup.lat, pickup.lng]);
      }

      if (
        !["picked_up", "in_transit", "delivering"].includes(deliveryStatus) &&
        destination?.lat &&
        destination?.lng &&
        deliveryStatus &&
        deliveryStatus !== "requested"
      ) {
        points.push([destination.lat, destination.lng]);
      } else if (!deliveryStatus && destination?.lat && destination?.lng) {
        points.push([destination.lat, destination.lng]);
      }

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
  }, [pickup, destination, courierPosition, deliveryStatus]);

  const mapDelivery = useMemo(
    () =>
      pickup?.lat && destination?.lat
        ? {
            id: "customer-preview",
            pickup_lat: pickup.lat,
            pickup_lng: pickup.lng,
            destination_lat: destination.lat,
            destination_lng: destination.lng,
          }
        : null,
    [pickup, destination]
  );

  const driverPos = courierPosition
    ? [courierPosition.lat, courierPosition.lng]
    : userPosition;

  return (
    <div className="delivery-uber__map-layer">
      <Suspense fallback={<div className="delivery-uber__map delivery-uber__map--fallback" aria-hidden />}>
        <DeliveryMapView
          key={mapSessionKey}
          courierPosition={driverPos}
          activeDelivery={mapDelivery}
          routePath={routePath}
          routeColor="#f58220"
        />
      </Suspense>

      {showNearbyCouriers && !deliveryStatus ? (
        <div className="delivery-uber__map-couriers" aria-hidden>
          {NEARBY_COURIER_OFFSETS.map((pin) => (
            <span
              key={`${pin.top}-${pin.left}`}
              className="delivery-uber__map-courier-pin"
              style={{ top: pin.top, left: pin.left, animationDelay: pin.delay }}
            >
              {pin.icon}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
