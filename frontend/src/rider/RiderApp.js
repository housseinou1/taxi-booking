import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL, WS_URL, authFetch } from "../apiConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import { MARKET, calculateFare, formatMoney } from "../marketConfig";

function RiderApp() {
  const [pickup, setPickup] = useState(MARKET.defaultPickup.label);
  const [destination, setDestination] = useState(MARKET.defaultDestination.label);
  const [distance, setDistance] = useState(5);
  const [selectedRide, setSelectedRide] = useState("regular");
  const [currentRide, setCurrentRide] = useState(null);
  const [loading, setLoading] = useState(false);

  const pickupPosition = MARKET.defaultPickup.position;
  const destinationPosition = MARKET.defaultDestination.position;

  const getToken = () => localStorage.getItem("access");

  const estimatedFare = useMemo(
    () => calculateFare(selectedRide, distance),
    [selectedRide, distance]
  );

  const fetchCurrentRide = useCallback(async () => {
    try {
      const token = getToken();

      if (!token) return;

      const response = await authFetch(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !Array.isArray(data)) return;

      const activeRide = data.find(
        (ride) =>
          ride.status === "requested" ||
          ride.status === "pending" ||
          ride.status === "accepted" ||
          ride.status === "driver_arriving" ||
          ride.status === "in_progress" ||
          ride.status === "completed"
      );

      setCurrentRide(activeRide || null);
    } catch (error) {
      console.error("Fetch current ride error:", error);
    }
  }, []);

  useEffect(() => {
    fetchCurrentRide();

    const interval = setInterval(fetchCurrentRide, 4000);

    const socket = new WebSocket(WS_URL);

    socket.onmessage = () => {
      fetchCurrentRide();
    };

    socket.onerror = (error) => {
      console.log("Rider WebSocket error:", error);
    };

    return () => {
      clearInterval(interval);
      socket.close();
    };
  }, [fetchCurrentRide]);

  const requestRide = async () => {
    try {
      setLoading(true);

      const token = getToken();

      if (!token) {
        alert("Please login again.");
        return;
      }

      const response = await authFetch(`${API_URL}/rides/request/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup,
          destination,
          pickup_lat: pickupPosition[0],
          pickup_lng: pickupPosition[1],
          destination_lat: destinationPosition[0],
          destination_lng: destinationPosition[1],
          distance_km: Number(distance),
          ride_type: selectedRide,
          fare: estimatedFare,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || data.error || "Ride request failed");
        return;
      }

      alert("Ride requested 🚕");
      setCurrentRide(data);
      fetchCurrentRide();
    } catch (error) {
      console.error("Ride request error:", error);
      alert("Server error");
    } finally {
      setLoading(false);
    }
  };

  const cancelRide = async () => {
    if (!currentRide?.id) return;

    try {
      const token = getToken();

      const response = await authFetch(
        `${API_URL}/rides/cancel/${currentRide.id}/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || data.error || "Could not cancel ride");
        return;
      }

      alert("Ride cancelled");
      setCurrentRide(null);
      fetchCurrentRide();
    } catch (error) {
      console.error("Cancel ride error:", error);
      alert("Server error");
    }
  };

  const getStatusText = () => {
    if (!currentRide) return "";

    if (currentRide.status === "requested" || currentRide.status === "pending") {
      return "Searching for driver...";
    }

    if (currentRide.status === "accepted" || currentRide.status === "driver_arriving") {
      return "🚕 Driver is arriving";
    }

    if (currentRide.status === "in_progress") {
      return "🚘 Ride in progress";
    }

    if (currentRide.status === "completed") {
      return "✅ Ride completed";
    }

    if (currentRide.status === "cancelled") {
      return "❌ Ride cancelled";
    }

    return currentRide.status;
  };

  return (
    <div style={pageStyle}>
      <div style={mapWrapperStyle}>
        <GoogleTripMap
          center={pickupPosition}
          zoom={13}
          style={mapStyle}
          fitPoints={[pickupPosition, destinationPosition]}
          markers={[
            {
              id: "pickup",
              position: pickupPosition,
              title: `Pickup: ${pickup}`,
              label: "P",
            },
            {
              id: "destination",
              position: destinationPosition,
              title: `Destination: ${destination}`,
              label: "G",
            },
          ]}
          polylines={[
            {
              id: "trip-route",
              path: [pickupPosition, destinationPosition],
              color: "#111827",
              weight: 4,
              opacity: 0.8,
            },
          ]}
        />
      </div>

      <div style={contentStyle}>
        <button
          onClick={() => (window.location.href = "/rider-dashboard")}
          style={dashboardButtonStyle}
        >
          My Rides / Ratings
        </button>

        <h1 style={titleStyle}>Where to?</h1>

        <input
          value={pickup}
          onChange={(e) => setPickup(e.target.value)}
          placeholder="Pickup"
          style={inputStyle}
        />

        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination"
          style={inputStyle}
        />

        <label style={labelStyle}>Distance (KM)</label>
        <input
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          type="number"
          min="1"
          style={inputStyle}
        />

        <h3>Choose your ride</h3>
        <div style={farePreviewStyle}>
          Estimated Fare: {formatMoney(estimatedFare)}
        </div>

        <div style={rideGridStyle}>
          <button
            onClick={() => setSelectedRide("regular")}
            style={{
              ...rideButtonStyle,
              background: selectedRide === "regular" ? "#111827" : "#f3f4f6",
              color: selectedRide === "regular" ? "white" : "#111827",
            }}
          >
            🚕 Regular
          </button>

          <button
            onClick={() => setSelectedRide("xl")}
            style={{
              ...rideButtonStyle,
              background: selectedRide === "xl" ? "#111827" : "#f3f4f6",
              color: selectedRide === "xl" ? "white" : "#111827",
            }}
          >
            🚕 XL
          </button>

          <button
            onClick={() => setSelectedRide("comfort")}
            style={{
              ...rideButtonStyle,
              background: selectedRide === "comfort" ? "#111827" : "#f3f4f6",
              color: selectedRide === "comfort" ? "white" : "#111827",
            }}
          >
            🚕 Comfort
          </button>

          <button
            onClick={() => setSelectedRide("share")}
            style={{
              ...rideButtonStyle,
              background: selectedRide === "share" ? "#111827" : "#f3f4f6",
              color: selectedRide === "share" ? "white" : "#111827",
            }}
          >
            🚕 Share
          </button>
        </div>

        {!currentRide && (
          <button
            onClick={requestRide}
            disabled={loading}
            style={confirmButtonStyle}
          >
            {loading
              ? "Requesting..."
              : `Confirm ${selectedRide.charAt(0).toUpperCase() + selectedRide.slice(1)}`}
          </button>
        )}

        {currentRide && (
          <>
            <div style={statusBoxStyle}>{getStatusText()}</div>

            {currentRide.status !== "completed" &&
              currentRide.status !== "cancelled" && (
                <button onClick={cancelRide} style={cancelButtonStyle}>
                  Cancel Ride
                </button>
              )}
          </>
        )}

        {currentRide?.driver_name && (
          <div style={driverCardStyle}>
            <h3>🚖 Your Driver</h3>

            {currentRide.driver_picture ? (
              <img
                src={currentRide.driver_picture}
                alt="Driver"
                style={driverImageStyle}
              />
            ) : (
              <div style={driverPlaceholderStyle}>👤</div>
            )}

            <p>
              <strong>Name:</strong> {currentRide.driver_name}
            </p>

            <p>
              <strong>Email:</strong> {currentRide.driver_email}
            </p>

            <p>
              <strong>Private call:</strong>{" "}
              <a href={`tel:${currentRide.driver_phone}`} style={{ color: "#2563eb", fontWeight: "bold" }}>
                {currentRide.private_call_number || currentRide.driver_phone}
              </a>
            </p>

            <p>
              <strong>Vehicle:</strong> {currentRide.vehicle}
            </p>

            <p>
              <strong>Plate:</strong> {currentRide.plate_number}
            </p>

            <p>
              <strong>Member since:</strong>{" "}
              {currentRide.driver_member_since_year || "N/A"}
            </p>

            <p>
              <strong>Years using app:</strong>{" "}
              {currentRide.driver_years_using_app || 0}
            </p>

            <p>
              <strong>Rating:</strong> ⭐ {currentRide.driver_rating || 0}
            </p>

            <p>
              <strong>Completed Trips:</strong>{" "}
              {currentRide.completed_trips || 0}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#ffffff",
  fontFamily: "Arial, sans-serif",
};

const mapWrapperStyle = {
  width: "100%",
  height: "170px",
};

const mapStyle = {
  width: "100%",
  height: "100%",
};

const contentStyle = {
  position: "relative",
  padding: "22px",
};

const dashboardButtonStyle = {
  position: "absolute",
  top: "20px",
  right: "22px",
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: "12px",
  padding: "12px 18px",
  fontWeight: "bold",
  cursor: "pointer",
};

const titleStyle = {
  fontSize: "38px",
  marginTop: 0,
  color: "#111827",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "12px",
  borderRadius: "12px",
  border: "1px solid #e5e7eb",
  background: "#f3f4f6",
};

const labelStyle = {
  fontWeight: "bold",
  display: "block",
  marginBottom: "8px",
};

const rideGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "12px",
};

const farePreviewStyle = {
  marginBottom: "12px",
  background: "#ecfdf5",
  color: "#065f46",
  padding: "12px",
  borderRadius: "12px",
  textAlign: "center",
  fontWeight: "bold",
};

const rideButtonStyle = {
  padding: "14px",
  borderRadius: "12px",
  border: "none",
  fontWeight: "bold",
  cursor: "pointer",
};

const confirmButtonStyle = {
  width: "100%",
  marginTop: "16px",
  padding: "16px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const statusBoxStyle = {
  marginTop: "18px",
  background: "#dbeafe",
  color: "#1e3a8a",
  padding: "14px",
  borderRadius: "12px",
  textAlign: "center",
  fontWeight: "bold",
};

const cancelButtonStyle = {
  width: "100%",
  marginTop: "12px",
  padding: "14px",
  borderRadius: "12px",
  border: "none",
  background: "#dc2626",
  color: "white",
  fontWeight: "bold",
  cursor: "pointer",
};

const driverCardStyle = {
  background: "#ecfdf5",
  padding: "18px",
  borderRadius: "16px",
  marginTop: "18px",
};

const driverImageStyle = {
  width: "95px",
  height: "95px",
  borderRadius: "50%",
  objectFit: "cover",
  border: "3px solid #16a34a",
  marginBottom: "12px",
};

const driverPlaceholderStyle = {
  width: "95px",
  height: "95px",
  borderRadius: "50%",
  background: "#d1fae5",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "40px",
  marginBottom: "12px",
};

export default RiderApp;
