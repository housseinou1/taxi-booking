import React, { useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";
import { API_URL } from "../../apiConfig";
import {
  MARKET,
  formatMoney,
  calculateFare,
  calculateDistanceKm,
  isPointInServiceArea,
} from "../../marketConfig";

const STEPS = ["pickup", "destination", "rideType", "review", "confirm"];

const RIDE_TYPES = [
  {
    key: "share",
    label: "Yala Share",
    description: "Up to 2 additional passengers",
    extraTime: "+3-8 min",
    icon: "👥",
  },
  {
    key: "regular",
    label: "Yala Economy",
    description: "Standard ride, just you",
    extraTime: "",
    icon: "🚗",
  },
  {
    key: "comfort",
    label: "Yala Comfort",
    description: "Premium vehicle, extra legroom",
    extraTime: "",
    icon: "✨",
  },
  {
    key: "xl",
    label: "Yala XL",
    description: "Large vehicle, up to 6 seats",
    extraTime: "",
    icon: "🚐",
  },
];

export default function ShareBookingFlow() {
  const [step, setStep] = useState(0);
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [pickupLocation, setPickupLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [selectedRideType, setSelectedRideType] = useState("share");
  const [seats, setSeats] = useState(1);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const filterLocations = useCallback((query) => {
    if (!query || query.length < 2) return [];
    const normalized = query.toLowerCase();
    return MARKET.locations
      .filter((loc) => loc.label.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, []);

  useEffect(() => {
    setPickupSuggestions(filterLocations(pickup));
  }, [pickup, filterLocations]);

  useEffect(() => {
    setDestSuggestions(filterLocations(destination));
  }, [destination, filterLocations]);

  const distance = useMemo(() => {
    if (!pickupLocation || !destinationLocation) return null;
    return calculateDistanceKm(pickupLocation.position, destinationLocation.position);
  }, [pickupLocation, destinationLocation]);

  const fares = useMemo(() => {
    if (!distance) return {};
    return {
      share: calculateFare("share", distance),
      regular: calculateFare("regular", distance),
      comfort: calculateFare("comfort", distance),
      xl: calculateFare("xl", distance),
    };
  }, [distance]);

  const savings = useMemo(() => {
    if (!fares.share || !fares.regular) return 0;
    return fares.regular - fares.share;
  }, [fares]);

  const savingsPercent = useMemo(() => {
    if (!fares.regular || !savings) return 0;
    return Math.round((savings / fares.regular) * 100);
  }, [fares.regular, savings]);

  const handlePickupSelect = (loc) => {
    setPickup(loc.label);
    setPickupLocation(loc);
    setPickupSuggestions([]);
    setError("");
    setTimeout(() => setStep(1), 300);
  };

  const handleDestSelect = (loc) => {
    setDestination(loc.label);
    setDestinationLocation(loc);
    setDestSuggestions([]);
    setError("");
    setTimeout(() => setStep(2), 300);
  };

  const handleRideTypeSelect = (key) => {
    setSelectedRideType(key);
    if (key === "share") {
      setTimeout(() => setStep(3), 300);
    }
  };

  const handleConfirm = async () => {
    if (!pickupLocation || !destinationLocation) {
      setError("Please select pickup and destination.");
      return;
    }

    if (!isPointInServiceArea(pickupLocation.position)) {
      setError("Pickup location is outside the supported service area.");
      return;
    }

    if (!isPointInServiceArea(destinationLocation.position)) {
      setError("Destination is outside the supported service area.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access");
      await axios.post(
        `${API_URL}/api/rides/share/request/`,
        {
          pickup: pickupLocation.label,
          destination: destinationLocation.label,
          pickup_lat: pickupLocation.position[0],
          pickup_lng: pickupLocation.position[1],
          destination_lat: destinationLocation.position[0],
          destination_lng: destinationLocation.position[1],
          seats,
          distance_km: distance,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setConfirmed(true);
      setStep(4);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (step > 0) setStep(step - 1);
    setError("");
  };

  if (confirmed) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.successTitle}>Ride Requested!</h2>
          <p style={styles.successText}>
            Looking for riders on a similar route...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Progress indicator */}
      <div style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.progressDot,
              backgroundColor: i <= step ? "#00A651" : "rgba(255,255,255,0.2)",
            }}
          />
        ))}
      </div>

      {/* Back button */}
      {step > 0 && (
        <button
          onClick={goBack}
          style={styles.backButton}
          aria-label="Go back"
        >
          ← Back
        </button>
      )}

      {/* Error display */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Step 1: Pickup */}
      <div
        style={{
          ...styles.stepContainer,
          opacity: step === 0 ? 1 : 0,
          pointerEvents: step === 0 ? "auto" : "none",
          transform: step === 0 ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <h2 style={styles.stepTitle}>Where are you?</h2>
        <p style={styles.stepSubtitle}>Enter your pickup location</p>
        <input
          type="text"
          value={pickup}
          onChange={(e) => {
            setPickup(e.target.value);
            setPickupLocation(null);
          }}
          placeholder="Search pickup location..."
          style={styles.input}
          aria-label="Pickup location"
          autoFocus
        />
        <div style={styles.suggestionsList}>
          {pickupSuggestions.map((loc) => (
            <button
              key={loc.label}
              onClick={() => handlePickupSelect(loc)}
              style={styles.suggestionItem}
              aria-label={`Select ${loc.label} as pickup`}
            >
              <span style={styles.suggestionIcon}>📍</span>
              <div>
                <div style={styles.suggestionLabel}>{loc.label}</div>
                <div style={styles.suggestionCity}>{loc.city}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Destination */}
      <div
        style={{
          ...styles.stepContainer,
          opacity: step === 1 ? 1 : 0,
          pointerEvents: step === 1 ? "auto" : "none",
          transform:
            step === 1
              ? "translateX(0)"
              : step < 1
              ? "translateX(100%)"
              : "translateX(-100%)",
        }}
      >
        <h2 style={styles.stepTitle}>Where to?</h2>
        <p style={styles.stepSubtitle}>Enter your destination</p>
        <input
          type="text"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setDestinationLocation(null);
          }}
          placeholder="Search destination..."
          style={styles.input}
          aria-label="Destination location"
          autoFocus
        />
        <div style={styles.suggestionsList}>
          {destSuggestions.map((loc) => (
            <button
              key={loc.label}
              onClick={() => handleDestSelect(loc)}
              style={styles.suggestionItem}
              aria-label={`Select ${loc.label} as destination`}
            >
              <span style={styles.suggestionIcon}>🏁</span>
              <div>
                <div style={styles.suggestionLabel}>{loc.label}</div>
                <div style={styles.suggestionCity}>{loc.city}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Step 3: Ride Type */}
      <div
        style={{
          ...styles.stepContainer,
          opacity: step === 2 ? 1 : 0,
          pointerEvents: step === 2 ? "auto" : "none",
          transform:
            step === 2
              ? "translateX(0)"
              : step < 2
              ? "translateX(100%)"
              : "translateX(-100%)",
        }}
      >
        <h2 style={styles.stepTitle}>Choose your ride</h2>
        <p style={styles.stepSubtitle}>
          {pickupLocation?.label} → {destinationLocation?.label}
        </p>
        <div style={styles.rideTypeList}>
          {RIDE_TYPES.map((type) => {
            const fare = fares[type.key] || 0;
            const isSelected = selectedRideType === type.key;
            const isShare = type.key === "share";
            return (
              <button
                key={type.key}
                onClick={() => handleRideTypeSelect(type.key)}
                style={{
                  ...styles.rideTypeCard,
                  borderColor: isSelected
                    ? "#00A651"
                    : "rgba(255,255,255,0.1)",
                  backgroundColor: isSelected
                    ? "rgba(0,166,81,0.1)"
                    : "rgba(255,255,255,0.06)",
                }}
                aria-label={`Select ${type.label}`}
                aria-pressed={isSelected}
              >
                <div style={styles.rideTypeLeft}>
                  <span style={styles.rideTypeIcon}>{type.icon}</span>
                  <div>
                    <div style={styles.rideTypeName}>{type.label}</div>
                    <div style={styles.rideTypeDesc}>{type.description}</div>
                    {type.extraTime && (
                      <div style={styles.rideTypeExtra}>{type.extraTime}</div>
                    )}
                  </div>
                </div>
                <div style={styles.rideTypeRight}>
                  <div style={styles.rideTypeFare}>{formatMoney(fare)}</div>
                  {isShare && savings > 0 && (
                    <div style={styles.savingsBadge}>
                      Save {savingsPercent}%
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 4: Review */}
      <div
        style={{
          ...styles.stepContainer,
          opacity: step === 3 ? 1 : 0,
          pointerEvents: step === 3 ? "auto" : "none",
          transform:
            step === 3
              ? "translateX(0)"
              : step < 3
              ? "translateX(100%)"
              : "translateX(-100%)",
        }}
      >
        <h2 style={styles.stepTitle}>Review your Share ride</h2>

        <div style={styles.reviewCard}>
          <div style={styles.reviewRow}>
            <span style={styles.reviewLabel}>From</span>
            <span style={styles.reviewValue}>{pickupLocation?.label}</span>
          </div>
          <div style={styles.reviewRow}>
            <span style={styles.reviewLabel}>To</span>
            <span style={styles.reviewValue}>{destinationLocation?.label}</span>
          </div>
          <div style={styles.reviewRow}>
            <span style={styles.reviewLabel}>Distance</span>
            <span style={styles.reviewValue}>{distance} km</span>
          </div>
          <div style={styles.reviewRow}>
            <span style={styles.reviewLabel}>ETA</span>
            <span style={styles.reviewValue}>+3-8 min vs direct</span>
          </div>
          <div style={styles.reviewDivider} />
          <div style={styles.reviewRow}>
            <span style={styles.reviewLabel}>Share Fare</span>
            <span style={{ ...styles.reviewValue, fontWeight: 700 }}>
              {formatMoney(fares.share * seats)}
            </span>
          </div>
          {savings > 0 && (
            <div style={styles.savingsRow}>
              <span style={styles.savingsText}>
                Save up to {formatMoney(savings * seats)}
              </span>
            </div>
          )}
        </div>

        {/* Seat selector */}
        <div style={styles.seatSelector}>
          <span style={styles.seatLabel}>Seats</span>
          <div style={styles.seatButtons}>
            {[1, 2].map((s) => (
              <button
                key={s}
                onClick={() => setSeats(s)}
                style={{
                  ...styles.seatButton,
                  backgroundColor:
                    seats === s ? "#00A651" : "rgba(255,255,255,0.06)",
                  color: seats === s ? "#FFFFFF" : "rgba(255,255,255,0.7)",
                }}
                aria-label={`${s} seat${s > 1 ? "s" : ""}`}
                aria-pressed={seats === s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            ...styles.confirmButton,
            opacity: loading ? 0.7 : 1,
          }}
          aria-label="Confirm Share ride"
        >
          {loading ? "Requesting..." : "Confirm Yala Share"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0B1220",
    color: "#FFFFFF",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: "20px",
    maxWidth: "428px",
    margin: "0 auto",
    position: "relative",
    overflow: "hidden",
  },
  progressBar: {
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    marginBottom: "24px",
    paddingTop: "12px",
  },
  progressDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    transition: "background-color 300ms ease",
  },
  backButton: {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.7)",
    fontSize: "16px",
    cursor: "pointer",
    padding: "8px 0",
    marginBottom: "12px",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #EF4444",
    borderRadius: "12px",
    padding: "12px 16px",
    color: "#EF4444",
    fontSize: "14px",
    marginBottom: "16px",
  },
  stepContainer: {
    position: "absolute",
    top: "100px",
    left: "20px",
    right: "20px",
    transition: "all 300ms ease",
  },
  stepTitle: {
    fontSize: "24px",
    fontWeight: 700,
    marginBottom: "8px",
    color: "#FFFFFF",
  },
  stepSubtitle: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
    marginBottom: "24px",
  },
  input: {
    width: "100%",
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 300ms ease",
  },
  suggestionsList: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  suggestionItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "none",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#FFFFFF",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    transition: "background-color 300ms ease",
  },
  suggestionIcon: {
    fontSize: "18px",
  },
  suggestionLabel: {
    fontSize: "15px",
    fontWeight: 500,
  },
  suggestionCity: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.5)",
    marginTop: "2px",
  },
  rideTypeList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  rideTypeCard: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    transition: "all 300ms ease",
  },
  rideTypeLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  rideTypeIcon: {
    fontSize: "28px",
  },
  rideTypeName: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#FFFFFF",
  },
  rideTypeDesc: {
    fontSize: "12px",
    color: "rgba(255,255,255,0.6)",
    marginTop: "2px",
  },
  rideTypeExtra: {
    fontSize: "11px",
    color: "#D4AF37",
    marginTop: "2px",
  },
  rideTypeRight: {
    textAlign: "right",
  },
  rideTypeFare: {
    fontSize: "16px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  savingsBadge: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#D4AF37",
    marginTop: "4px",
  },
  reviewCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "20px",
    marginBottom: "20px",
  },
  reviewRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
  },
  reviewLabel: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
  },
  reviewValue: {
    fontSize: "14px",
    color: "#FFFFFF",
  },
  reviewDivider: {
    height: "1px",
    backgroundColor: "rgba(255,255,255,0.1)",
    margin: "8px 0",
  },
  savingsRow: {
    textAlign: "center",
    padding: "12px 0 4px",
  },
  savingsText: {
    fontSize: "15px",
    fontWeight: 600,
    color: "#D4AF37",
  },
  seatSelector: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "24px",
    padding: "16px",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  seatLabel: {
    fontSize: "15px",
    fontWeight: 500,
    color: "#FFFFFF",
  },
  seatButtons: {
    display: "flex",
    gap: "8px",
  },
  seatButton: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.15)",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 300ms ease",
  },
  confirmButton: {
    width: "100%",
    padding: "18px",
    borderRadius: "16px",
    border: "none",
    backgroundColor: "#00A651",
    color: "#FFFFFF",
    fontSize: "17px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 300ms ease",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
  },
  successIcon: {
    width: "80px",
    height: "80px",
    borderRadius: "50%",
    backgroundColor: "rgba(0,166,81,0.15)",
    color: "#00A651",
    fontSize: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "24px",
  },
  successTitle: {
    fontSize: "24px",
    fontWeight: 700,
    marginBottom: "8px",
  },
  successText: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
  },
};
