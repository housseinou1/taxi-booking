import React, { useEffect, useState } from "react";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function RiderApp() {
  const API_URL = "http://127.0.0.1:8000";

  const [rideType, setRideType] = useState("regular");
  const [ride, setRide] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState("");

  const ridePrices = {
    regular: 200,
    xl: 300,
    comfort: 350,
    share: 25,
  };

  const pickup = [18.0735, -15.9582];
  const destination = [18.0896, -15.9754];

  const selectedPrice = ridePrices[rideType];

  const getStatusText = (status) => {
    if (status === "requested") return "Waiting for driver ⏳";
    if (status === "accepted") return "Driver Accepted ✅";
    if (status === "driver_arriving") return "Driver Arriving 📍";
    if (status === "in_progress") return "Trip Started 🚖";
    if (status === "completed") return "Trip Completed ✅";
    if (status === "cancelled") return "Ride Cancelled ❌";
    return status;
  };

  const fetchRideStatus = async (rideId) => {
    try {
      const res = await fetch(`${API_URL}/rides/${rideId}/`);
      const data = await res.json();

      if (res.ok) {
        setRide(data.ride || data);
      }
    } catch (error) {
      console.log("Ride status error:", error);
    }
  };

  const loadCurrentRide = async () => {
    const rideId = localStorage.getItem("currentRideId");

    if (!rideId) return;

    await fetchRideStatus(rideId);
  };

  const requestRide = async () => {
    try {
      const res = await fetch(`${API_URL}/rides/request/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickup_lat: pickup[0],
          pickup_lng: pickup[1],
          destination_lat: destination[0],
          destination_lng: destination[1],
          ride_type: rideType,
          estimated_price: selectedPrice,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        const newRide = data.ride || data;

        setRide(newRide);
        setPaymentStatus("");

        localStorage.setItem("currentRideId", newRide.id);

        alert("Ride requested successfully 🚖");
      } else {
        alert(data.error || "Could not request ride");
      }
    } catch (error) {
      console.log(error);
      alert("Server error");
    }
  };

  const payRide = async () => {
    if (!ride) {
      alert("No ride to pay");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/payments/create-test/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ride_id: ride.id,
          amount: ride.estimated_price || selectedPrice,
          method: "test",
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPaymentStatus("Paid ✅");
        localStorage.removeItem("currentRideId");
        alert("Payment successful 💳");
      } else {
        alert(data.error || "Payment failed");
      }
    } catch (error) {
      console.log(error);
      alert("Payment server error");
    }
  };

  useEffect(() => {
    loadCurrentRide();
  }, []);

  useEffect(() => {
    let interval;

    if (ride?.id) {
      interval = setInterval(() => {
        fetchRideStatus(ride.id);
      }, 3000);
    }

    return () => clearInterval(interval);
  }, [ride?.id]);

  return (
    <div style={page}>
      <h1 style={title}>🚖 Sakho Express Rider</h1>

      <div style={container}>
        <div>
          <div style={card}>
            <h2>Select Ride Type</h2>

            <div style={options}>
              <button
                style={rideType === "regular" ? activeBtn : btn}
                onClick={() => setRideType("regular")}
              >
                Regular - 200 MRU
              </button>

              <button
                style={rideType === "xl" ? activeBtn : btn}
                onClick={() => setRideType("xl")}
              >
                XL - 300 MRU
              </button>

              <button
                style={rideType === "comfort" ? activeBtn : btn}
                onClick={() => setRideType("comfort")}
              >
                Comfort - 350 MRU
              </button>

              <button
                style={rideType === "share" ? activeBtn : btn}
                onClick={() => setRideType("share")}
              >
                Share - 25 MRU
              </button>
            </div>

            <div style={priceBox}>
              <h3>Selected Price: {selectedPrice} MRU</h3>
            </div>

            <button style={requestBtn} onClick={requestRide}>
              Request Ride 🚖
            </button>
          </div>

          {ride && (
            <div style={rideCard}>
              <h2>My Ride</h2>

              <p>
                <b>Ride ID:</b> {ride.id}
              </p>

              <p>
                <b>Status:</b> {getStatusText(ride.status)}
              </p>

              <p>
                <b>Type:</b> {ride.ride_type || rideType}
              </p>

              <p>
                <b>Price:</b> {ride.estimated_price || selectedPrice} MRU
              </p>

              <p>
                <b>Payment:</b> {paymentStatus || "Pending"}
              </p>

              {ride.status === "completed" && paymentStatus !== "Paid ✅" && (
                <button style={payBtn} onClick={payRide}>
                  Pay Ride 💳
                </button>
              )}
            </div>
          )}
        </div>

        <div style={mapCard}>
          <h2>🗺️ Live Ride Map</h2>

          <MapContainer center={pickup} zoom={13} style={mapStyle}>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Marker position={pickup}>
              <Popup>Pickup Location</Popup>
            </Marker>

            <Marker position={destination}>
              <Popup>Destination</Popup>
            </Marker>

            <Polyline positions={[pickup, destination]} />
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#f5f7fb",
  padding: "30px",
};

const title = {
  fontSize: "52px",
  marginBottom: "30px",
};

const container = {
  display: "flex",
  gap: "30px",
  alignItems: "flex-start",
};

const card = {
  width: "420px",
  background: "white",
  padding: "30px",
  borderRadius: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  marginBottom: "20px",
};

const rideCard = {
  width: "420px",
  background: "white",
  padding: "30px",
  borderRadius: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

const mapCard = {
  flex: 1,
  background: "white",
  padding: "20px",
  borderRadius: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
};

const mapStyle = {
  width: "100%",
  height: "600px",
  borderRadius: "16px",
};

const options = {
  display: "flex",
  flexDirection: "column",
  gap: "15px",
  marginTop: "20px",
};

const btn = {
  padding: "16px",
  borderRadius: "12px",
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  fontSize: "16px",
};

const activeBtn = {
  padding: "16px",
  borderRadius: "12px",
  border: "2px solid #16a34a",
  background: "#dcfce7",
  cursor: "pointer",
  fontSize: "16px",
};

const requestBtn = {
  marginTop: "30px",
  width: "100%",
  padding: "18px",
  border: "none",
  borderRadius: "14px",
  background: "#16a34a",
  color: "white",
  fontSize: "18px",
  cursor: "pointer",
};

const payBtn = {
  marginTop: "20px",
  width: "100%",
  padding: "16px",
  border: "none",
  borderRadius: "14px",
  background: "#2563eb",
  color: "white",
  fontSize: "18px",
  cursor: "pointer",
};

const priceBox = {
  marginTop: "25px",
};

export default RiderApp;