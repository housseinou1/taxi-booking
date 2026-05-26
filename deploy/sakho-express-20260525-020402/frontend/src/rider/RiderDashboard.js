import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";
import { API_URL } from "../apiConfig";
import {
  MARKET,
  calculateDistanceKm,
  calculateFare,
  formatMoney,
  getLocationByLabel,
  getLocationsByCity,
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
    national_id_number: "",
    national_id_document: "",
    has_national_id_document: false,
  });
  const [nationalIdFile, setNationalIdFile] = useState(null);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMessage, setIdentityMessage] = useState("");

  const token = localStorage.getItem("access");

  const cityLocations = getLocationsByCity(city);
  const selectedCity = MARKET.cities.find((item) => item.label === city);
  const pickupLocation = getLocationByLabel(pickup, city);
  const destinationLocation = getLocationByLabel(destination, city);
  const pickupPosition = pickupLocation?.position || MARKET.defaultPickup.position;
  const destinationPosition =
    destinationLocation?.position || MARKET.defaultDestination.position;
  const isDistanceAutomatic = Boolean(pickupLocation && destinationLocation);

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
        national_id_number: response.data.national_id_number || "",
        national_id_document: response.data.national_id_document || "",
        has_national_id_document: Boolean(response.data.has_national_id_document),
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
        setCurrentRide(response.data[0]);
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

      setDriverPosition([
        Number(response.data.current_lat || response.data.latitude || 18.0735),
        Number(response.data.current_lng || response.data.longitude || -15.9582),
      ]);
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
    if (!currentRide) return;

    fetchDriverLocation();

    const interval = setInterval(() => {
      fetchDriverLocation();
    }, 2000);

    return () => clearInterval(interval);
  }, [currentRide, fetchDriverLocation]);

  const requestRide = async () => {
    try {
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
      alert("Ride requested successfully");
      fetchCurrentRide();
    } catch (error) {
      console.log("Ride request error:", error.response?.data || error);
      alert("Ride request failed");
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
      payload.append("national_id_number", riderIdentity.national_id_number || "");

      if (nationalIdFile) {
        payload.append("national_id_document", nationalIdFile);
      }

      const response = await axios.post(`${API_URL}/auth/identity/update/`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });

      setRiderIdentity({
        national_id_number: response.data.user.national_id_number || "",
        national_id_document: response.data.user.national_id_document || "",
        has_national_id_document: Boolean(response.data.user.has_national_id_document),
      });
      setNationalIdFile(null);
      setIdentityMessage("National ID information updated successfully.");
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

  const renderRideButton = (type, label) => (
    <button
      onClick={() => setRideType(type)}
      style={{
        ...rideOptionButtonStyle,
        borderColor: rideType === type ? "#111827" : "#d7dde7",
        cursor: "pointer",
        background: rideType === type ? "#111827" : "#ffffff",
        color: rideType === type ? "white" : "#111827",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Rider dashboard</div>
            <h1 style={titleStyle}>Book and track your Nouakchott ride</h1>
            <p style={subtitleStyle}>
              Choose your city, set pickup, and follow driver status in real time.
            </p>
          </div>

          <div style={heroStatsStyle}>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>Fare</span>
              <strong>{formatMoney(fare)}</strong>
            </div>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>Distance</span>
              <strong>{distance || 0} KM</strong>
            </div>
          </div>
        </section>

        <section style={identityPanelStyle}>
          <div>
            <span style={sectionKickerStyle}>Security</span>
            <h2 style={identityTitleStyle}>National ID verification</h2>
            <p style={identityTextStyle}>
              Add your National Identification Number and upload your ID document.
            </p>
          </div>
          <form onSubmit={saveRiderIdentity} style={identityFormStyle}>
            <label style={identityFieldStyle}>
              <span>National Identification Number</span>
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
            </label>
            <label style={identityFieldStyle}>
              <span>National ID document</span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setNationalIdFile(event.target.files?.[0] || null)}
                style={fileInputStyle}
              />
              <small style={identityTextStyle}>
                {nationalIdFile
                  ? nationalIdFile.name
                  : riderIdentity.has_national_id_document
                    ? "Current ID document uploaded"
                    : "No ID document uploaded"}
              </small>
              {riderIdentity.national_id_document && (
                <a
                  href={riderIdentity.national_id_document}
                  target="_blank"
                  rel="noreferrer"
                  style={identityLinkStyle}
                >
                  View current ID
                </a>
              )}
            </label>
            <button
              type="submit"
              disabled={identitySaving}
              style={{
                ...identitySaveButtonStyle,
                opacity: identitySaving ? 0.7 : 1,
              }}
            >
              {identitySaving ? "Saving..." : "Save National ID"}
            </button>
            {identityMessage && <p style={identityMessageStyle}>{identityMessage}</p>}
          </form>
        </section>

        <div style={workspaceStyle}>
          <section style={bookingPanelStyle}>
            <div style={sectionHeaderStyle}>
              <span style={sectionKickerStyle}>Trip details</span>
              <h2 style={sectionTitleStyle}>Where to?</h2>
            </div>

            <label style={labelStyle}>City</label>
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              style={inputStyle}
            >
              {MARKET.cities.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>

            <label style={labelStyle}>Pickup</label>
            <input
              list="mauritania-locations"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              placeholder="Pickup"
              style={inputStyle}
            />

            <label style={labelStyle}>Destination</label>
            <input
              list="mauritania-locations"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destination"
              style={inputStyle}
            />

            <datalist id="mauritania-locations">
              {cityLocations.map((location) => (
                <option key={location.label} value={location.label} />
              ))}
            </datalist>

            <label style={labelStyle}>Distance</label>
            <input
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              type="number"
              min="1"
              step="0.1"
              readOnly={isDistanceAutomatic}
              style={inputStyle}
            />
            <div style={distanceHelpStyle}>
              {isDistanceAutomatic
                ? "Distance is calculated automatically from pickup and destination."
                : "Choose a known Nouakchott place or type distance manually."}
            </div>

            <div style={rideHeaderStyle}>Vehicle type</div>

            <div style={rideGridStyle}>
              {renderRideButton("regular", "Regular")}
              {renderRideButton("xl", "XL")}
              {renderRideButton("comfort", "Comfort")}
              {renderRideButton("share", "Share")}
            </div>

            <div style={fareCardStyle}>
              <span>Estimated fare</span>
              <strong>{formatMoney(fare)}</strong>
              {routeInfo && (
                <small style={fareHintStyle}>
                  Route ETA {routeInfo.etaMinutes} min · {routeInfo.distanceKm.toFixed(1)} km
                </small>
              )}
            </div>

            <button
              onClick={requestRide}
              disabled={requesting}
              style={{
                ...confirmButtonStyle,
                opacity: requesting ? 0.68 : 1,
              }}
            >
              {requesting ? "Requesting ride..." : "Confirm ride"}
            </button>

            {currentRide?.status === "requested" && (
              <div style={infoBoxStyle}>Searching for a driver</div>
            )}

            {(currentRide?.status === "accepted" ||
              currentRide?.status === "driver_arriving") && (
              <div style={successBoxStyle}>Driver accepted your ride</div>
            )}

            {currentRide?.status === "in_progress" && (
              <div style={successBoxStyle}>Ride in progress</div>
            )}

            {currentRide?.status === "completed" && (
              <>
                <div style={successBoxStyle}>
                  Ride completed. You can now pay and rate.
                </div>

                <button onClick={goToPayRate} style={payRateButtonStyle}>
                  Pay and rate ride
                </button>
              </>
            )}
          </section>

          <section style={mapPanelStyle}>
            <div style={mapHeaderStyle}>
              <div>
                <span style={sectionKickerStyle}>Live route</span>
                <h2 style={sectionTitleStyle}>Trip map</h2>
              </div>
              <span style={routeBadgeStyle}>{city}</span>
            </div>

            <div style={mapFrameStyle}>
              <MapContainer
                key={city}
                center={selectedCity?.center || pickupPosition}
                zoom={13}
                style={mapStyle}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <Marker position={pickupPosition}>
                  <Popup>Pickup: {pickup}</Popup>
                </Marker>

                <Marker position={destinationPosition}>
                  <Popup>Destination: {destination}</Popup>
                </Marker>

                {driverPosition && (
                  <Marker position={driverPosition}>
                    <Popup>Driver live location</Popup>
                  </Marker>
                )}

                <Polyline
                  positions={routePath.length ? routePath : [pickupPosition, destinationPosition]}
                  pathOptions={{ color: "#111827", weight: 4 }}
                />
              </MapContainer>
            </div>

            {currentRide ? (
              <div style={rideCardStyle}>
                <div style={rideCardHeaderStyle}>
                  <div>
                    <span style={sectionKickerStyle}>Current ride</span>
                    <h2 style={sectionTitleStyle}>Ride #{currentRide.id}</h2>
                  </div>
                  <span style={statusPillStyle}>{currentRide.status}</span>
                </div>

                <div style={detailsGridStyle}>
                  <Detail label="Pickup" value={currentRide.pickup || currentRide.pickup_address || "N/A"} />
                  <Detail
                    label="Destination"
                    value={currentRide.destination || currentRide.destination_address || "N/A"}
                  />
                  <Detail label="Fare" value={formatMoney(currentRide.fare)} />
                  <Detail label="Vehicle" value={currentRide.vehicle || "N/A"} />
                </div>

                <div style={rideActionsStyle}>
                  <button onClick={shareTrip} style={shareButtonStyle}>
                    Share trip
                  </button>
                  {currentRide.driver_phone && (
                    <a href={`tel:${currentRide.driver_phone}`} style={secondaryCallButtonStyle}>
                      Call driver
                    </a>
                  )}
                </div>

                {(currentRide.driver ||
                  currentRide.driver_name ||
                  currentRide.driver_email) && (
                  <div style={driverBoxStyle}>
                    {currentRide.driver_picture && (
                      <img
                        src={currentRide.driver_picture}
                        alt="Driver"
                        style={driverImageStyle}
                      />
                    )}

                    <div style={{ flex: 1 }}>
                      <h3 style={driverTitleStyle}>
                        {currentRide.driver_name || "Driver assigned"}
                      </h3>
                      <p style={mutedTextStyle}>{currentRide.driver_email || "N/A"}</p>
                      <p style={mutedTextStyle}>
                        {currentRide.driver_phone || "No phone provided"}
                      </p>
                      <p style={mutedTextStyle}>
                        Plate: {currentRide.plate_number || "N/A"}
                      </p>
                      <p style={mutedTextStyle}>
                        Level: {currentRide.driver_category_label || "N/A"}
                      </p>
                      <p style={mutedTextStyle}>
                        Rating: {Number(currentRide.driver_rating || 0).toFixed(1)} · {currentRide.completed_trips || 0} trips
                      </p>
                    </div>

                    {currentRide.driver_phone && (
                      <a href={`tel:${currentRide.driver_phone}`} style={callButtonStyle}>
                        Call
                      </a>
                    )}
                  </div>
                )}

                {currentRide.status === "completed" && (
                  <div style={ratingPreviewStyle}>
                    Rate your driver after payment to help keep the platform reliable.
                  </div>
                )}
              </div>
            ) : (
              <div style={emptyRideStyle}>
                Confirm a ride to see live status, driver details, and payment options here.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div style={detailStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f4f6f9",
  color: "#111827",
};

const shellStyle = {
  width: "min(1180px, calc(100% - 32px))",
  margin: "0 auto",
  padding: "28px 0 42px",
};

const heroStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: "22px",
  flexWrap: "wrap",
  marginBottom: "22px",
};

const eyebrowStyle = {
  color: "#0f766e",
  fontSize: "13px",
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
  marginBottom: "8px",
};

const titleStyle = {
  margin: 0,
  fontSize: "34px",
  lineHeight: 1.14,
  color: "#101828",
};

const subtitleStyle = {
  marginTop: "10px",
  color: "#667085",
  fontSize: "16px",
  maxWidth: "620px",
};

const heroStatsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(120px, 1fr))",
  gap: "10px",
  minWidth: "min(280px, 100%)",
};

const statBoxStyle = {
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "14px",
  boxShadow: "0 1px 2px rgba(16,24,40,0.05)",
};

const statLabelStyle = {
  display: "block",
  color: "#667085",
  fontSize: "13px",
  marginBottom: "6px",
};

const workspaceStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(390px, 100%), 1fr))",
  gap: "18px",
  alignItems: "start",
};

const panelBaseStyle = {
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  boxShadow: "0 10px 25px rgba(16,24,40,0.06)",
};

const bookingPanelStyle = {
  ...panelBaseStyle,
  padding: "20px",
};

const mapPanelStyle = {
  ...panelBaseStyle,
  padding: "18px",
};

const sectionHeaderStyle = {
  marginBottom: "18px",
};

const sectionKickerStyle = {
  color: "#667085",
  display: "block",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: "uppercase",
  marginBottom: "4px",
};

const sectionTitleStyle = {
  margin: 0,
  color: "#101828",
  fontSize: "22px",
  lineHeight: 1.2,
};

const labelStyle = {
  display: "block",
  color: "#344054",
  fontSize: "13px",
  fontWeight: 700,
  marginTop: "14px",
  marginBottom: "6px",
};

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: "8px",
  border: "1px solid #d0d5dd",
  fontSize: "16px",
  boxSizing: "border-box",
  background: "#ffffff",
  color: "#101828",
  outline: "none",
};

const distanceHelpStyle = {
  marginTop: "8px",
  color: "#667085",
  fontSize: "13px",
  lineHeight: 1.4,
};

const rideHeaderStyle = {
  marginTop: "18px",
  marginBottom: "10px",
  color: "#344054",
  fontSize: "13px",
  fontWeight: 800,
};

const rideGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const rideOptionButtonStyle = {
  minHeight: "52px",
  border: "1px solid #d7dde7",
  borderRadius: "8px",
  fontWeight: 800,
  fontSize: "15px",
};

const fareCardStyle = {
  marginTop: "16px",
  background: "#f0fdf9",
  border: "1px solid #99f6e4",
  color: "#134e4a",
  padding: "14px",
  borderRadius: "8px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const fareHintStyle = {
  width: "100%",
  color: "#0f766e",
  fontWeight: 800,
};

const confirmButtonStyle = {
  width: "100%",
  marginTop: "14px",
  padding: "15px",
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: "8px",
  fontWeight: 800,
  fontSize: "16px",
  cursor: "pointer",
};

const infoBoxStyle = {
  marginTop: "14px",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  padding: "12px",
  borderRadius: "8px",
  fontWeight: 800,
  textAlign: "center",
};

const successBoxStyle = {
  marginTop: "14px",
  background: "#ecfdf3",
  border: "1px solid #bbf7d0",
  color: "#166534",
  padding: "12px",
  borderRadius: "8px",
  textAlign: "center",
  fontWeight: 800,
};

const payRateButtonStyle = {
  width: "100%",
  padding: "14px",
  background: "#0f766e",
  color: "white",
  border: "none",
  borderRadius: "8px",
  fontWeight: 800,
  fontSize: "16px",
  cursor: "pointer",
  marginTop: "12px",
};

const mapHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "14px",
  alignItems: "center",
  marginBottom: "14px",
};

const routeBadgeStyle = {
  background: "#f2f4f7",
  border: "1px solid #e4e7ec",
  borderRadius: "999px",
  color: "#344054",
  fontSize: "13px",
  fontWeight: 800,
  padding: "8px 12px",
};

const mapFrameStyle = {
  height: "420px",
  overflow: "hidden",
  borderRadius: "8px",
  border: "1px solid #e4e7ec",
};

const identityPanelStyle = {
  marginTop: "18px",
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "18px",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(280px, 420px)",
  gap: "18px",
  alignItems: "start",
};

const identityTitleStyle = {
  margin: "4px 0 8px",
  color: "#101828",
  fontSize: "22px",
};

const identityTextStyle = {
  margin: 0,
  color: "#667085",
  fontWeight: 700,
};

const identityFormStyle = {
  display: "grid",
  gap: "12px",
};

const identityFieldStyle = {
  display: "grid",
  gap: "7px",
  color: "#344054",
  fontWeight: 900,
};

const fileInputStyle = {
  width: "100%",
  color: "#344054",
  fontWeight: 800,
};

const identityLinkStyle = {
  color: "#9b0089",
  fontWeight: 900,
  textDecoration: "none",
};

const identitySaveButtonStyle = {
  minHeight: "48px",
  border: "none",
  borderRadius: "999px",
  background: "#111827",
  color: "white",
  fontWeight: 950,
  cursor: "pointer",
};

const identityMessageStyle = {
  margin: 0,
  background: "#ecfdf3",
  border: "1px solid #bbf7d0",
  color: "#166534",
  borderRadius: "8px",
  padding: "10px 12px",
  fontWeight: 900,
};

const mapStyle = {
  height: "100%",
  width: "100%",
};

const rideCardStyle = {
  marginTop: "16px",
  background: "#ffffff",
  border: "1px solid #e4e7ec",
  padding: "18px",
  borderRadius: "8px",
};

const rideActionsStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "14px",
};

const shareButtonStyle = {
  minHeight: "42px",
  border: "none",
  borderRadius: "8px",
  background: "#0f766e",
  color: "white",
  fontWeight: 900,
  padding: "0 14px",
  cursor: "pointer",
};

const secondaryCallButtonStyle = {
  minHeight: "42px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "8px",
  background: "#eef2ff",
  color: "#3730a3",
  fontWeight: 900,
  padding: "0 14px",
  textDecoration: "none",
};

const driverBoxStyle = {
  marginTop: "16px",
  background: "#f8fafc",
  border: "1px solid #e4e7ec",
  padding: "14px",
  borderRadius: "8px",
  display: "flex",
  gap: "14px",
  alignItems: "center",
};

const callButtonStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  minWidth: "82px",
  textAlign: "center",
  padding: "10px 14px",
  background: "#111827",
  color: "white",
  textDecoration: "none",
  borderRadius: "8px",
  fontWeight: 800,
  boxSizing: "border-box",
};

const driverImageStyle = {
  width: "64px",
  height: "64px",
  borderRadius: "50%",
  objectFit: "cover",
};

const ratingPreviewStyle = {
  marginTop: "14px",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  color: "#9a3412",
  padding: "12px",
  borderRadius: "8px",
};

const rideCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  alignItems: "center",
  marginBottom: "14px",
};

const statusPillStyle = {
  background: "#ecfdf3",
  color: "#166534",
  borderRadius: "999px",
  padding: "7px 10px",
  fontSize: "12px",
  fontWeight: 800,
  textTransform: "capitalize",
};

const detailsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const detailStyle = {
  background: "#f9fafb",
  border: "1px solid #eef2f6",
  borderRadius: "8px",
  padding: "12px",
};

const driverTitleStyle = {
  margin: 0,
  color: "#101828",
  fontSize: "17px",
};

const mutedTextStyle = {
  margin: "4px 0 0",
  color: "#667085",
};

const emptyRideStyle = {
  marginTop: "16px",
  background: "#f9fafb",
  border: "1px dashed #cbd5e1",
  borderRadius: "8px",
  padding: "18px",
  color: "#667085",
  textAlign: "center",
};
