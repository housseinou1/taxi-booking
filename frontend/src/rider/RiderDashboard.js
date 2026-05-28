import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import GoogleTripMap from "../maps/GoogleTripMap";
import SafetyEmergencyPanel from "../safety/SafetyEmergencyPanel";
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
  if (status === "driver_arrived") return "Driver arrived";
  if (status === "in_progress") return "On trip";
  if (status === "completed") return "Trip complete";
  if (status === "cancelled") return "Cancelled";
  return status.replace("_", " ");
};

const rideStatusSteps = [
  { key: "driver_arriving", title: "Driver arriving", text: "Your driver is on the way." },
  { key: "driver_arrived", title: "Driver arrived", text: "Meet your driver at pickup." },
  { key: "in_progress", title: "Trip started", text: "You are heading to destination." },
  { key: "completed", title: "Trip completed", text: "Pay, tip, and rate your trip." },
];

const getStatusStepIndex = (status) => {
  if (["requested", "pending"].includes(status)) return -1;
  if (["accepted", "driver_arriving"].includes(status)) return 0;
  if (status === "driver_arrived") return 1;
  if (status === "in_progress") return 2;
  if (status === "completed") return 3;
  return -1;
};

const activeRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
]);

const liveDriverStatuses = new Set([
  "accepted",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
]);

const cancellableRideStatuses = new Set([
  "requested",
  "pending",
  "accepted",
  "driver_arriving",
  "driver_arrived",
]);

const getDriverPhoto = (ride) =>
  ride?.driver_picture ||
  ride?.driver_photo ||
  ride?.driver_profile_picture ||
  ride?.driver_image ||
  "";

const getVehicleLabel = (ride) =>
  ride?.vehicle ||
  [ride?.vehicle_make, ride?.vehicle_model].filter(Boolean).join(" ") ||
  ride?.car_type ||
  "Vehicle";

const getPlateNumber = (ride) =>
  ride?.plate_number || ride?.vehicle_plate || ride?.plate || "pending";

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
  const [animatedDriverPosition, setAnimatedDriverPosition] = useState(null);
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
  const [showSafetyPanel, setShowSafetyPanel] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [lastCancellation, setLastCancellation] = useState(null);

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
  const statusStepIndex = getStatusStepIndex(currentRide?.status);
  const trackingTarget =
    currentRide?.status === "in_progress" ? destinationPosition : pickupPosition;
  const displayedDriverPosition = driverPosition || animatedDriverPosition;
  const liveTrackingDistance = shouldTrackDriver
    ? calculateDistanceKm(
        displayedDriverPosition,
        trackingTarget
      )
    : null;
  const liveTrackingEta = liveTrackingDistance
    ? Math.max(1, Math.round((liveTrackingDistance / 32) * 60))
    : null;
  const hasRequiredRiderProfile =
    riderIdentity.has_profile_picture && Boolean(riderIdentity.phone_number?.trim());
  const canCancelCurrentRide =
    currentRide && cancellableRideStatuses.has(currentRide.status);

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
          displayedDriverPosition && {
          id: "driver",
          position: displayedDriverPosition,
          title: "Driver live location",
          label: "C",
          type: "driver",
        },
      ].filter(Boolean),
    [
      destination,
      destinationPosition,
      displayedDriverPosition,
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
        const activeRide = response.data.find((ride) =>
          activeRideStatuses.has(ride.status)
        );
        setCurrentRide(activeRide || null);
      } else {
        setCurrentRide(null);
      }
    } catch (error) {
      console.log("Ride history error:", error.response?.data || error);
    }
  }, [token]);

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
      setAnimatedDriverPosition(null);
      return;
    }

    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchDriverLocation, shouldTrackDriver]);

  useEffect(() => {
    if (!shouldTrackDriver) return undefined;

    if (driverPosition) {
      setAnimatedDriverPosition(driverPosition);
      return undefined;
    }

    const fallbackPath =
      currentRide?.status === "in_progress" && routePath.length > 1
        ? routePath
        : [
            [pickupPosition[0] + 0.018, pickupPosition[1] - 0.018],
            [pickupPosition[0] + 0.012, pickupPosition[1] - 0.012],
            [pickupPosition[0] + 0.006, pickupPosition[1] - 0.006],
            pickupPosition,
          ];

    let index = 0;
    setAnimatedDriverPosition(fallbackPath[0]);

    const interval = setInterval(() => {
      index = Math.min(index + 1, fallbackPath.length - 1);
      setAnimatedDriverPosition(fallbackPath[index]);

      if (index >= fallbackPath.length - 1 && currentRide?.status !== "in_progress") {
        index = fallbackPath.length - 2;
      }
    }, 1600);

    return () => clearInterval(interval);
  }, [
    currentRide?.status,
    driverPosition,
    pickupPosition,
    routePath,
    shouldTrackDriver,
  ]);

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

  const cancelRide = async () => {
    if (!currentRide || !canCancelCurrentRide) return;

    if (!cancelReason.trim()) {
      setLastCancellation({
        tone: "warning",
        title: "Choose a cancellation reason",
        text: "Please tell us why you are cancelling before we close this request.",
      });
      return;
    }

    try {
      setCancelSaving(true);

      const response = await axios.post(
        `${API_URL}/rides/cancel/${currentRide.id}/`,
        {
          reason: cancelReason.trim(),
          cancelled_by: "rider",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setLastCancellation({
        tone: "success",
        title: "Ride cancelled",
        text:
          response.data.refund_status ||
          "Authorization released or no charge captured",
        fee: response.data.cancellation_fee || "0.00",
        reason: cancelReason.trim(),
      });
      setCurrentRide(null);
      setCancelModalOpen(false);
      setCancelReason("");
      fetchCurrentRide();
    } catch (error) {
      const cancelError =
        error.response?.data?.detail ||
        error.response?.data?.error ||
        "Could not cancel ride";

      setLastCancellation({
        tone: "error",
        title: "Cancellation failed",
        text: cancelError,
      });
    } finally {
      setCancelSaving(false);
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
    <main className="sx-live-ride-page" style={pageStyle}>
      <RiderTrackingStyles />
      <section className="sx-live-map-stage" style={mapStageStyle}>
        <GoogleTripMap
          key={city}
          center={selectedCity?.center || pickupPosition}
          zoom={13}
          style={mapStyle}
          fitPoints={[
            pickupPosition,
            destinationPosition,
            shouldTrackDriver ? displayedDriverPosition : null,
          ].filter(Boolean)}
          markers={mapMarkers}
          polylines={[
            {
              id: "rider-route",
              path: routePath.length ? routePath : [pickupPosition, destinationPosition],
              color: "#111827",
              weight: 5,
              opacity: 0.82,
              animated: Boolean(currentRide),
            },
            shouldTrackDriver &&
              displayedDriverPosition && {
                id: "live-driver-route",
                path: [
                  displayedDriverPosition,
                  trackingTarget,
                ],
                color: "#2563eb",
                weight: 5,
                opacity: 0.72,
                animated: true,
              },
          ].filter(Boolean)}
        />

        {currentRide && (
          <div className="sx-live-hud">
            <span>{activeStatus}</span>
            <strong>
              {liveTrackingEta
                ? `${liveTrackingEta} min`
                : routeInfo
                  ? `${routeInfo.etaMinutes} min`
                  : "--"}
            </strong>
            <small>
              {liveTrackingDistance
                ? `${liveTrackingDistance.toFixed(1)} km away`
                : `${distance || 0} km trip`}
            </small>
          </div>
        )}

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
            onClick={() => setShowSafetyPanel((current) => !current)}
            style={{
              ...roundButtonStyle,
              ...sosButtonStyle,
            }}
            aria-label="Emergency SOS"
          >
            SOS
          </button>
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
            <span style={summaryLabelStyle}>
              {shouldTrackDriver ? "Live ETA" : "ETA"}
            </span>
            <strong>
              {liveTrackingEta
                ? `${liveTrackingEta} min`
                : routeInfo
                  ? `${routeInfo.etaMinutes} min`
                  : "--"}
            </strong>
          </div>
          <div style={summaryItemStyle}>
            <span style={summaryLabelStyle}>
              {shouldTrackDriver ? "Live distance" : "Distance"}
            </span>
            <strong>
              {liveTrackingDistance
                ? `${liveTrackingDistance.toFixed(1)} km`
                : `${distance || 0} km`}
            </strong>
          </div>
        </div>
      </section>

      <section className="sx-rider-bottom-sheet" style={sheetStyle}>
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
          <section className="sx-live-trip-card" style={liveTripStyle}>
            <div>
              <span style={tinyLabelStyle}>Current ride</span>
              <h2 style={panelTitleStyle}>{activeStatus}</h2>
            </div>
            <div style={rideStatusActionStyle}>
              <span style={statusPillStyle}>{currentRide.status}</span>
              {canCancelCurrentRide && (
                <button
                  type="button"
                  onClick={() => {
                    setLastCancellation(null);
                    setCancelModalOpen(true);
                  }}
                  style={cancelRideButtonStyle}
                >
                  Cancel ride
                </button>
              )}
            </div>
          </section>
        )}

        {lastCancellation && (
          <section
            style={{
              ...refundStatusStyle,
              borderColor:
                lastCancellation.tone === "error"
                  ? "rgba(248, 113, 113, 0.35)"
                  : lastCancellation.tone === "warning"
                    ? "rgba(250, 204, 21, 0.35)"
                    : "rgba(34, 197, 94, 0.35)",
            }}
          >
            <div>
              <span style={tinyLabelStyle}>Refund status</span>
              <strong>{lastCancellation.title}</strong>
              <p>{lastCancellation.text}</p>
              {lastCancellation.reason && <small>Reason: {lastCancellation.reason}</small>}
            </div>
            {lastCancellation.fee && (
              <span style={refundFeePillStyle}>Fee {formatMoney(lastCancellation.fee)}</span>
            )}
          </section>
        )}

        {currentRide && (
          <section className="sx-status-timeline" aria-label="Live ride status">
            {rideStatusSteps.map((step, index) => {
              const isDone = index < statusStepIndex;
              const isActive = index === statusStepIndex;

              return (
                <article
                  key={step.key}
                  className={`${isDone ? "done" : ""} ${isActive ? "active" : ""}`}
                >
                  <span>{isDone ? "✓" : index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        {currentRide?.driver_name && (
          <section className="sx-driver-info-card" style={driverPanelStyle}>
            {getDriverPhoto(currentRide) ? (
              <img src={getDriverPhoto(currentRide)} alt="Driver" style={driverPhotoStyle} />
            ) : (
              <div style={driverFallbackStyle}>
                {(currentRide.driver_name || "D").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div style={driverInfoStyle}>
              <strong>{currentRide.driver_name}</strong>
              <span>
                {getVehicleLabel(currentRide)} · Plate {getPlateNumber(currentRide)}
              </span>
              <span>
                ★ {Number(currentRide.driver_rating || 5).toFixed(1)} rating ·{" "}
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

        {(showSafetyPanel || currentRide) && (
          <div style={safetyPanelWrapStyle}>
            <SafetyEmergencyPanel
              role="rider"
              currentRide={currentRide}
              onShareTrip={shareTrip}
              onClose={() => setShowSafetyPanel(false)}
            />
          </div>
        )}

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
                  borderColor: selected ? "#facc15" : "rgba(255,255,255,0.1)",
                  background: selected ? "rgba(250,204,21,0.12)" : "rgba(255,255,255,0.04)",
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

      {cancelModalOpen && (
        <div style={modalBackdropStyle} role="presentation">
          <section style={modalCardStyle} role="dialog" aria-modal="true" aria-label="Cancel ride">
            <span style={tinyLabelStyle}>Cancel ride</span>
            <h2 style={modalTitleStyle}>Why are you cancelling?</h2>
            <p style={modalTextStyle}>
              You can cancel before the trip starts. Cancellation fee logic is ready as a placeholder and currently shows 0 MRU.
            </p>
            <select
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              style={modalSelectStyle}
            >
              <option value="">Select a reason</option>
              <option value="Driver is too far">Driver is too far</option>
              <option value="Changed my plans">Changed my plans</option>
              <option value="Pickup location is wrong">Pickup location is wrong</option>
              <option value="Found another ride">Found another ride</option>
              <option value="Other">Other</option>
            </select>
            {lastCancellation?.tone === "warning" && (
              <p style={modalInlineNoticeStyle}>{lastCancellation.text}</p>
            )}
            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                style={modalGhostButtonStyle}
              >
                Keep ride
              </button>
              <button
                type="button"
                onClick={cancelRide}
                disabled={cancelSaving}
                style={{
                  ...modalDangerButtonStyle,
                  opacity: cancelSaving ? 0.72 : 1,
                }}
              >
                {cancelSaving ? "Cancelling..." : "Cancel ride"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function RiderTrackingStyles() {
  return (
    <style>{`
      .sx-live-ride-page {
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .sx-live-hud {
        position: absolute;
        z-index: 6;
        left: 50%;
        top: 88px;
        transform: translateX(-50%);
        min-width: 190px;
        display: grid;
        justify-items: center;
        gap: 2px;
        padding: 12px 18px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 22px;
        background: rgba(3, 7, 18, 0.88);
        color: #fff;
        box-shadow: 0 20px 44px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(14px);
        pointer-events: none;
      }

      .sx-live-hud span {
        color: #facc15;
        font-size: 0.72rem;
        font-weight: 950;
        text-transform: uppercase;
      }

      .sx-live-hud strong {
        font-size: 1.65rem;
        line-height: 1;
      }

      .sx-live-hud small {
        color: rgba(255,255,255,0.72);
        font-weight: 800;
      }

      .sx-status-timeline {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin: 0 0 12px;
      }

      .sx-status-timeline article {
        min-width: 0;
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        gap: 8px;
        align-items: center;
        padding: 10px;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.58);
      }

      .sx-status-timeline article > span {
        width: 30px;
        height: 30px;
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(255,255,255,0.08);
        color: rgba(255,255,255,0.7);
        font-weight: 950;
      }

      .sx-status-timeline article strong,
      .sx-status-timeline article small {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sx-status-timeline article strong {
        color: inherit;
        font-size: 0.86rem;
      }

      .sx-status-timeline article small {
        margin-top: 2px;
        color: rgba(255,255,255,0.48);
        font-size: 0.72rem;
        line-height: 1.25;
      }

      .sx-status-timeline article.done,
      .sx-status-timeline article.active {
        color: #fff;
        border-color: rgba(250, 204, 21, 0.34);
        background: rgba(250, 204, 21, 0.1);
      }

      .sx-status-timeline article.done > span,
      .sx-status-timeline article.active > span {
        background: #facc15;
        color: #111827;
      }

      .sx-driver-info-card {
        transition: transform .22s ease, border-color .22s ease;
      }

      .sx-driver-info-card:hover {
        transform: translateY(-1px);
        border-color: rgba(250, 204, 21, 0.38) !important;
      }

      @media (max-width: 720px) {
        .sx-live-map-stage {
          height: 54vh !important;
          min-height: 360px !important;
        }

        .sx-live-hud {
          top: 80px;
          min-width: 170px;
        }

        .sx-rider-bottom-sheet {
          width: 100% !important;
          min-height: 50vh !important;
          border-radius: 24px 24px 0 0 !important;
          padding-left: 14px !important;
          padding-right: 14px !important;
        }

        .sx-status-timeline {
          grid-template-columns: 1fr;
        }

        .sx-status-timeline article small {
          white-space: normal;
        }

        .sx-driver-info-card {
          align-items: flex-start !important;
          flex-wrap: wrap;
        }
      }
    `}</style>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#030712",
  color: "#f8fafc",
};

const mapStageStyle = {
  position: "relative",
  height: "52vh",
  minHeight: "390px",
  background: "#111827",
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

const sosButtonStyle = {
  width: "58px",
  borderRadius: "999px",
  background: "#dc2626",
  color: "white",
  border: "1px solid rgba(255,255,255,0.18)",
  boxShadow: "0 14px 30px rgba(220, 38, 38, 0.34)",
  fontSize: "0.78rem",
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
  background: "rgba(3, 7, 18, 0.88)",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  borderRadius: "999px",
  padding: "7px 18px",
  color: "#ffffff",
  boxShadow: "0 12px 28px rgba(0, 0, 0, 0.28)",
  backdropFilter: "blur(12px)",
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
  background: "rgba(255,255,255,0.14)",
  boxShadow: "0 18px 34px rgba(0, 0, 0, 0.3)",
};

const summaryItemStyle = {
  background: "rgba(3, 7, 18, 0.9)",
  color: "#ffffff",
  padding: "10px 14px",
  textAlign: "center",
  minWidth: "88px",
  backdropFilter: "blur(12px)",
};

const summaryLabelStyle = {
  display: "block",
  color: "rgba(255,255,255,0.62)",
  fontSize: "0.72rem",
  fontWeight: 800,
};

const sheetStyle = {
  position: "relative",
  margin: "-18px auto 0",
  zIndex: 10,
  width: "min(780px, 100%)",
  minHeight: "48vh",
  background: "linear-gradient(180deg, #101827 0%, #070b14 100%)",
  borderRadius: "22px 22px 0 0",
  padding: "10px 18px 24px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderBottom: "none",
  boxShadow: "0 -18px 44px rgba(0, 0, 0, 0.34)",
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
  color: "rgba(255,255,255,0.58)",
  fontSize: "0.74rem",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const panelTitleStyle = {
  margin: "3px 0 0",
  color: "#ffffff",
  fontSize: "1.25rem",
};

const accountPanelStyle = {
  display: "grid",
  gap: "10px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  padding: "14px",
  marginBottom: "12px",
};

const inputStyle = {
  width: "100%",
  minHeight: "44px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "8px",
  padding: "0 12px",
  boxSizing: "border-box",
  fontSize: "1rem",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
};

const fileInputStyle = {
  color: "#344054",
  fontWeight: 800,
};

const secondaryActionStyle = {
  minHeight: "44px",
  border: "none",
  borderRadius: "8px",
  background: "#facc15",
  color: "#111827",
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
  padding: "10px 0 12px",
};

const rideStatusActionStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "8px",
  flexWrap: "wrap",
};

const statusPillStyle = {
  borderRadius: "999px",
  background: "rgba(34, 197, 94, 0.15)",
  color: "#86efac",
  padding: "8px 11px",
  fontWeight: 900,
  textTransform: "capitalize",
};

const cancelRideButtonStyle = {
  minHeight: "38px",
  border: "1px solid rgba(248, 113, 113, 0.34)",
  borderRadius: "999px",
  background: "rgba(127, 29, 29, 0.42)",
  color: "#fecaca",
  padding: "0 13px",
  fontWeight: 900,
  cursor: "pointer",
};

const refundStatusStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
  padding: "13px",
  border: "1px solid rgba(34, 197, 94, 0.35)",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.06)",
  marginBottom: "12px",
};

const refundFeePillStyle = {
  borderRadius: "999px",
  background: "rgba(250, 204, 21, 0.14)",
  color: "#fde68a",
  padding: "8px 11px",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const driverPanelStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "12px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "18px",
  marginBottom: "12px",
  color: "#ffffff",
};

const safetyPanelWrapStyle = {
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
  color: "rgba(255,255,255,0.58)",
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
  background: "#facc15",
  color: "#111827",
  fontWeight: 900,
  textDecoration: "none",
};

const shareButtonStyle = {
  minHeight: "36px",
  border: "none",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  color: "#ffffff",
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
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
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
  background: "rgba(255,255,255,0.07)",
  padding: "0 14px",
  boxSizing: "border-box",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "1rem",
};

const rideOptionsStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "14px",
};

const rideOptionStyle = {
  minHeight: "68px",
  border: "2px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  display: "grid",
  gridTemplateColumns: "48px 1fr auto",
  gap: "12px",
  alignItems: "center",
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
  color: "#ffffff",
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
  background: "#facc15",
  color: "#111827",
  fontWeight: 950,
  fontSize: "1.05rem",
  cursor: "pointer",
};

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 50,
  display: "grid",
  placeItems: "center",
  padding: "18px",
  background: "rgba(3, 7, 18, 0.72)",
  backdropFilter: "blur(10px)",
};

const modalCardStyle = {
  width: "min(440px, 100%)",
  borderRadius: "22px",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  background: "linear-gradient(180deg, #111827 0%, #030712 100%)",
  color: "#ffffff",
  padding: "20px",
  boxShadow: "0 26px 70px rgba(0, 0, 0, 0.42)",
};

const modalTitleStyle = {
  margin: "4px 0 8px",
  fontSize: "1.45rem",
};

const modalTextStyle = {
  margin: "0 0 14px",
  color: "rgba(255,255,255,0.68)",
  lineHeight: 1.5,
};

const modalSelectStyle = {
  width: "100%",
  minHeight: "48px",
  borderRadius: "12px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0b1220",
  color: "#ffffff",
  padding: "0 12px",
  fontWeight: 850,
};

const modalInlineNoticeStyle = {
  margin: "12px 0 0",
  color: "#fde68a",
  fontWeight: 850,
};

const modalActionsStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  marginTop: "16px",
};

const modalGhostButtonStyle = {
  minHeight: "46px",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.06)",
  color: "#ffffff",
  fontWeight: 900,
  cursor: "pointer",
};

const modalDangerButtonStyle = {
  minHeight: "46px",
  border: "none",
  borderRadius: "999px",
  background: "#dc2626",
  color: "#ffffff",
  fontWeight: 950,
  cursor: "pointer",
};
