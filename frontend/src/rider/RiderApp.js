import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL, WS_URL } from "../apiConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import {
  MARKET,
  calculateDistanceKm,
  calculateFare,
  formatMoney,
  getLocationByLabel,
  getLocationsByCity,
} from "../marketConfig";

const activeRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "in_progress",
  "completed",
]);

const rideOptions = [
  {
    key: "regular",
    title: "Sakho",
    subtitle: "Everyday rides",
    seats: "1-4",
    eta: "3 min",
  },
  {
    key: "comfort",
    title: "Comfort",
    subtitle: "Newer cars",
    seats: "1-4",
    eta: "5 min",
  },
  {
    key: "xl",
    title: "XL",
    subtitle: "Extra space",
    seats: "1-6",
    eta: "7 min",
  },
  {
    key: "share",
    title: "Share",
    subtitle: "Lower fare",
    seats: "Shared",
    eta: "6 min",
  },
];

function RiderApp() {
  const [city, setCity] = useState(MARKET.defaultCity);
  const [pickup, setPickup] = useState(MARKET.defaultPickup.label);
  const [destination, setDestination] = useState(MARKET.defaultDestination.label);
  const [selectedRide, setSelectedRide] = useState("regular");
  const [currentRide, setCurrentRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const cityLocations = getLocationsByCity(city);
  const pickupLocation = getLocationByLabel(pickup, city) || MARKET.defaultPickup;
  const destinationLocation =
    getLocationByLabel(destination, city) || MARKET.defaultDestination;
  const pickupPosition = pickupLocation.position;
  const destinationPosition = destinationLocation.position;
  const distance = useMemo(
    () => calculateDistanceKm(pickupPosition, destinationPosition) || 1,
    [pickupPosition, destinationPosition]
  );
  const estimatedFare = useMemo(
    () => calculateFare(selectedRide, distance),
    [selectedRide, distance]
  );
  const selectedRideOption = rideOptions.find((ride) => ride.key === selectedRide);
  const isSearching =
    loading || ["requested", "pending"].includes(currentRide?.status || "");
  const driverFound = Boolean(currentRide?.driver_name);

  const getToken = () => localStorage.getItem("access");

  const fetchCurrentRide = useCallback(async () => {
    try {
      const token = getToken();

      if (!token) return;

      const response = await fetch(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok || !Array.isArray(data)) return;

      const activeRide = data.find((ride) => activeRideStatuses.has(ride.status));
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

  useEffect(() => {
    const locations = getLocationsByCity(city);
    if (locations.length >= 2) {
      setPickup(locations[0].label);
      setDestination(locations[1].label);
    }
  }, [city]);

  const requestRide = async () => {
    setNotice("");

    if (!pickup.trim() || !destination.trim()) {
      setNotice("Add pickup and destination before requesting.");
      return;
    }

    if (pickup.trim().toLowerCase() === destination.trim().toLowerCase()) {
      setNotice("Pickup and destination must be different.");
      return;
    }

    try {
      setLoading(true);

      const token = getToken();

      if (!token) {
        localStorage.setItem("sx_login_redirect", "/rider");
        window.location.href = "/login?next=/rider";
        return;
      }

      const response = await fetch(`${API_URL}/rides/request/`, {
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
        setNotice(data.detail || data.error || "Ride request failed.");
        return;
      }

      setCurrentRide(data);
      fetchCurrentRide();
    } catch (error) {
      console.error("Ride request error:", error);
      setNotice("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const cancelRide = async () => {
    if (!currentRide?.id) return;

    try {
      const token = getToken();

      const response = await fetch(`${API_URL}/rides/cancel/${currentRide.id}/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        setNotice(data.detail || data.error || "Could not cancel ride.");
        return;
      }

      setCurrentRide(null);
      fetchCurrentRide();
    } catch (error) {
      console.error("Cancel ride error:", error);
      setNotice("Server error. Please try again.");
    }
  };

  const statusText = getStatusText(currentRide?.status);
  const mapMarkers = [
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
      label: "D",
    },
  ];

  return (
    <main className="rider-booking-page">
      <RiderBookingStyles />

      <section className="rider-map-shell">
        <GoogleTripMap
          center={pickupPosition}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          fitPoints={[pickupPosition, destinationPosition]}
          markers={mapMarkers}
          polylines={[
            {
              id: "trip-route",
              path: [pickupPosition, destinationPosition],
              color: "#111827",
              weight: 5,
              opacity: 0.88,
              animated: Boolean(currentRide),
            },
          ]}
        />
      </section>

      <section className="rider-booking-panel">
        <div className="rider-panel-header">
          <button onClick={() => (window.location.href = "/rider-dashboard")}>
            Trips
          </button>
          <button onClick={() => (window.location.href = "/settings")}>
            Settings
          </button>
        </div>

        <div className="rider-title-block">
          <span>Book a ride</span>
          <h1>Where to?</h1>
          <p>Choose your pickup, destination, ride type, and confirm the trip.</p>
        </div>

        <div className="rider-input-card">
          <label>
            City
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {MARKET.cities.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Pickup
            <input
              list="rider-location-options"
              value={pickup}
              onChange={(event) => setPickup(event.target.value)}
              placeholder="Enter pickup"
            />
          </label>

          <label>
            Destination
            <input
              list="rider-location-options"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Where are you going?"
            />
          </label>

          <datalist id="rider-location-options">
            {cityLocations.map((location) => (
              <option key={location.label} value={location.label} />
            ))}
          </datalist>
        </div>

        <FareEstimateCard
          fare={estimatedFare}
          distance={distance}
          ride={selectedRideOption}
        />

        <div className="rider-car-section">
          <div className="rider-section-heading">
            <strong>Choose a ride</strong>
            <span>{selectedRideOption?.eta || "3 min"} pickup</span>
          </div>

          <div className="rider-car-grid">
            {rideOptions.map((ride) => {
              const rideFare = calculateFare(ride.key, distance);
              const selected = selectedRide === ride.key;

              return (
                <button
                  key={ride.key}
                  className={selected ? "selected" : ""}
                  onClick={() => setSelectedRide(ride.key)}
                >
                  <div className="rider-car-icon" aria-hidden="true" />
                  <div>
                    <strong>{ride.title}</strong>
                    <span>
                      {ride.subtitle} · {ride.seats}
                    </span>
                  </div>
                  <em>{formatMoney(rideFare)}</em>
                </button>
              );
            })}
          </div>
        </div>

        {notice && <div className="rider-notice">{notice}</div>}

        {!currentRide && (
          <button
            className="rider-request-button"
            onClick={requestRide}
            disabled={loading}
          >
            {loading ? "Searching..." : `Request ${selectedRideOption?.title || "ride"}`}
          </button>
        )}

        {isSearching && <SearchingCard />}

        {driverFound && <DriverFoundCard ride={currentRide} />}

        {currentRide && (
          <TripStatusCard
            ride={currentRide}
            statusText={statusText}
            onCancel={cancelRide}
          />
        )}
      </section>
    </main>
  );
}

function FareEstimateCard({ fare, distance, ride }) {
  return (
    <article className="rider-fare-card">
      <div>
        <span>Fare estimate</span>
        <strong>{formatMoney(fare)}</strong>
      </div>
      <div>
        <span>Distance</span>
        <strong>{Number(distance || 0).toFixed(1)} km</strong>
      </div>
      <div>
        <span>Ride type</span>
        <strong>{ride?.title || "Sakho"}</strong>
      </div>
    </article>
  );
}

function SearchingCard() {
  return (
    <article className="rider-search-card">
      <div className="rider-search-animation">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>Searching for nearby drivers</strong>
        <p>We are matching you with the best available driver.</p>
      </div>
    </article>
  );
}

function DriverFoundCard({ ride }) {
  return (
    <article className="rider-driver-card">
      <div className="rider-driver-photo">
        {ride.driver_picture ? (
          <img src={ride.driver_picture} alt="Driver" />
        ) : (
          <span>{String(ride.driver_name || "D").charAt(0)}</span>
        )}
      </div>
      <div className="rider-driver-info">
        <span>Driver found</span>
        <h2>{ride.driver_name || "Your driver"}</h2>
        <p>
          {ride.vehicle || "Vehicle"} · Plate {ride.plate_number || "pending"}
        </p>
        <div className="rider-driver-meta">
          <strong>{Number(ride.driver_rating || 0).toFixed(1)} rating</strong>
          <strong>{ride.completed_trips || 0} trips</strong>
        </div>
        {(ride.private_call_number || ride.driver_phone) && (
          <a href={`tel:${ride.private_call_number || ride.driver_phone}`}>
            Call through private number
          </a>
        )}
      </div>
    </article>
  );
}

function TripStatusCard({ ride, statusText, onCancel }) {
  const steps = [
    { key: "requested", label: "Requested" },
    { key: "accepted", label: "Accepted" },
    { key: "in_progress", label: "On trip" },
    { key: "completed", label: "Complete" },
  ];
  const statusOrder = {
    requested: 0,
    pending: 0,
    accepted: 1,
    driver_arriving: 1,
    in_progress: 2,
    completed: 3,
  };
  const currentIndex = statusOrder[ride.status] ?? 0;
  const canCancel = !["completed", "cancelled", "in_progress"].includes(ride.status);

  return (
    <article className="rider-status-card">
      <div className="rider-section-heading">
        <strong>Live trip status</strong>
        <span>{statusText}</span>
      </div>
      <div className="rider-trip-steps">
        {steps.map((step, index) => (
          <div key={step.key} className={index <= currentIndex ? "active" : ""}>
            <span />
            <strong>{step.label}</strong>
          </div>
        ))}
      </div>
      <div className="rider-trip-summary">
        <span>{ride.pickup}</span>
        <span>{ride.destination}</span>
      </div>
      {canCancel && (
        <button className="rider-cancel-button" onClick={onCancel}>
          Cancel ride
        </button>
      )}
    </article>
  );
}

function getStatusText(status) {
  if (!status) return "Ready to request";
  if (["requested", "pending"].includes(status)) return "Finding driver";
  if (["accepted", "driver_arriving"].includes(status)) return "Driver arriving";
  if (status === "in_progress") return "Ride in progress";
  if (status === "completed") return "Ride completed";
  if (status === "cancelled") return "Ride cancelled";
  return status.replace("_", " ");
}

function RiderBookingStyles() {
  return (
    <style>{`
      .rider-booking-page {
        min-height: 100vh;
        background: #05070c;
        color: #111827;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .rider-booking-page * {
        box-sizing: border-box;
      }

      .rider-map-shell {
        position: fixed;
        inset: 0;
        background: #e5e7eb;
      }

      .rider-booking-panel {
        position: relative;
        z-index: 3;
        width: min(460px, calc(100% - 28px));
        min-height: calc(100vh - 28px);
        margin: 14px 0 14px 14px;
        padding: 18px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 30px;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 30px 90px rgba(15, 23, 42, 0.24);
        backdrop-filter: blur(20px);
      }

      .rider-panel-header {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 18px;
      }

      .rider-panel-header button,
      .rider-car-grid button,
      .rider-request-button,
      .rider-cancel-button {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .rider-panel-header button {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 900;
      }

      .rider-title-block span {
        display: inline-flex;
        margin-bottom: 10px;
        padding: 7px 10px;
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        font-size: 12px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .rider-title-block h1 {
        margin: 0;
        font-size: 42px;
        line-height: 1;
        letter-spacing: 0;
      }

      .rider-title-block p {
        margin: 10px 0 18px;
        color: #64748b;
        line-height: 1.5;
      }

      .rider-input-card {
        display: grid;
        gap: 12px;
        padding: 14px;
        border: 1px solid #e2e8f0;
        border-radius: 22px;
        background: #f8fafc;
      }

      .rider-input-card label {
        display: grid;
        gap: 7px;
        color: #475569;
        font-size: 13px;
        font-weight: 900;
      }

      .rider-input-card input,
      .rider-input-card select {
        width: 100%;
        min-height: 48px;
        padding: 0 13px;
        border: 1px solid #e2e8f0;
        border-radius: 15px;
        background: #fff;
        color: #0f172a;
        font-size: 15px;
        font-weight: 800;
        outline: none;
      }

      .rider-fare-card {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 14px;
        padding: 14px;
        border-radius: 22px;
        background: #0f172a;
        color: #fff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
      }

      .rider-fare-card div {
        display: grid;
        gap: 4px;
      }

      .rider-fare-card span {
        color: #94a3b8;
        font-size: 12px;
        font-weight: 800;
      }

      .rider-fare-card strong {
        font-size: 15px;
      }

      .rider-car-section,
      .rider-search-card,
      .rider-driver-card,
      .rider-status-card {
        margin-top: 14px;
        padding: 14px;
        border: 1px solid #e2e8f0;
        border-radius: 22px;
        background: #fff;
      }

      .rider-section-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .rider-section-heading strong {
        font-size: 18px;
      }

      .rider-section-heading span {
        color: #64748b;
        font-size: 13px;
        font-weight: 900;
      }

      .rider-car-grid {
        display: grid;
        gap: 9px;
      }

      .rider-car-grid button {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        min-height: 72px;
        padding: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        background: #f8fafc;
        color: #0f172a;
        text-align: left;
        transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
      }

      .rider-car-grid button:hover,
      .rider-car-grid button.selected {
        transform: translateY(-1px);
        border-color: #111827;
        background: #eef2ff;
      }

      .rider-car-grid strong,
      .rider-car-grid span {
        display: block;
      }

      .rider-car-grid span {
        margin-top: 3px;
        color: #64748b;
        font-size: 13px;
      }

      .rider-car-grid em {
        color: #111827;
        font-style: normal;
        font-weight: 950;
      }

      .rider-car-icon {
        width: 46px;
        height: 34px;
        border-radius: 16px 16px 10px 10px;
        background: #111827;
        position: relative;
      }

      .rider-car-icon::before,
      .rider-car-icon::after {
        content: "";
        position: absolute;
        bottom: -4px;
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #facc15;
      }

      .rider-car-icon::before {
        left: 7px;
      }

      .rider-car-icon::after {
        right: 7px;
      }

      .rider-notice {
        margin-top: 14px;
        padding: 12px;
        border-radius: 16px;
        background: #fef2f2;
        color: #991b1b;
        font-weight: 850;
      }

      .rider-request-button {
        width: 100%;
        min-height: 56px;
        margin-top: 14px;
        border-radius: 999px;
        background: #111827;
        color: #fff;
        font-weight: 950;
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .rider-request-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 34px rgba(15, 23, 42, 0.22);
      }

      .rider-request-button:disabled {
        opacity: 0.72;
        cursor: wait;
      }

      .rider-search-card {
        display: grid;
        grid-template-columns: 74px minmax(0, 1fr);
        gap: 14px;
        align-items: center;
        background: #111827;
        color: #fff;
      }

      .rider-search-card p {
        margin: 4px 0 0;
        color: #cbd5e1;
      }

      .rider-search-animation {
        position: relative;
        width: 64px;
        height: 64px;
        border-radius: 999px;
        background: rgba(250, 204, 21, 0.13);
      }

      .rider-search-animation span {
        position: absolute;
        inset: 10px;
        border: 2px solid rgba(250, 204, 21, 0.8);
        border-radius: 999px;
        animation: riderPulse 1.5s ease-out infinite;
      }

      .rider-search-animation span:nth-child(2) {
        animation-delay: 0.35s;
      }

      .rider-search-animation span:nth-child(3) {
        animation-delay: 0.7s;
      }

      .rider-driver-card {
        display: grid;
        grid-template-columns: 82px minmax(0, 1fr);
        gap: 14px;
        align-items: start;
      }

      .rider-driver-photo,
      .rider-driver-photo img {
        width: 82px;
        height: 82px;
        border-radius: 24px;
      }

      .rider-driver-photo {
        display: grid;
        place-items: center;
        background: #111827;
        color: #facc15;
        font-size: 30px;
        font-weight: 950;
        overflow: hidden;
      }

      .rider-driver-photo img {
        object-fit: cover;
      }

      .rider-driver-info span {
        color: #16a34a;
        font-size: 12px;
        font-weight: 950;
        text-transform: uppercase;
      }

      .rider-driver-info h2 {
        margin: 4px 0;
        font-size: 22px;
      }

      .rider-driver-info p {
        margin: 0 0 10px;
        color: #64748b;
      }

      .rider-driver-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 10px;
      }

      .rider-driver-meta strong {
        padding: 7px 9px;
        border-radius: 999px;
        background: #f1f5f9;
        font-size: 12px;
      }

      .rider-driver-info a {
        color: #111827;
        font-weight: 950;
      }

      .rider-trip-steps {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .rider-trip-steps div {
        display: grid;
        gap: 7px;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 900;
      }

      .rider-trip-steps div span {
        height: 6px;
        border-radius: 999px;
        background: #e2e8f0;
      }

      .rider-trip-steps div.active {
        color: #111827;
      }

      .rider-trip-steps div.active span {
        background: #16a34a;
      }

      .rider-trip-summary {
        display: grid;
        gap: 8px;
        margin-top: 14px;
        padding: 12px;
        border-radius: 16px;
        background: #f8fafc;
        color: #334155;
        font-weight: 850;
      }

      .rider-cancel-button {
        width: 100%;
        min-height: 48px;
        margin-top: 12px;
        border-radius: 999px;
        background: #fee2e2;
        color: #991b1b;
        font-weight: 950;
      }

      @keyframes riderPulse {
        from {
          opacity: 1;
          transform: scale(0.55);
        }
        to {
          opacity: 0;
          transform: scale(1.45);
        }
      }

      @media (max-width: 820px) {
        .rider-map-shell {
          position: relative;
          height: 42vh;
          min-height: 290px;
        }

        .rider-booking-panel {
          width: 100%;
          min-height: auto;
          margin: 0;
          border-radius: 28px 28px 0 0;
          box-shadow: 0 -24px 60px rgba(15, 23, 42, 0.18);
        }
      }

      @media (max-width: 520px) {
        .rider-booking-panel {
          padding: 14px;
        }

        .rider-title-block h1 {
          font-size: 36px;
        }

        .rider-fare-card {
          grid-template-columns: 1fr;
        }

        .rider-car-grid button,
        .rider-driver-card,
        .rider-search-card {
          grid-template-columns: 1fr;
        }

        .rider-trip-steps {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `}</style>
  );
}

export default RiderApp;
