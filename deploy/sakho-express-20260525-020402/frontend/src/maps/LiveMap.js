import React, { useEffect, useState } from "react";
import { API_URL } from "../apiConfig";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function RecenterMap({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, 14);
    }
  }, [position, map]);

  return null;
}

function calculateDistanceKm(pointA, pointB) {
  const earthRadiusKm = 6371;

  const lat1 = pointA[0] * (Math.PI / 180);
  const lat2 = pointB[0] * (Math.PI / 180);

  const deltaLat = (pointB[0] - pointA[0]) * (Math.PI / 180);
  const deltaLng = (pointB[1] - pointA[1]) * (Math.PI / 180);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function LiveMap({ currentRide }) {
  const defaultDriverPosition = [18.0735, -15.9582];

  const [driverPosition, setDriverPosition] = useState(
    defaultDriverPosition
  );

  const pickup = [
    Number(currentRide?.pickup_lat || 18.0735),
    Number(currentRide?.pickup_lng || -15.9582),
  ];

  const destination = [
    Number(currentRide?.destination_lat || 18.0896),
    Number(currentRide?.destination_lng || -15.9754),
  ];

  const distanceToPickup = calculateDistanceKm(
    driverPosition,
    pickup
  );

  const averageSpeedKmH = 35;
  const etaMinutes = Math.max(
    1,
    Math.round((distanceToPickup / averageSpeedKmH) * 60)
  );

  const fetchDriverLocation = async () => {
    try {
      if (currentRide?.driver_lat && currentRide?.driver_lng) {
        setDriverPosition([
          Number(currentRide.driver_lat),
          Number(currentRide.driver_lng),
        ]);

        return;
      }

      const response = await fetch(`${API_URL}/drivers/available/`);
      const drivers = await response.json();

      if (Array.isArray(drivers) && drivers.length > 0) {
        const driver = drivers[0];

        setDriverPosition([
          Number(driver.current_lat || driver.driver_lat || 18.0735),
          Number(driver.current_lng || driver.driver_lng || -15.9582),
        ]);
      }
    } catch (error) {
      console.log("Driver location error:", error);
    }
  };

  useEffect(() => {
    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 2000);

    return () => clearInterval(interval);
  }, [currentRide]);

  return (
    <div style={mapWrapperStyle}>
      <div style={mapHeaderStyle}>
        <div>
          <h2 style={titleStyle}>Live Trip Map</h2>
          <p style={subtitleStyle}>
            Driver is moving in real time
          </p>
        </div>

        <span style={liveBadgeStyle}>LIVE</span>
      </div>

      <div style={etaBoxStyle}>
        <div>
          <strong>ETA</strong>
          <p>{etaMinutes} min</p>
        </div>

        <div>
          <strong>Distance to pickup</strong>
          <p>{distanceToPickup.toFixed(2)} km</p>
        </div>
      </div>

      <MapContainer
        center={driverPosition}
        zoom={14}
        style={mapStyle}
      >
        <RecenterMap position={driverPosition} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={driverPosition}>
          <Popup>🚖 Driver live location</Popup>
        </Marker>

        <Marker position={pickup}>
          <Popup>
            📍 Pickup: {currentRide?.pickup || "Market"}
          </Popup>
        </Marker>

        <Marker position={destination}>
          <Popup>
            🏁 Destination: {currentRide?.destination || "Toujounine"}
          </Popup>
        </Marker>

        <Polyline
          positions={[
            driverPosition,
            pickup,
            destination,
          ]}
        />
      </MapContainer>
    </div>
  );
}

const mapWrapperStyle = {
  width: "100%",
  background: "#1e293b",
  borderRadius: "18px",
  overflow: "hidden",
};

const mapHeaderStyle = {
  padding: "18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "white",
};

const titleStyle = {
  margin: 0,
};

const subtitleStyle = {
  margin: "6px 0 0",
  color: "#cbd5e1",
};

const liveBadgeStyle = {
  background: "#ef4444",
  color: "white",
  padding: "8px 12px",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "12px",
};

const etaBoxStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  padding: "0 18px 18px",
  color: "white",
};

const mapStyle = {
  height: "420px",
  width: "100%",
};

export default LiveMap;
