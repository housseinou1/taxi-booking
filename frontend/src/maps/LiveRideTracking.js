import React, { useEffect, useState } from "react";
import { API_URL } from "../apiConfig";

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
      const token = localStorage.getItem("access");
      const driverId = ride?.driver || ride?.driver_id || ride?.driver_user_id;

      if (!token || !driverId) return;

      const response = await fetch(`${API_URL}/drivers/location/${driverId}/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const currentDriver = await response.json();

      if (currentDriver.current_lat && currentDriver.current_lng) {
        setDriverPosition([
          parseFloat(currentDriver.current_lat),
          parseFloat(currentDriver.current_lng),
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
