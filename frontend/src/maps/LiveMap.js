import React, { useEffect, useState } from "react";

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
      map.setView(position, 13);
    }
  }, [position, map]);

  return null;
}

function LiveMap({ currentRide }) {
  const API_URL = "http://127.0.0.1:8000";

  const [driverPosition, setDriverPosition] = useState([
    18.081,
    -15.965,
  ]);

  const pickup = [
    Number(currentRide?.pickup_lat) || 18.0735,
    Number(currentRide?.pickup_lng) || -15.9582,
  ];

  const destination = [
    Number(currentRide?.destination_lat) || 18.0896,
    Number(currentRide?.destination_lng) || -15.9754,
  ];

  const fetchDriverLocation = async () => {
    if (!currentRide?.driver) return;

    try {
      const res = await fetch(`${API_URL}/drivers/list/`);
      const drivers = await res.json();

      const driver = drivers.find(
        (item) => Number(item.id) === Number(currentRide.driver)
      );

      if (driver) {
        const lat = driver.current_lat || driver.driver_lat;
        const lng = driver.current_lng || driver.driver_lng;

        if (lat && lng) {
          setDriverPosition([Number(lat), Number(lng)]);
        }
      }
    } catch (error) {
      console.error("Driver location error:", error);
    }
  };

  useEffect(() => {
    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 3000);

    return () => clearInterval(interval);
  }, [currentRide]);

  const routeLine =
    currentRide?.status === "accepted"
      ? [driverPosition, pickup]
      : [driverPosition, destination];

  return (
    <div style={mapWrapper}>
      <div style={mapHeader}>
        <div>
          <h2 style={{ margin: 0 }}>📍 Live Ride Tracking</h2>
          <p style={mapSubtitle}>
            Status: {currentRide?.status || "No active ride"}
          </p>
        </div>
      </div>

      <MapContainer center={driverPosition} zoom={13} style={mapStyle}>
        <RecenterMap position={driverPosition} />

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={pickup}>
          <Popup>Pickup Location 📍</Popup>
        </Marker>

        <Marker position={driverPosition}>
          <Popup>Driver Live Location 🚕</Popup>
        </Marker>

        <Marker position={destination}>
          <Popup>Destination 🏁</Popup>
        </Marker>

        <Polyline positions={routeLine} />
      </MapContainer>
    </div>
  );
}

const mapWrapper = {
  marginTop: "25px",
  padding: "20px",
  borderRadius: "20px",
  background: "#f9fafc",
};

const mapHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "15px",
};

const mapSubtitle = {
  color: "#6b7280",
  marginTop: "6px",
};

const mapStyle = {
  height: "420px",
  width: "100%",
  borderRadius: "18px",
};

export default LiveMap;