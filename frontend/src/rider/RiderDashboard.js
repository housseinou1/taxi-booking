import React, { useEffect, useState } from "react";
import LiveMap from "../maps/LiveMap";
import NotificationBox from "../components/NotificationBox";

function RiderDashboard() {
  const API_URL = "http://127.0.0.1:8000";

  const [driverOnline, setDriverOnline] = useState(false);

  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [carType, setCarType] = useState("regular");

  const [distance, setDistance] = useState(0);
  const [fare, setFare] = useState(0);

  const [rideId, setRideId] = useState(localStorage.getItem("currentRideId"));
  const [currentRide, setCurrentRide] = useState(null);

  const [notification, setNotification] = useState("");

  const getAuthHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  });

  const fetchDriverStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/drivers/status/`);
      const data = await res.json();

      setDriverOnline(Boolean(data.online));
    } catch (error) {
      console.log(error);
    }
  };

  const checkRideStatus = async () => {
    if (!rideId) return;

    try {
      const res = await fetch(`${API_URL}/rides/history/`, {
  headers: {
    Authorization: `Bearer ${localStorage.getItem("access")}`,
  },
})
      const rides = await res.json();

      if (!Array.isArray(rides)) return;

      const ride = rides.find((item) => Number(item.id) === Number(rideId));

      if (!ride) return;

      setCurrentRide(ride);

      if (ride.status === "accepted") {
        setNotification("Driver accepted your ride ✅");
      }

      if (ride.status === "in_progress") {
        setNotification("Your ride has started 🚖");
      }

      if (ride.status === "completed") {
        setNotification("Ride completed ✅ Please pay");
        localStorage.removeItem("currentRideId");
      }

      if (ride.status === "cancelled") {
        setNotification("Ride cancelled 🚫");
        localStorage.removeItem("currentRideId");
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchDriverStatus();
    checkRideStatus();

    const interval = setInterval(() => {
      fetchDriverStatus();
      checkRideStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [rideId]);

  const getBaseFare = () => {
    if (carType === "comfort") return 250;
    if (carType === "xl") return 400;
    return 150;
  };

  const calculateFare = () => {
    if (!pickup || !destination) {
      alert("Please enter pickup and destination");
      return;
    }

    const randomDistance = Math.floor(Math.random() * 15) + 1;
    const baseFare = getBaseFare();
    const calculatedFare = baseFare + randomDistance * 20;

    setDistance(randomDistance);
    setFare(calculatedFare);
  };

  const requestRide = async () => {
    const token = localStorage.getItem("access");

    if (!token) {
      alert("Please login first");
      window.location.href = "/login";
      return;
    }

    if (!pickup || !destination) {
      alert("Please enter pickup and destination");
      return;
    }

    if (!fare || fare <= 0) {
      alert("Please calculate fare first");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/rides/create/`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          pickup_address: pickup,
          destination_address: destination,
          car_type: carType,
          pickup_lat: Math.random() * 0.05 + 18.0735,
          pickup_lng: -15.9582 + Math.random() * 0.05,
          destination_lat: Math.random() * 0.05 + 18.0896,
          destination_lng: -15.9754 + Math.random() * 0.05,
          fare,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const newRideId = data.ride.id;

        localStorage.setItem("currentRideId", newRideId);

        setRideId(newRideId);
        setCurrentRide(data.ride);
        setNotification("Ride requested successfully 🚕");
      } else {
        alert(JSON.stringify(data));
      }
    } catch (error) {
      console.log(error);
      alert("Server error");
    }
  };

  const cancelRide = async () => {
    if (!rideId) {
      alert("No active ride to cancel");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/rides/cancel/${rideId}/`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      const data = await res.json();

      if (res.ok) {
        setNotification("Ride cancelled 🚫");
        localStorage.removeItem("currentRideId");
        setCurrentRide(data.ride);
      } else {
        alert(data.error || "Could not cancel ride");
      }
    } catch (error) {
      console.log(error);
      alert("Server error");
    }
  };

  const startNewRide = () => {
    localStorage.removeItem("currentRideId");

    setPickup("");
    setDestination("");
    setCarType("regular");
    setDistance(0);
    setFare(0);
    setRideId(null);
    setCurrentRide(null);
    setNotification("");
  };

  const goToPayment = () => {
    if (currentRide?.id) {
      localStorage.setItem("currentRideId", currentRide.id);
    }

    window.location.href = "/payment";
  };

  const getRideStatusBox = () => {
    if (!currentRide) return null;

    if (currentRide.status === "pending") {
      return (
        <div style={blueBox}>
          Waiting for driver acceptance... 🚕
          <button onClick={cancelRide} style={cancelButton}>
            Cancel Ride 🚫
          </button>
        </div>
      );
    }

    if (currentRide.status === "accepted") {
      return (
        <div style={greenBox}>
          Driver accepted your ride ✅ Driver is coming to pickup.
          <button onClick={cancelRide} style={cancelButton}>
            Cancel Ride 🚫
          </button>
        </div>
      );
    }

    if (currentRide.status === "in_progress") {
      return (
        <div style={greenBox}>
          Ride in progress 🚖 Enjoy your trip.
        </div>
      );
    }

    if (currentRide.status === "completed") {
      return (
        <div style={greenBox}>
          Ride completed ✅
          <button onClick={goToPayment} style={paymentButton}>
            Pay Ride 💳
          </button>
          <button onClick={startNewRide} style={secondaryButton}>
            Start New Ride 🚕
          </button>
        </div>
      );
    }

    if (currentRide.status === "cancelled") {
      return (
        <div style={cancelBox}>
          Ride cancelled 🚫
          <button onClick={startNewRide} style={secondaryButton}>
            Start New Ride 🚕
          </button>
        </div>
      );
    }

    return null;
  };

  const driverImage =
    currentRide && currentRide.driver_picture
      ? `${API_URL}${currentRide.driver_picture}`
      : null;

  return (
    <div style={page}>
      <div style={header}>
        <h1 style={title}>🚖 Sakho Express Rider</h1>
        <p style={subtitle}>Book and track your ride in real time</p>
      </div>

      <NotificationBox message={notification} type="info" />

      <div style={statsGrid}>
        <div style={statCard}>
          <h3>Driver Availability</h3>
          <p
            style={{
              color: driverOnline ? "green" : "red",
              fontWeight: "bold",
              fontSize: "20px",
            }}
          >
            {driverOnline ? "Online ✅" : "Offline ❌"}
          </p>
        </div>

        <div style={statCard}>
          <h3>Ride Status</h3>
          <p style={statNumber}>
            {currentRide ? currentRide.status : "No Ride"}
          </p>
        </div>

        <div style={statCard}>
          <h3>Estimated Fare</h3>
          <p style={statNumber}>{fare || currentRide?.fare || 0} MRU</p>
        </div>
      </div>

      <div style={mapCard}>
        <h2>📍 Live Ride Tracking</h2>
        <LiveMap currentRide={currentRide} />
      </div>

      {currentRide && (
        <div style={currentRideCard}>
          <h2>🚕 Current Ride</h2>

          <p>
            <b>Pickup:</b> {currentRide.pickup_address || "N/A"}
          </p>

          <p>
            <b>Destination:</b> {currentRide.destination_address || "N/A"}
          </p>

          <p>
            <b>Status:</b> {currentRide.status}
          </p>

          <p>
            <b>Fare:</b> {currentRide.fare || 0} MRU
          </p>

          {getRideStatusBox()}
        </div>
      )}

      {currentRide && currentRide.driver_first_name && (
        <div style={driverCard}>
          <h2>🚖 Your Driver</h2>

          {driverImage ? (
            <img src={driverImage} alt="Driver" style={driverPhoto} />
          ) : (
            <div style={placeholderPhoto}>👤</div>
          )}

          <p>
            <b>Name:</b> {currentRide.driver_first_name}{" "}
            {currentRide.driver_last_name}
          </p>

          <p>
            <b>Phone:</b> {currentRide.driver_phone || "N/A"}
          </p>

          <p>
            <b>Vehicle:</b> {currentRide.vehicle_make}{" "}
            {currentRide.vehicle_model}
          </p>

          <p>
            <b>Plate:</b> {currentRide.vehicle_plate}
          </p>
        </div>
      )}

      {!currentRide && (
        <div style={card}>
          <h2>Book Your Ride</h2>

          <input
            placeholder="Pickup Location"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            style={inputStyle}
          />

          <input
            placeholder="Destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            style={inputStyle}
          />

          <div style={carTypeBox}>
            <h3>Select Ride Type</h3>

            <div style={rideOptions}>
              <button
                type="button"
                onClick={() => setCarType("regular")}
                style={carType === "regular" ? activeRideButton : rideButton}
              >
                🚕 Regular
                <br />
                150 MRU
              </button>

              <button
                type="button"
                onClick={() => setCarType("comfort")}
                style={carType === "comfort" ? activeRideButton : rideButton}
              >
                🚘 Comfort
                <br />
                250 MRU
              </button>

              <button
                type="button"
                onClick={() => setCarType("xl")}
                style={carType === "xl" ? activeRideButton : rideButton}
              >
                🚐 XL
                <br />
                400 MRU
              </button>
            </div>
          </div>

          <button style={primaryButton} onClick={calculateFare}>
            Calculate Fare 💰
          </button>

          {fare > 0 && (
            <div style={summaryCard}>
              <h3>🚕 Trip Summary</h3>

              <p>
                <b>Pickup:</b> {pickup}
              </p>

              <p>
                <b>Destination:</b> {destination}
              </p>

              <p>
                <b>Ride Type:</b> {carType.toUpperCase()}
              </p>

              <p>
                <b>Distance:</b> {distance} km
              </p>

              <p>
                <b>Estimated Fare:</b> {fare} MRU
              </p>

              <button style={primaryButton} onClick={requestRide}>
                Request Ride 🚕
              </button>

              <button onClick={startNewRide} style={secondaryButton}>
                Reset Ride
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const page = {
  padding: "30px",
  background: "#f5f7fb",
  minHeight: "100vh",
};

const header = {
  marginBottom: "25px",
};

const title = {
  fontSize: "42px",
  fontWeight: "bold",
  color: "#111827",
  margin: 0,
};

const subtitle = {
  color: "#6b7280",
  marginTop: "8px",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "20px",
  marginBottom: "25px",
};

const statCard = {
  background: "white",
  padding: "25px",
  borderRadius: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const statNumber = {
  fontSize: "22px",
  fontWeight: "bold",
  marginTop: "10px",
};

const mapCard = {
  background: "white",
  padding: "20px",
  borderRadius: "20px",
  marginBottom: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const card = {
  background: "white",
  padding: "25px",
  borderRadius: "20px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
};

const currentRideCard = {
  ...card,
  marginBottom: "20px",
};

const driverCard = {
  ...card,
  marginBottom: "20px",
  textAlign: "center",
};

const driverPhoto = {
  width: "120px",
  height: "120px",
  borderRadius: "50%",
  objectFit: "cover",
  marginBottom: "15px",
};

const placeholderPhoto = {
  width: "120px",
  height: "120px",
  borderRadius: "50%",
  background: "#ddd",
  margin: "0 auto 15px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "50px",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginTop: "15px",
  borderRadius: "10px",
  border: "1px solid #d1d5db",
};

const blueBox = {
  marginTop: "20px",
  padding: "15px",
  borderRadius: "12px",
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: "bold",
};

const greenBox = {
  marginTop: "20px",
  padding: "15px",
  borderRadius: "12px",
  background: "#dcfce7",
  color: "green",
  fontWeight: "bold",
};

const cancelBox = {
  marginTop: "20px",
  padding: "15px",
  borderRadius: "12px",
  background: "#fee2e2",
  color: "red",
  fontWeight: "bold",
};

const cancelButton = {
  width: "100%",
  padding: "14px",
  marginTop: "15px",
  border: "none",
  borderRadius: "10px",
  background: "red",
  color: "white",
  cursor: "pointer",
};

const paymentButton = {
  width: "100%",
  padding: "14px",
  marginTop: "15px",
  border: "none",
  borderRadius: "10px",
  background: "black",
  color: "white",
  cursor: "pointer",
};

const primaryButton = {
  width: "100%",
  padding: "14px",
  marginTop: "15px",
  border: "none",
  borderRadius: "10px",
  background: "#111827",
  color: "white",
  cursor: "pointer",
  fontWeight: "bold",
};

const secondaryButton = {
  width: "100%",
  padding: "14px",
  marginTop: "15px",
  border: "none",
  borderRadius: "10px",
  background: "#374151",
  color: "white",
  cursor: "pointer",
};

const carTypeBox = {
  marginTop: "20px",
};

const rideOptions = {
  display: "flex",
  gap: "10px",
  marginTop: "10px",
  marginBottom: "20px",
};

const rideButton = {
  flex: 1,
  padding: "15px",
  borderRadius: "12px",
  border: "1px solid #ccc",
  background: "white",
  cursor: "pointer",
};

const activeRideButton = {
  ...rideButton,
  background: "#111827",
  color: "white",
};

const summaryCard = {
  marginTop: "30px",
  padding: "20px",
  borderRadius: "15px",
  background: "#f9fafc",
};

export default RiderDashboard;