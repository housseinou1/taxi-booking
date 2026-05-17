import React, { useEffect, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function LiveMap({ currentRide }) {
  const API_URL = "http://127.0.0.1:8000";

  const [driverPosition, setDriverPosition] = useState([
    18.0735,
    -15.9582,
  ]);

  const pickup = [
    currentRide?.pickup_lat || 18.0735,
    currentRide?.pickup_lng || -15.9582,
  ];

  const destination = [
    currentRide?.destination_lat || 18.0896,
    currentRide?.destination_lng || -15.9754,
  ];

  useEffect(() => {
    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchDriverLocation = async () => {
    try {
      const res = await fetch(`${API_URL}/drivers/location/`);
      const data = await res.json();

      if (data.lat && data.lng) {
        setDriverPosition([
          parseFloat(data.lat),
          parseFloat(data.lng),
        ]);
      }
    } catch (err) {
      console.log("Location error");
    }
  };

  return (
    <MapContainer
      center={pickup}
      zoom={13}
      style={{
        height: "500px",
        width: "100%",
        borderRadius: "20px",
      }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* DRIVER */}
      <Marker position={driverPosition}>
        <Popup>🚖 Driver Location</Popup>
      </Marker>

      {/* PICKUP */}
      <Marker position={pickup}>
        <Popup>📍 Pickup</Popup>
      </Marker>

      {/* DESTINATION */}
      <Marker position={destination}>
        <Popup>🏁 Destination</Popup>
      </Marker>

      {/* DRIVER TO PICKUP */}
      <Polyline
        positions={[driverPosition, pickup]}
        color="blue"
      />

      {/* PICKUP TO DESTINATION */}
      <Polyline
        positions={[pickup, destination]}
        color="green"
      />
    </MapContainer>
  );
}

export default LiveMap;