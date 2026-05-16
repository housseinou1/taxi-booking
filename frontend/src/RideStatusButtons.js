import React from "react";

const API_URL = "http://127.0.0.1:8000";

function RideStatusButtons({ ride, token, onRideUpdated }) {

  const updateRideStatus = async (endpoint) => {
    if (!ride?.id) {
      alert("No ride selected");
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/rides/${ride.id}/${endpoint}/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Something went wrong");
        return;
      }

      if (onRideUpdated) {
        onRideUpdated(data);
      }

      alert(`Ride updated: ${data.status}`);

    } catch (error) {
      console.error(error);
      alert("Server error");
    }
  };

  if (!ride) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px" }}>

      <h3>Status: {ride.status}</h3>

      {ride.status === "requested" && (
        <button onClick={() => updateRideStatus("accept")}>
          Accept Ride
        </button>
      )}

      {ride.status === "accepted" && (
        <button onClick={() => updateRideStatus("driver-arriving")}>
          Driver Arriving
        </button>
      )}

      {(ride.status === "accepted" ||
        ride.status === "driver_arriving") && (
        <button onClick={() => updateRideStatus("start")}>
          Start Ride
        </button>
      )}

      {ride.status === "in_progress" && (
        <button onClick={() => updateRideStatus("complete")}>
          Complete Ride
        </button>
      )}

      {ride.status !== "completed" &&
        ride.status !== "cancelled" && (
          <button onClick={() => updateRideStatus("cancel")}>
            Cancel Ride
          </button>
        )}
    </div>
  );
}

export default RideStatusButtons;