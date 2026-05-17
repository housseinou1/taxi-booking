import React, { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function DriverApp() {
  const API_URL = "http://127.0.0.1:8000";

  const [online, setOnline] = useState(false);
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [rideHistory, setRideHistory] = useState([]);

  const [earnings, setEarnings] = useState({
    gross_amount: 0,
    platform_fees: 0,
    total_earnings: 0,
    completed_payments: 0,
    currency: "MRU",
  });

  const [driverPosition, setDriverPosition] = useState([
    18.0735,
    -15.9582,
  ]);

  const fetchDriverStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/drivers/status/`);
      const data = await res.json();

      if (res.ok) {
        setOnline(Boolean(data.is_online || data.online));
      }
    } catch (error) {
      console.log("Driver status error:", error);
    }
  };

  const updateDriverStatus = async (status) => {
    try {
      const res = await fetch(`${API_URL}/drivers/status/update/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          online: status,
          is_online: status,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setOnline(Boolean(data.is_online || data.online));
      }
    } catch (error) {
      console.log("Update status error:", error);
    }
  };

  const updateDriverLocationBackend = async (lat, lng) => {
    try {
      await fetch(`${API_URL}/drivers/location/update/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lat, lng }),
      });
    } catch (error) {
      console.log("Location update error:", error);
    }
  };

  const goOnline = () => {
    updateDriverStatus(true);

    if (!navigator.geolocation) return;

    navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setDriverPosition([lat, lng]);
        updateDriverLocationBackend(lat, lng);
      },
      (error) => {
        console.log("GPS error:", error);
      }
    );
  };

  const goOffline = () => {
    updateDriverStatus(false);
  };

  const fetchAvailableRides = async () => {
    try {
      const res = await fetch(`${API_URL}/rides/available/`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setRides(data);
      }
    } catch (error) {
      console.log("Available rides error:", error);
    }
  };

  const fetchDriverEarnings = async () => {
    try {
      const res = await fetch(`${API_URL}/payments/driver/earnings/`);
      const data = await res.json();

      if (res.ok) {
        setEarnings(data);
      }
    } catch (error) {
      console.log("Earnings error:", error);
    }
  };

  const fetchRideHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/rides/history/`);
      const data = await res.json();

      if (Array.isArray(data)) {
        const completed = data.filter((ride) => ride.status === "completed");
        setRideHistory(completed);
      }
    } catch (error) {
      console.log("Ride history error:", error);
    }
  };

  const loadActiveRide = async () => {
    const rideId = localStorage.getItem("activeRideId");

    if (!rideId) return;

    try {
      const res = await fetch(`${API_URL}/rides/${rideId}/`);
      const data = await res.json();

      if (res.ok) {
        const savedRide = data.ride || data;

        if (
          savedRide.status === "accepted" ||
          savedRide.status === "driver_arriving" ||
          savedRide.status === "in_progress"
        ) {
          setActiveRide(savedRide);
        } else {
          localStorage.removeItem("activeRideId");
          setActiveRide(null);
        }
      }
    } catch (error) {
      console.log("Load active ride error:", error);
    }
  };

  const acceptRide = async (rideId) => {
    try {
      const res = await fetch(`${API_URL}/rides/${rideId}/accept/`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setActiveRide(data.ride);
        localStorage.setItem("activeRideId", data.ride.id);

        setRides((prev) => prev.filter((ride) => ride.id !== rideId));

        alert("Ride Accepted ✅");
      } else {
        alert(data.error || "Could not accept ride");
      }
    } catch (error) {
      console.log("Accept ride error:", error);
    }
  };

  const driverArriving = async () => {
    if (!activeRide) return;

    try {
      const res = await fetch(`${API_URL}/rides/${activeRide.id}/arriving/`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setActiveRide(data.ride);
        localStorage.setItem("activeRideId", data.ride.id);

        alert("Driver is arriving 📍");
      } else {
        alert(data.error || "Could not update ride");
      }
    } catch (error) {
      console.log("Driver arriving error:", error);
    }
  };

  const startRide = async () => {
    if (!activeRide) return;

    try {
      const res = await fetch(`${API_URL}/rides/${activeRide.id}/start/`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setActiveRide(data.ride);
        localStorage.setItem("activeRideId", data.ride.id);
      } else {
        alert(data.error || "Could not start ride");
      }
    } catch (error) {
      console.log("Start ride error:", error);
    }
  };

  const completeRide = async () => {
    if (!activeRide) return;

    try {
      const res = await fetch(`${API_URL}/rides/${activeRide.id}/complete/`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        alert("Ride Completed ✅");

        setActiveRide(null);
        localStorage.removeItem("activeRideId");

        fetchAvailableRides();
        fetchDriverEarnings();
        fetchRideHistory();
      } else {
        alert(data.error || "Could not complete ride");
      }
    } catch (error) {
      console.log("Complete ride error:", error);
    }
  };

  useEffect(() => {
    fetchDriverStatus();
    fetchAvailableRides();
    fetchDriverEarnings();
    fetchRideHistory();
    loadActiveRide();

    const interval = setInterval(() => {
      fetchDriverStatus();
      fetchAvailableRides();
      fetchDriverEarnings();
      fetchRideHistory();
      loadActiveRide();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={page}>
      <div style={topBar}>
        <div>
          <h1 style={logo}>🚖 Sakho Express Driver</h1>
          <p style={subtitle}>Professional Driver Dashboard</p>
        </div>

        {!online ? (
          <button style={onlineBtn} onClick={goOnline}>
            Go Online
          </button>
        ) : (
          <button style={offlineBtn} onClick={goOffline}>
            Go Offline
          </button>
        )}
      </div>

      <div style={statsGrid}>
        <div style={statCard}>
          <h3>Driver Status</h3>
          <p style={online ? onlineText : offlineText}>
            {online ? "Online ✅" : "Offline ❌"}
          </p>
        </div>

        <div style={statCard}>
          <h3>New Ride Requests</h3>
          <p style={statNumber}>{rides.length}</p>
        </div>

        <div style={statCard}>
          <h3>Active Rides</h3>
          <p style={statNumber}>{activeRide ? 1 : 0}</p>
        </div>

        <div style={statCard}>
          <h3>Completed Rides</h3>
          <p style={statNumber}>{rideHistory.length}</p>
        </div>

        <div style={statCard}>
          <h3>Today Earnings</h3>
          <p style={statNumber}>
            {Number(earnings.total_earnings || 0).toFixed(2)} MRU
          </p>
        </div>

        <div style={statCard}>
          <h3>Total Earnings</h3>
          <p style={statNumber}>
            {Number(earnings.total_earnings || 0).toFixed(2)} MRU
          </p>
        </div>
      </div>

      <div style={mapCard}>
        <h2>📍 Driver Live Map</h2>

        <MapContainer
          center={driverPosition}
          zoom={13}
          style={{
            height: "300px",
            width: "100%",
            borderRadius: "16px",
          }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={driverPosition}>
            <Popup>Your Location</Popup>
          </Marker>
        </MapContainer>
      </div>

      {activeRide && (
        <div style={activeRideCard}>
          <h2>🚕 Active Ride</h2>

          <p>
            <b>Ride ID:</b> {activeRide.id}
          </p>

          <p>
            <b>Pickup:</b> {activeRide.pickup_lat}, {activeRide.pickup_lng}
          </p>

          <p>
            <b>Destination:</b>{" "}
            {activeRide.destination_lat}, {activeRide.destination_lng}
          </p>

          <p>
            <b>Type:</b> {activeRide.ride_type || "regular"}
          </p>

          <p>
            <b>Price:</b> {activeRide.estimated_price || 0} MRU
          </p>

          <p>
            <b>Status:</b> {activeRide.status}
          </p>

          {activeRide.status === "accepted" && (
            <button style={startBtn} onClick={driverArriving}>
              Driver Arriving 📍
            </button>
          )}

          {activeRide.status === "driver_arriving" && (
            <button style={startBtn} onClick={startRide}>
              Start Ride 🚖
            </button>
          )}

          {activeRide.status === "in_progress" && (
            <button style={completeBtn} onClick={completeRide}>
              Complete Ride ✅
            </button>
          )}
        </div>
      )}

      <div style={requestsCard}>
        <h2>🚕 New Ride Requests</h2>

        {rides.length === 0 ? (
          <p>No new ride requests</p>
        ) : (
          rides.map((ride) => (
            <div key={ride.id} style={rideCard}>
              <p>
                <b>Ride ID:</b> {ride.id}
              </p>

              <p>
                <b>Pickup:</b> {ride.pickup_lat}, {ride.pickup_lng}
              </p>

              <p>
                <b>Destination:</b>{" "}
                {ride.destination_lat}, {ride.destination_lng}
              </p>

              <p>
                <b>Type:</b> {ride.ride_type || "regular"}
              </p>

              <p>
                <b>Price:</b> {ride.estimated_price || 0} MRU
              </p>

              <button style={acceptBtn} onClick={() => acceptRide(ride.id)}>
                Accept Ride ✅
              </button>
            </div>
          ))
        )}
      </div>

      <div style={historyCard}>
        <h2>📜 Ride History</h2>

        {rideHistory.length === 0 ? (
          <p>No completed rides yet</p>
        ) : (
          rideHistory.map((ride) => (
            <div key={ride.id} style={historyItem}>
              <p>
                <b>Ride ID:</b> {ride.id}
              </p>

              <p>
                <b>Type:</b> {ride.ride_type || "regular"}
              </p>

              <p>
                <b>Price:</b> {ride.estimated_price || 0} MRU
              </p>

              <p>
                <b>Pickup:</b> {ride.pickup_lat}, {ride.pickup_lng}
              </p>

              <p>
                <b>Destination:</b>{" "}
                {ride.destination_lat}, {ride.destination_lng}
              </p>

              <p>
                <b>Status:</b> {ride.status}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const page = {
  padding: "24px",
  background: "#f4f6f9",
  minHeight: "100vh",
};

const topBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "30px",
};

const logo = {
  fontSize: "52px",
  fontWeight: "bold",
};

const subtitle = {
  color: "#666",
};

const onlineBtn = {
  background: "#16a34a",
  color: "white",
  border: "none",
  padding: "14px 26px",
  borderRadius: "12px",
  cursor: "pointer",
};

const offlineBtn = {
  background: "#dc2626",
  color: "white",
  border: "none",
  padding: "14px 26px",
  borderRadius: "12px",
  cursor: "pointer",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(6, 1fr)",
  gap: "16px",
  marginBottom: "24px",
};

const statCard = {
  background: "white",
  borderRadius: "18px",
  padding: "24px",
};

const statNumber = {
  fontSize: "24px",
  fontWeight: "bold",
};

const onlineText = {
  color: "green",
  fontWeight: "bold",
};

const offlineText = {
  color: "red",
  fontWeight: "bold",
};

const mapCard = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  marginBottom: "24px",
};

const requestsCard = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  marginBottom: "24px",
};

const rideCard = {
  border: "1px solid #ddd",
  padding: "16px",
  borderRadius: "14px",
  marginBottom: "16px",
};

const activeRideCard = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  marginBottom: "24px",
};

const historyCard = {
  background: "white",
  borderRadius: "18px",
  padding: "20px",
  marginBottom: "24px",
};

const historyItem = {
  border: "1px solid #ddd",
  padding: "16px",
  borderRadius: "14px",
  marginBottom: "16px",
  background: "#f9fafb",
};

const acceptBtn = {
  background: "#16a34a",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: "10px",
  cursor: "pointer",
};

const startBtn = {
  background: "#2563eb",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: "10px",
  cursor: "pointer",
};

const completeBtn = {
  background: "#16a34a",
  color: "white",
  border: "none",
  padding: "12px 20px",
  borderRadius: "10px",
  cursor: "pointer",
};

export default DriverApp;