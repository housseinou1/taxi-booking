import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import {
  MARKET,
  calculateDistanceKm,
  calculateFare,
  formatMoney,
  getLocationByLabel,
  getLocationsByCity,
  isPointInServiceArea,
} from "../marketConfig";

const fetchDrivingRoute = async (start, end) => {
  if (!start || !end) return null;

  const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  const data = await response.json();
  const route = data.routes?.[0];

  if (!route) return null;

  return {
    points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    etaMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
};

const rideLabels = {
  regular: "Regular",
  comfort: "Comfort",
  xl: "XL",
  share: "Share",
};

const rideSeats = {
  regular: "1-4",
  comfort: "1-4",
  xl: "1-6",
  share: "Shared",
};

const logoSrc = "/sakho-brand-logo.jpeg";

const getStatusLabel = (status) => {
  if (!status) return "Ready";
  if (["requested", "pending"].includes(status)) return "Finding driver";
  if (["accepted", "driver_arriving"].includes(status)) return "Driver arriving";
  if (status === "in_progress") return "On trip";
  if (status === "completed") return "Trip complete";
  if (status === "cancelled") return "Cancelled";
  return status.replace("_", " ");
};

const activeRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "in_progress",
]);

const liveDriverStatuses = new Set(["accepted", "driver_arriving", "in_progress"]);

export default function RiderDashboard() {
  const [city, setCity] = useState(MARKET.defaultCity);
  const [pickup, setPickup] = useState(MARKET.defaultPickup.label);
  const [destination, setDestination] = useState(MARKET.defaultDestination.label);
  const [distance, setDistance] = useState(
    calculateDistanceKm(
      MARKET.defaultPickup.position,
      MARKET.defaultDestination.position
    )
  );
  const [rideType, setRideType] = useState("regular");
  const [fare, setFare] = useState(calculateFare("regular", 10));
  const [requesting, setRequesting] = useState(false);
  const [routePath, setRoutePath] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [currentRide, setCurrentRide] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);
  const [riderIdentity, setRiderIdentity] = useState({
    phone_number: "",
    national_id_number: "",
    national_id_document: "",
    has_national_id_document: false,
    profile_picture: "",
    has_profile_picture: false,
    member_since_year: "",
    years_using_app: 0,
  });
  const [nationalIdFile, setNationalIdFile] = useState(null);
  const [profilePictureFile, setProfilePictureFile] = useState(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMessage, setIdentityMessage] = useState("");
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [rideHistory, setRideHistory] = useState([]);

  const token = localStorage.getItem("access");

  const cityLocations = getLocationsByCity(city);
  const selectedCity = MARKET.cities.find((item) => item.label === city);
  const pickupLocation = getLocationByLabel(pickup, city);
  const destinationLocation = getLocationByLabel(destination, city);
  const pickupPosition = pickupLocation?.position || MARKET.defaultPickup.position;
  const destinationPosition =
    destinationLocation?.position || MARKET.defaultDestination.position;
  const activeStatus = getStatusLabel(currentRide?.status);
  const shouldTrackDriver = liveDriverStatuses.has(currentRide?.status);
  const hasRequiredRiderProfile =
    riderIdentity.has_profile_picture && Boolean(riderIdentity.phone_number?.trim());

  const mapMarkers = useMemo(
    () =>
      [
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
        shouldTrackDriver &&
          driverPosition && {
          id: "driver",
          position: driverPosition,
          title: "Driver live location",
          label: "C",
          type: "driver",
        },
      ].filter(Boolean),
    [
      destination,
      destinationPosition,
      driverPosition,
      pickup,
      pickupPosition,
      shouldTrackDriver,
    ]
  );

  useEffect(() => {
    const automaticDistance = calculateDistanceKm(
      pickupLocation?.position,
      destinationLocation?.position
    );

    if (automaticDistance) {
      setDistance(automaticDistance);
    }
  }, [pickupLocation, destinationLocation]);

  useEffect(() => {
    const locations = getLocationsByCity(city);

    if (locations.length >= 2) {
      setPickup(locations[0].label);
      setDestination(locations[1].label);
      return;
    }

    if (locations.length === 1) {
      setPickup(locations[0].label);
      setDestination(locations[0].label);
    }
  }, [city]);

  useEffect(() => {
    setFare(calculateFare(rideType, distance));
  }, [rideType, distance]);

  useEffect(() => {
    let cancelled = false;
    const start = [pickupPosition[0], pickupPosition[1]];
    const end = [destinationPosition[0], destinationPosition[1]];

    const loadRoute = async () => {
      const fallbackRoute = [start, end];

      try {
        const route = await fetchDrivingRoute(start, end);
        if (cancelled) return;

        setRoutePath(route?.points || fallbackRoute);
        setRouteInfo(route);

        if (route?.distanceKm) {
          setDistance(Number(route.distanceKm.toFixed(1)));
        }
      } catch (error) {
        console.log("Route service unavailable:", error);
        if (cancelled) return;

        setRoutePath(fallbackRoute);
        setRouteInfo(null);
      }
    };

    loadRoute();

    return () => {
      cancelled = true;
    };
  }, [pickupPosition, destinationPosition]);

  const fetchRiderIdentity = useCallback(async () => {
    try {
      if (!token) return;

      const response = await axios.get(`${API_URL}/auth/me/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setRiderIdentity({
        phone_number: response.data.phone_number || "",
        national_id_number: response.data.national_id_number || "",
        national_id_document: response.data.national_id_document || "",
        has_national_id_document: Boolean(response.data.has_national_id_document),
        profile_picture: response.data.profile_picture || "",
        has_profile_picture: Boolean(response.data.has_profile_picture),
        member_since_year: response.data.member_since_year || "",
        years_using_app: response.data.years_using_app || 0,
      });
    } catch (error) {
      console.log("Rider identity error:", error.response?.data || error);
    }
  }, [token]);

  const fetchCurrentRide = useCallback(async () => {
    try {
      if (!token) return;

      const response = await axios.get(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (Array.isArray(response.data) && response.data.length > 0) {
        setRideHistory(response.data);
        const activeRide = response.data.find((ride) =>
          activeRideStatuses.has(ride.status)
        );
        setCurrentRide(activeRide || null);
      } else {
        setRideHistory([]);
        setCurrentRide(null);
      }
    } catch (error) {
      console.log("Ride history error:", error.response?.data || error);
    }
  }, [token]);

  const spendingHistory = useMemo(() => {
    const monthly = {};
    let total = 0;
    rideHistory.forEach((ride) => {
      if (ride.status !== "completed") return;
      const amount = Number(ride.fare || 0);
      total += amount;
      const date = new Date(ride.completed_at || ride.updated_at || ride.created_at || Date.now());
      const label = date.toLocaleString("en-US", { month: "short", year: "2-digit" });
      monthly[label] = (monthly[label] || 0) + amount;
    });

    const trend = Object.entries(monthly).slice(-6).map(([label, value]) => ({ label, value }));
    return { total, trend };
  }, [rideHistory]);

  const fetchDriverLocation = useCallback(async () => {
    try {
      const driverId =
        currentRide?.driver ||
        currentRide?.driver_id ||
        currentRide?.driver_user_id;

      if (!driverId) return;

      const response = await axios.get(
        `${API_URL}/drivers/location/${driverId}/`
      );

      const livePosition = [
        Number(response.data.current_lat || response.data.latitude || 18.0735),
        Number(response.data.current_lng || response.data.longitude || -15.9582),
      ];

      setDriverPosition(isPointInServiceArea(livePosition) ? livePosition : null);
    } catch (error) {
      console.log("Driver location error:", error.response?.data || error);
    }
  }, [currentRide]);

  useEffect(() => {
    fetchCurrentRide();
    fetchRiderIdentity();

    const interval = setInterval(() => {
      fetchCurrentRide();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchCurrentRide, fetchRiderIdentity]);

  useEffect(() => {
    if (!shouldTrackDriver) {
      setDriverPosition(null);
      return;
    }

    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchDriverLocation, shouldTrackDriver]);

  const requestRide = async () => {
    try {
      if (!hasRequiredRiderProfile) {
        setShowAccountPanel(true);
        setIdentityMessage("Please add your rider phone number and profile photo before requesting a ride.");
        return;
      }

      setRequesting(true);

      const response = await axios.post(
        `${API_URL}/rides/request/`,
        {
          pickup,
          destination,
          pickup_address: pickup,
          destination_address: destination,
          pickup_lat: pickupPosition[0],
          pickup_lng: pickupPosition[1],
          destination_lat: destinationPosition[0],
          destination_lng: destinationPosition[1],
          distance_km: distance,
          distance,
          ride_type: rideType,
          fare,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setCurrentRide(response.data);
      fetchCurrentRide();
    } catch (error) {
      const requestError =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        "Ride request failed";

      console.log("Ride request error:", error.response?.data || error);
      alert(requestError);
    } finally {
      setRequesting(false);
    }
  };

  const goToPayRate = () => {
    if (currentRide?.id) {
      localStorage.setItem("selectedRideId", currentRide.id);
    }

    window.location.href = "/rider-payments";
  };

  const shareTrip = async () => {
    if (!currentRide) return;

    const tripText = `Sakho Express trip #${currentRide.id}: ${
      currentRide.pickup || currentRide.pickup_address
    } to ${currentRide.destination || currentRide.destination_address}. Status: ${
      currentRide.status
    }. Driver: ${currentRide.driver_name || "not assigned yet"}.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Sakho Express trip",
          text: tripText,
          url: window.location.href,
        });
        return;
      }

      await navigator.clipboard.writeText(`${tripText} ${window.location.href}`);
      alert("Trip details copied");
    } catch (error) {
      console.log("Trip share error:", error);
      alert(tripText);
    }
  };

  const saveRiderIdentity = async (event) => {
    event.preventDefault();

    try {
      setIdentitySaving(true);
      setIdentityMessage("");

      const payload = new FormData();
      payload.append("phone_number", riderIdentity.phone_number || "");
      payload.append("national_id_number", riderIdentity.national_id_number || "");

      if (nationalIdFile) {
        payload.append("national_id_document", nationalIdFile);
      }

      if (profilePictureFile) {
        payload.append("profile_picture", profilePictureFile);
      }

      const response = await axios.post(`${API_URL}/auth/identity/update/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setRiderIdentity({
        phone_number: response.data.user.phone_number || "",
        national_id_number: response.data.user.national_id_number || "",
        national_id_document: response.data.user.national_id_document || "",
        has_national_id_document: Boolean(response.data.user.has_national_id_document),
        profile_picture: response.data.user.profile_picture || "",
        has_profile_picture: Boolean(response.data.user.has_profile_picture),
        member_since_year: response.data.user.member_since_year || riderIdentity.member_since_year,
        years_using_app: response.data.user.years_using_app || riderIdentity.years_using_app,
      });
      setNationalIdFile(null);
      setProfilePictureFile(null);
      setIdentityMessage("Account information updated.");
    } catch (error) {
      console.log("Rider identity update error:", error.response?.data || error);
      setIdentityMessage(
        error.response?.data?.error ||
          error.response?.data?.detail ||
          "Could not update National ID information."
      );
    } finally {
      setIdentitySaving(false);
    }
  };

  return (
    <main style={pageStyle}>
      <section style={mapStageStyle}>
        <GoogleTripMap
          key={city}
          center={selectedCity?.center || pickupPosition}
          zoom={13}
          style={mapStyle}
          fitPoints={[
            pickupPosition,
            destinationPosition,
            shouldTrackDriver ? driverPosition : null,
          ].filter(Boolean)}
          markers={mapMarkers}
          polylines={[
            {
              id: "rider-route",
              path: routePath.length ? routePath : [pickupPosition, destinationPosition],
              color: "#111827",
              weight: 5,
              opacity: 0.82,
            },
          ]}
        />

        <div style={topOverlayStyle}>
          <button
            type="button"
            onClick={() => setShowAccountPanel((current) => !current)}
            style={roundButtonStyle}
            aria-label="Account"
          >
            {riderIdentity.profile_picture ? (
              <img src={riderIdentity.profile_picture} alt="Rider" style={accountPhotoStyle} />
            ) : (
              "!"
            )}
          </button>
          <div style={locationPillStyle}>
            <img src={logoSrc} alt={`${MARKET.brandName} logo`} style={locationLogoStyle} />
            <strong>{city}</strong>
            <span>{activeStatus}</span>
          </div>
          <button
            type="button"
            onClick={shareTrip}
            disabled={!currentRide}
            style={{
              ...roundButtonStyle,
              opacity: currentRide ? 1 : 0.45,
            }}
            aria-label="Share trip"
          >
            ↗
          </button>
        </div>

        <div style={floatingSummaryStyle}>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Estimated fare</span>
            <strong>{formatMoney(fare)}</strong>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>ETA</span>
            <strong>{routeInfo ? `${routeInfo.etaMinutes} min` : "--"}</strong>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>Distance</span>
            <strong>{distance || 0} km</strong>
          </div>
        </div>
      </section>

      <section style={sheetStyle}>
        <div style={sheetHandleStyle} />

        {showAccountPanel && (
          <form onSubmit={saveRiderIdentity} style={accountPanelStyle}>
            <div>
              <span style={tinyLabelStyle}>Account security</span>
              <h2 style={panelTitleStyle}>Rider profile</h2>
            </div>
            <div style={photoStatusStyle}>
              {riderIdentity.profile_picture ? (
                <img src={riderIdentity.profile_picture} alt="Rider" style={profilePreviewStyle} />
              ) : (
                <div style={profileFallbackStyle}>R</div>
              )}
              <div>
                <strong>Rider photo is required</strong>
                <span style={profileHintStyle}>
                  Riders must keep a clear profile photo for safety.
                </span>
              </div>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setProfilePictureFile(event.target.files?.[0] || null)}
              style={fileInputStyle}
            />
            <input
              type="tel"
              value={riderIdentity.phone_number}
              onChange={(event) =>
                setRiderIdentity((current) => ({
                  ...current,
                  phone_number: event.target.value,
                }))
              }
              style={inputStyle}
              placeholder="+222 Phone number"
            />
            <input
              value={riderIdentity.national_id_number}
              onChange={(event) =>
                setRiderIdentity((current) => ({
                  ...current,
                  national_id_number: event.target.value,
                }))
              }
              style={inputStyle}
              placeholder="National ID number"
            />
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setNationalIdFile(event.target.files?.[0] || null)}
              style={fileInputStyle}
            />
            <button type="submit" disabled={identitySaving} style={secondaryActionStyle}>
              {identitySaving ? "Saving..." : "Save profile"}
            </button>
            {identityMessage && <p style={noticeTextStyle}>{identityMessage}</p>}
          </form>
        )}

        {currentRide && (
          <section style={liveTripStyle}>
            <div>
              <span style={tinyLabelStyle}>Current ride</span>
              <h2 style={panelTitleStyle}>{activeStatus}</h2>
            </div>
            <span style={statusPillStyle}>{currentRide.status}</span>
          </section>
        )}

        {currentRide?.driver_name && (
          <section style={driverPanelStyle}>
            {currentRide.driver_picture ? (
              <img src={currentRide.driver_picture} alt="Driver" style={driverPhotoStyle} />
            ) : (
              <div style={driverFallbackStyle}>
                {(currentRide.driver_name || "D").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div style={driverInfoStyle}>
              <strong>{currentRide.driver_name}</strong>
              <span>
                {currentRide.vehicle || "Vehicle"} · {currentRide.plate_number || "Plate"}
              </span>
              <span>
                {Number(currentRide.driver_rating || 0).toFixed(1)} rating ·{" "}
                {currentRide.completed_trips || 0} trips
              </span>
              <span style={privateCallHintStyle}>
                Private call: {currentRide.private_call_number || MARKET.privateCallNumber}
              </span>
            </div>

            <div style={driverActionStyle}>
              {currentRide.driver_phone && (
                <a href={`tel:${currentRide.driver_phone}`} style={callButtonStyle}>
                  Private call
                </a>
              )}
              <button type="button" onClick={shareTrip} style={shareButtonStyle}>
                Share
              </button>
            </div>
          </section>
        )}

        <section style={analyticsCardStyle}>
          <h3 style={{ margin: 0 }}>Rider spending history</h3>
          <p style={{ margin: "6px 0 14px", color: "#6b7280" }}>
            Total completed trip spending: <strong>{formatMoney(spendingHistory.total)}</strong>
          </p>
          <div style={spendingBarsStyle}>
            {(spendingHistory.trend.length ? spendingHistory.trend : [{ label: "No data", value: 0 }]).map((item) => {
              const maxValue = Math.max(...(spendingHistory.trend.length ? spendingHistory.trend : [{ value: 1 }]).map((entry) => entry.value), 1);
              const barHeight = `${Math.max(10, (item.value / maxValue) * 80)}px`;
              return (
                <div key={item.label} style={{ textAlign: "center" }}>
                  <div style={{ ...spendingBarStyle, height: barHeight }} />
                  <small>{item.label}</small>
                  <div style={{ fontWeight: 800, fontSize: "12px" }}>{formatMoney(item.value)}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={routeEditorStyle}>
          <select
            value={city}
            onChange={(event) => setCity(event.target.value)}
            style={citySelectStyle}
            aria-label="City"
          >
            {MARKET.cities.map((item) => (
              <option key={item.label} value={item.label}>
                {item.label}
              </option>
            ))}
          </select>

          <div style={addressStackStyle}>
            <div style={routeDotsStyle}>
              <span style={pickupDotStyle} />
              <span style={routeLineStyle} />
              <span style={dropoffDotStyle} />
            </div>
            <div style={addressInputsStyle}>
              <input
                list="mauritania-locations"
                value={pickup}
                onChange={(event) => setPickup(event.target.value)}
                placeholder="Pickup"
                style={addressInputStyle}
              />
              <input
                list="mauritania-locations"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Where to?"
                style={addressInputStyle}
              />
            </div>
          </div>

          <datalist id="mauritania-locations">
            {cityLocations.map((location) => (
              <option key={location.label} value={location.label} />
            ))}
          </datalist>
        </section>

        <section style={rideOptionsStyle}>
          {Object.keys(MARKET.fare).map((type) => {
            const selected = type === rideType;
            const optionFare = calculateFare(type, distance);
            return (
              <button
                key={type}
                type="button"
                onClick={() => setRideType(type)}
                style={{
                  ...rideOptionStyle,
                  borderColor: selected ? "#111827" : "#e5e7eb",
                  background: selected ? "#f9fafb" : "#ffffff",
                }}
              >
                <div style={rideMarkStyle}>{rideLabels[type]?.slice(0, 1) || "R"}</div>
                <div style={rideTextStyle}>
                  <strong>{rideLabels[type] || type}</strong>
                  <span>{rideSeats[type]} seats</span>
                </div>
                <strong>{formatMoney(optionFare)}</strong>
              </button>
            );
          })}
        </section>

        {currentRide?.status === "completed" ? (
          <button type="button" onClick={goToPayRate} style={primaryActionStyle}>
            Pay and rate
          </button>
        ) : (
          <button
            type="button"
            onClick={requestRide}
            disabled={requesting}
              style={{
                ...primaryActionStyle,
                opacity: requesting || !hasRequiredRiderProfile ? 0.68 : 1,
            }}
          >
            {requesting
              ? "Requesting..."
              : hasRequiredRiderProfile
                ? `Confirm ${rideLabels[rideType]}`
                : "Add rider phone and photo"}
          </button>
        )}
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f2f4f7",
  color: "#111827",
};

const mapStageStyle = {
  position: "relative",
  height: "52vh",
  minHeight: "390px",
  background: "#e5e7eb",
};

const mapStyle = {
  width: "100%",
  height: "100%",
};

const topOverlayStyle = {
  position: "absolute",
  top: "18px",
  left: "18px",
  right: "18px",
  zIndex: 5,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  pointerEvents: "none",
};

const roundButtonStyle = {
  width: "48px",
  height: "48px",
  borderRadius: "50%",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  background: "#ffffff",
  color: "#111827",
  fontWeight: 950,
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
  cursor: "pointer",
  pointerEvents: "auto",
  overflow: "hidden",
};

const accountPhotoStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const locationPillStyle = {
  minHeight: "48px",
  display: "grid",
  gridTemplateColumns: "28px auto",
  columnGap: "8px",
  alignContent: "center",
  alignItems: "center",
  justifyItems: "start",
  background: "rgba(255, 255, 255, 0.95)",
  border: "1px solid rgba(17, 24, 39, 0.08)",
  borderRadius: "999px",
  padding: "7px 18px",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
};

const locationLogoStyle = {
  gridRow: "1 / span 2",
  width: "34px",
  height: "28px",
  borderRadius: "7px",
  objectFit: "cover",
};

const floatingSummaryStyle = {
  position: "absolute",
  left: "50%",
  bottom: "24px",
  transform: "translateX(-50%)",
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(82px, 1fr))",
  gap: "1px",
  overflow: "hidden",
  borderRadius: "999px",
  background: "#e5e7eb",
  boxShadow: "0 18px 34px rgba(15, 23, 42, 0.18)",
};

const summaryItemStyle = {
  background: "rgba(255, 255, 255, 0.96)",
  padding: "10px 14px",
  textAlign: "center",
  minWidth: "88px",
};

const summaryLabelStyle = {
  display: "block",
  color: "#667085",
  fontSize: "0.72rem",
  fontWeight: 800,
};

const sheetStyle = {
  position: "relative",
  margin: "-18px auto 0",
  zIndex: 10,
  width: "min(780px, 100%)",
  minHeight: "48vh",
  background: "#ffffff",
  borderRadius: "22px 22px 0 0",
  padding: "10px 18px 24px",
  boxShadow: "0 -18px 34px rgba(15, 23, 42, 0.16)",
  boxSizing: "border-box",
};

const sheetHandleStyle = {
  width: "54px",
  height: "5px",
  borderRadius: "999px",
  background: "#d0d5dd",
  margin: "0 auto 16px",
};

const tinyLabelStyle = {
  display: "block",
  color: "#667085",
  fontSize: "0.74rem",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const panelTitleStyle = {
  margin: "3px 0 0",
  color: "#111827",
  fontSize: "1.25rem",
};

const accountPanelStyle = {
  display: "grid",
  gap: "10px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "14px",
  marginBottom: "12px",
};

const inputStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #d0d5dd",
  borderRadius: "8px",
  padding: "0 12px",
  boxSizing: "border-box",
  fontSize: "1rem",
};

const fileInputStyle = {
  color: "#344054",
  fontWeight: 800,
};

const secondaryActionStyle = {
  minHeight: "44px",
  border: "none",
  borderRadius: "8px",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};

const noticeTextStyle = {
  margin: 0,
  color: "#166534",
  fontWeight: 800,
};

const photoStatusStyle = {
  display: "grid",
  gridTemplateColumns: "54px 1fr",
  gap: "12px",
  alignItems: "center",
};

const profilePreviewStyle = {
  width: "54px",
  height: "54px",
  borderRadius: "50%",
  objectFit: "cover",
};

const profileFallbackStyle = {
  width: "54px",
  height: "54px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "#111827",
  color: "#ffffff",
  fontWeight: 950,
};

const profileHintStyle = {
  display: "block",
  color: "#667085",
  fontSize: "0.86rem",
  fontWeight: 700,
  marginTop: "2px",
};

const liveTripStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  padding: "10px 0 14px",
};

const statusPillStyle = {
  borderRadius: "999px",
  background: "#ecfdf3",
  color: "#166534",
  padding: "8px 11px",
  fontWeight: 900,
  textTransform: "capitalize",
};

const driverPanelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px",
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  marginBottom: "12px",
};

const driverPhotoStyle = {
  width: "58px",
  height: "58px",
  borderRadius: "50%",
  objectFit: "cover",
};

const driverFallbackStyle = {
  width: "58px",
  height: "58px",
  borderRadius: "50%",
  background: "#111827",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};

const driverInfoStyle = {
  flex: 1,
  minWidth: "160px",
  display: "grid",
  gap: "3px",
};

const privateCallHintStyle = {
  color: "#475467",
  fontSize: "0.82rem",
  fontWeight: 800,
};

const driverActionStyle = {
  display: "grid",
  gap: "7px",
};

const callButtonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "36px",
  borderRadius: "999px",
  padding: "0 12px",
  background: "#111827",
  color: "white",
  fontWeight: 900,
  textDecoration: "none",
};

const shareButtonStyle = {
  minHeight: "36px",
  border: "none",
  borderRadius: "999px",
  background: "#eef2ff",
  color: "#3730a3",
  fontWeight: 900,
  cursor: "pointer",
};

const routeEditorStyle = {
  display: "grid",
  gap: "12px",
};

const citySelectStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid #d0d5dd",
  borderRadius: "999px",
  background: "#f9fafb",
  padding: "0 14px",
  fontWeight: 900,
};

const addressStackStyle = {
  display: "grid",
  gridTemplateColumns: "28px 1fr",
  gap: "8px",
  alignItems: "stretch",
};

const routeDotsStyle = {
  display: "grid",
  justifyItems: "center",
  padding: "12px 0",
};

const pickupDotStyle = {
  width: "9px",
  height: "9px",
  borderRadius: "50%",
  background: "#111827",
};

const dropoffDotStyle = {
  width: "10px",
  height: "10px",
  background: "#111827",
};

const routeLineStyle = {
  width: "2px",
  minHeight: "40px",
  background: "#d0d5dd",
};

const addressInputsStyle = {
  display: "grid",
  gap: "8px",
};

const addressInputStyle = {
  width: "100%",
  minHeight: "48px",
  border: "none",
  borderRadius: "8px",
  background: "#f2f4f7",
  padding: "0 14px",
  boxSizing: "border-box",
  color: "#111827",
  fontWeight: 900,
  fontSize: "1rem",
};

const rideOptionsStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "14px",
};

const analyticsCardStyle = {
  marginTop: "14px",
  border: "1px solid #e5e7eb",
  borderRadius: "16px",
  padding: "14px",
  background: "#ffffff",
};

const spendingBarsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(56px, 1fr))",
  gap: "8px",
  alignItems: "end",
};

const spendingBarStyle = {
  background: "linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)",
  borderRadius: "8px 8px 4px 4px",
};

const rideOptionStyle = {
  minHeight: "68px",
  border: "2px solid #e5e7eb",
  borderRadius: "12px",
  display: "grid",
  gridTemplateColumns: "48px 1fr auto",
  gap: "12px",
  alignItems: "center",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
};

const rideMarkStyle = {
  width: "42px",
  height: "42px",
  borderRadius: "50%",
  background: "#111827",
  color: "white",
  display: "grid",
  placeItems: "center",
  fontWeight: 950,
};

const rideTextStyle = {
  display: "grid",
  gap: "3px",
};

const primaryActionStyle = {
  width: "100%",
  minHeight: "54px",
  marginTop: "14px",
  border: "none",
  borderRadius: "999px",
  background: "#111827",
  color: "white",
  fontWeight: 950,
  fontSize: "1.05rem",
  cursor: "pointer",
};
