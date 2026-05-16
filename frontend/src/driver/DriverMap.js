import React from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function DriverMap({ lat, lng }) {
  const position = [
    lat ? Number(lat) : 18.0735,
    lng ? Number(lng) : -15.9582,
  ];

  return (
    <div style={mapWrapper}>
      <MapContainer center={position} zoom={13} style={mapStyle}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={position}>
          <Popup>Driver Location 🚕</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

const mapWrapper = {
  width: "100%",
  marginTop: "15px",
};

const mapStyle = {
  height: "350px",
  width: "100%",
  borderRadius: "15px",
};

export default DriverMap;