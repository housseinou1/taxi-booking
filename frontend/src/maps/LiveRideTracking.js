import React, { useEffect, useState } from "react";
import { API_URL, authFetch } from "../apiConfig";

import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function LiveRideTracking({ ride }) {
  const [driverPosition, setDriverPosition] = useState([
    18.0735,
    -15.9582,
  ]);

  const [riderPosition] = useState([
    ride?.pickup_lat || 18.0735,
    ride?.pickup_lng || -15.9582,
  ]);

  const destination = [
    ride?.destination_lat || 18.0896,
    ride?.destination_lng || -15.9754,
  ];

  const fetchDriverLocation = async () => {
    try {
      const response = await authFetch(`${API_URL}/drivers/list/`);

      const data = await response.json();

      if (!Array.isArray(data)) return;

      const currentDriver = data.find(
        (driver) => Number(driver.user_id || driver.id) === Number(ride?.driver)
      );

      if (!currentDriver) return;

      if (currentDriver.lat && currentDriver.lng) {
        setDriverPosition([
          parseFloat(currentDriver.lat),
          parseFloat(currentDriver.lng),
        ]);
      }
    } catch (error) {
      console.log("Live tracking error:", error);
    }
  };

  useEffect(() => {
    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={containerStyle}>
      <h2 style={titleStyle}>📍 Live Ride Tracking</h2>

      <MapContainer
        center={driverPosition}
        zoom={13}
        style={mapStyle}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Rider */}
        <Marker position={riderPosition}>
          <Popup>🚖 Rider Pickup</Popup>
        </Marker>

        {/* Driver */}
        <Marker position={driverPosition}>
          <Popup>🚗 Driver Live Location</Popup>
        </Marker>

        {/* Destination */}
        <Marker position={destination}>
          <Popup>📍 Destination</Popup>
        </Marker>

        {/* Route */}
        <Polyline
          positions={[
            riderPosition,
            driverPosition,
            destination,
          ]}
          color="blue"
        />
      </MapContainer>
    </div>
  );
}

const containerStyle = {
  marginTop: "25px",
  background: "white",
  padding: "20px",
  borderRadius: "18px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
};

const titleStyle = {
  marginTop: 0,
  color: "#111827",
};

const mapStyle = {
  width: "100%",
  height: "500px",
  borderRadius: "16px",
};

export default LiveRideTracking;
