import React from "react";
import {
  GoogleMap,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "500px",
  borderRadius: "20px",
};

const defaultCenter = {
  lat: 18.0735,
  lng: -15.9582,
};

function LiveMap({ currentRide, driver }) {
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY,
  });

  // SAFE DRIVER LOCATION
  const driverLocation =
    driver &&
    driver.lat &&
    driver.lng
      ? {
          lat: parseFloat(driver.lat),
          lng: parseFloat(driver.lng),
        }
      : null;

  // SAFE PICKUP LOCATION
  const pickupLocation =
    currentRide &&
    currentRide.pickup_lat &&
    currentRide.pickup_lng
      ? {
          lat: parseFloat(currentRide.pickup_lat),
          lng: parseFloat(currentRide.pickup_lng),
        }
      : null;

  // SAFE DESTINATION LOCATION
  const destinationLocation =
    currentRide &&
    currentRide.destination_lat &&
    currentRide.destination_lng
      ? {
          lat: parseFloat(currentRide.destination_lat),
          lng: parseFloat(currentRide.destination_lng),
        }
      : null;

  // MAP CENTER
  const center =
    driverLocation ||
    pickupLocation ||
    destinationLocation ||
    defaultCenter;

  if (!isLoaded) {
    return (
      <div
        style={{
          padding: "20px",
          fontSize: "18px",
        }}
      >
        Loading Map...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        marginTop: "20px",
      }}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={13}
      >
        {/* DRIVER */}
        {driverLocation && (
          <Marker
            position={driverLocation}
            label="D"
          />
        )}

        {/* PICKUP */}
        {pickupLocation && (
          <Marker
            position={pickupLocation}
            label="P"
          />
        )}

        {/* DESTINATION */}
        {destinationLocation && (
          <Marker
            position={destinationLocation}
            label="A"
          />
        )}
      </GoogleMap>
    </div>
  );
}

export default LiveMap;