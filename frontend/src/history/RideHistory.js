import React, { useEffect, useState } from "react";

function RideHistory() {
  const API_URL = "http://127.0.0.1:8000";

  const [rides, setRides] = useState([]);

  const fetchRideHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/rides/history/`);
      const data = await res.json();

      if (Array.isArray(data)) {
        setRides(data);
      }
    } catch (error) {
      console.error("Ride history error:", error);
    }
  };

  useEffect(() => {
    fetchRideHistory();
  }, []);

  const getStatusStyle = (status) => {
    if (status === "completed") return completedStyle;
    if (status === "cancelled") return cancelledStyle;
    if (status === "accepted") return acceptedStyle;
    return pendingStyle;
  };

  const getPaymentStyle = (paymentStatus) => {
    if (paymentStatus === "paid") return paidStyle;
    return unpaidStyle;
  };

  const formatDate = (dateValue) => {
    if (!dateValue) return "N/A";
    return new Date(dateValue).toLocaleString();
  };

  return (
    <div className="page-container">
      <h1>📋 Ride History</h1>

      <div className="card">
        {rides.length === 0 ? (
          <p>No rides yet.</p>
        ) : (
          rides.map((ride) => (
            <div key={ride.id} style={rideCard}>
              <div style={badgeRow}>
                <div style={getStatusStyle(ride.status)}>
                  {ride.status.toUpperCase()}
                </div>

                <div style={getPaymentStyle(ride.payment_status)}>
                  {ride.payment_status === "paid"
                    ? "PAID ✅"
                    : "UNPAID ❌"}
                </div>
              </div>

              <p>
                <b>Ride ID:</b> {ride.id}
              </p>

              <p>
                <b>Pickup:</b> {ride.pickup_address || "No pickup address"}
              </p>

              <p>
                <b>Destination:</b>{" "}
                {ride.destination_address || "No destination"}
              </p>

              <p>
                <b>Driver:</b>{" "}
                {ride.driver_first_name
                  ? `${ride.driver_first_name} ${ride.driver_last_name}`
                  : "No driver assigned"}
              </p>

              <p>
                <b>Vehicle:</b>{" "}
                {ride.vehicle_make
                  ? `${ride.vehicle_make} ${ride.vehicle_model}`
                  : "N/A"}
              </p>

              <p>
                <b>Plate:</b> {ride.vehicle_plate || "N/A"}
              </p>

              <p>
                <b>Fare:</b> ${ride.fare ? ride.fare : "25.00"}
              </p>

              <p>
                <b>Payment Status:</b>{" "}
                {ride.payment_status === "paid" ? "Paid ✅" : "Unpaid ❌"}
              </p>

              <p>
                <b>Payment Date:</b> {formatDate(ride.payment_date)}
              </p>

              <p>
                <b>Rating:</b>{" "}
                {ride.rating ? `${ride.rating} ⭐` : "Not rated"}
              </p>

              <p>
                <b>Review:</b> {ride.review || "No review"}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const rideCard = {
  marginTop: "20px",
  padding: "20px",
  borderRadius: "15px",
  background: "#f9fafc",
  border: "1px solid #e5e7eb",
};

const badgeRow = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "15px",
};

const completedStyle = {
  background: "#dcfce7",
  color: "green",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

const cancelledStyle = {
  background: "#fee2e2",
  color: "red",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

const acceptedStyle = {
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

const pendingStyle = {
  background: "#fef9c3",
  color: "#854d0e",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

const paidStyle = {
  background: "#dcfce7",
  color: "green",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

const unpaidStyle = {
  background: "#fee2e2",
  color: "red",
  padding: "8px 14px",
  borderRadius: "10px",
  display: "inline-block",
  fontWeight: "bold",
};

export default RideHistory;