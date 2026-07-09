import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { API_URL } from "../apiConfig";
import riderApi from "./services/authenticatedApi";
import {
  MARKET,
  calculateDistanceKm,
  calculateFare,
  formatMoney,
  getLocationsByCity,
  getLocationByLabel,
} from "../marketConfig";
import { subscribeRideUpdates, sendRideUpdate } from "../socket";
import WaitingFeeBanner from "../components/WaitingFeeBanner";

// Fix Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const riderIcon = new L.DivIcon({
  className: "",
  html: '<div style="width:20px;height:20px;border-radius:50%;background:#00A651;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const pickupIcon = new L.DivIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#00A651;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const destIcon = new L.DivIcon({
  className: "",
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function RiderDashboardNew() {
  const { t } = useTranslation();
  const [riderName, setRiderName] = useState("");
  const [city, setCity] = useState(MARKET.defaultCity);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [rideType, setRideType] = useState("regular");
  const [fare, setFare] = useState(0);
  const [distance, setDistance] = useState(0);
  const [requesting, setRequesting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [currentRide, setCurrentRide] = useState(null);
  const [routePath, setRoutePath] = useState([]);
  const [riderPosition, setRiderPosition] = useState(MARKET.defaultPickup.position);
  const [activeTab, setActiveTab] = useState("rides");

  const token = localStorage.getItem("access");
  const cityLocations = getLocationsByCity(city);
  const pickupLocation = getLocationByLabel(pickup, city);
  const destinationLocation = getLocationByLabel(destination, city);
  const pickupPosition = pickupLocation?.position || riderPosition;
  const destinationPosition = destinationLocation?.position || null;
  const showFares = pickup && destination;

  // Load rider info
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    setRiderName(user.first_name || user.email?.split("@")[0] || "Rider");
  }, []);

  // Calculate fare when locations change
  useEffect(() => {
    if (pickupLocation && destinationLocation) {
      const dist = calculateDistanceKm(pickupLocation.position, destinationLocation.position);
      setDistance(dist);
      setFare(calculateFare(rideType, dist));
    }
  }, [pickupLocation, destinationLocation, rideType]);

  // Fetch route
  useEffect(() => {
    if (!pickupLocation || !destinationLocation) {
      setRoutePath([]);
      return;
    }
    const fetchRoute = async () => {
      try {
        const coords = `${pickupLocation.position[1]},${pickupLocation.position[0]};${destinationLocation.position[1]},${destinationLocation.position[0]}`;
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        const data = await res.json();
        const route = data.routes?.[0];
        if (route) {
          setRoutePath(route.geometry.coordinates.map(([lng, lat]) => [lat, lng]));
          setDistance(Number((route.distance / 1000).toFixed(1)));
        }
      } catch (e) {
        setRoutePath([pickupLocation.position, destinationLocation.position]);
      }
    };
    fetchRoute();
  }, [pickupLocation, destinationLocation]);

  // Fetch active ride
  const fetchCurrentRide = useCallback(async () => {
    try {
      const response = await riderApi.get(`${API_URL}/rides/history/`);
      const rides = Array.isArray(response.data) ? response.data : [];
      const active = rides.find((r) => ["requested", "accepted", "driver_arriving", "driver_arrived", "in_progress"].includes(r.status));
      const completed = !active ? rides.find((r) => r.status === "completed") : null;
      setCurrentRide(active || completed || null);
    } catch (e) {}
  }, []);

  useEffect(() => {
    fetchCurrentRide();
    const interval = setInterval(fetchCurrentRide, 3000);
    const unsub = subscribeRideUpdates((msg) => {
      if (msg) fetchCurrentRide();
    });
    return () => { clearInterval(interval); unsub(); };
  }, [fetchCurrentRide]);

  // Request ride
  const requestRide = async () => {
    if (!pickup || !destination) return;
    const pPos = pickupLocation?.position || riderPosition;
    const dPos = destinationLocation?.position || MARKET.defaultDestination.position;
    try {
      setRequesting(true);
      setRequestMessage("");
      const response = await riderApi.post(`${API_URL}/rides/request/`, {
        pickup,
        destination,
        pickup_address: pickup,
        destination_address: destination,
        pickup_lat: pPos[0],
        pickup_lng: pPos[1],
        destination_lat: dPos[0],
        destination_lng: dPos[1],
        distance_km: distance || 5,
        ride_type: rideType,
        fare: fare || calculateFare(rideType, distance || 5),
      });
      const ride = response.data?.ride || response.data;
      setCurrentRide(ride);
      setRequestMessage("Ride requested! Looking for a driver...");
      setSearchOpen(false);
      sendRideUpdate({ ride_id: ride.id, status: ride.status, type: "ride_update" });
    } catch (error) {
      setRequestMessage(error.response?.data?.detail || error.response?.data?.error || "Ride request failed");
    } finally {
      setRequesting(false);
    }
  };

  // Cancel ride
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const cancellableStatuses = ["requested", "accepted", "driver_arriving", "driver_arrived"];
  const canCancel = currentRide && cancellableStatuses.includes(currentRide.status);

  const cancelRide = async () => {
    if (!currentRide || !cancelReason.trim()) return;
    try {
      setCancelling(true);
      await riderApi.post(`${API_URL}/rides/cancel/${currentRide.id}/`, {
        reason: cancelReason.trim(),
        cancelled_by: "rider",
      });
      setCurrentRide(null);
      setCancelOpen(false);
      setCancelReason("");
      setRequestMessage("Ride cancelled.");
    } catch (error) {
      setRequestMessage(error.response?.data?.detail || "Could not cancel ride.");
    } finally {
      setCancelling(false);
    }
  };

  // Saved places
  const savedPlaces = useMemo(() => {
    const places = [];
    if (cityLocations.length > 0) places.push({ icon: "🏠", label: "Home", sublabel: cityLocations[0]?.label || "" });
    if (cityLocations.length > 1) places.push({ icon: "💼", label: "Work", sublabel: cityLocations[1]?.label || "" });
    places.push({ icon: "⭐", label: "Favorites", sublabel: "Saved places" });
    return places;
  }, [cityLocations]);

  const selectSavedPlace = (place) => {
    if (place.sublabel && place.sublabel !== "Saved places") {
      setDestination(place.sublabel);
      setSearchOpen(true);
    } else if (place.label === "Favorites") {
      window.location.href = "/saved-places";
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      {/* Map background */}
      <div style={styles.mapContainer}>
        <MapContainer center={riderPosition} zoom={14} style={{ width: "100%", height: "100%" }} zoomControl={false} attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Marker position={riderPosition} icon={riderIcon} />
          {pickupLocation && searchOpen && <Marker position={pickupLocation.position} icon={pickupIcon} />}
          {destinationLocation && searchOpen && <Marker position={destinationLocation.position} icon={destIcon} />}
          {routePath.length > 1 && <Polyline positions={routePath} pathOptions={{ color: "#0B1220", weight: 4, opacity: 0.8 }} />}
        </MapContainer>
      </div>

      {/* Top section overlay */}
      <div style={styles.topOverlay}>
        {/* Welcome header */}
        <h1 style={styles.welcome}>Welcome, {riderName}</h1>

        {/* Search bar */}
        <button type="button" onClick={() => setSearchOpen(true)} style={styles.searchBar}>
          <span style={styles.searchIcon}>🔍</span>
          <span style={styles.searchText}>Where are you going?</span>
        </button>

        {/* Saved places */}
        {!searchOpen && (
          <div style={styles.savedPlaces}>
            {savedPlaces.map((place) => (
              <button key={place.label} type="button" onClick={() => selectSavedPlace(place)} style={styles.savedPlace}>
                <span style={styles.savedIcon}>{place.icon}</span>
                <div>
                  <strong style={styles.savedLabel}>{place.label}</strong>
                  <span style={styles.savedSublabel}>{place.sublabel}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search / Booking panel */}
      {searchOpen && (
        <div style={styles.bookingPanel}>
          <div style={styles.bookingHeader}>
            <button type="button" onClick={() => setSearchOpen(false)} style={styles.closeBtn}>✕</button>
            <strong>Book a ride</strong>
          </div>

          {/* City selector */}
          <div style={styles.inputGroup}>
            <span style={styles.dot}>🏙️</span>
            <select value={city} onChange={(e) => setCity(e.target.value)} style={styles.select}>
              {MARKET.cities.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
            </select>
          </div>

          {/* Pickup */}
          <div style={styles.inputGroup}>
            <span style={styles.dot}>🟢</span>
            <select value={pickup} onChange={(e) => setPickup(e.target.value)} style={styles.select}>
              <option value="">Select pickup</option>
              {cityLocations.map((loc) => <option key={loc.label} value={loc.label}>{loc.label}</option>)}
            </select>
          </div>

          {/* Destination */}
          <div style={styles.inputGroup}>
            <span style={styles.dot}>🔴</span>
            <select value={destination} onChange={(e) => setDestination(e.target.value)} style={styles.select}>
              <option value="">Select destination</option>
              {cityLocations.map((loc) => <option key={loc.label} value={loc.label}>{loc.label}</option>)}
            </select>
          </div>

          {/* Ride types - only show when both locations selected */}
          {showFares && (
            <>
              <div style={styles.rideTypes}>
                {["regular", "xl", "comfort", "share"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setRideType(type)}
                    style={{ ...styles.rideTypeBtn, ...(rideType === type ? styles.rideTypeBtnActive : {}) }}
                  >
                    <strong>{type === "regular" ? "Economy" : type.charAt(0).toUpperCase() + type.slice(1)}</strong>
                    <span>{formatMoney(calculateFare(type, distance))}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={requestRide}
                disabled={requesting}
                style={{ ...styles.confirmBtn, opacity: requesting ? 0.6 : 1 }}
              >
                {requesting ? "Requesting..." : `Confirm ${rideType === "regular" ? "Economy" : rideType} · ${formatMoney(fare)}`}
              </button>
            </>
          )}

          {requestMessage && <p style={styles.message}>{requestMessage}</p>}
        </div>
      )}

      {/* Active ride banner */}
      {currentRide && !searchOpen && (
        <div style={styles.rideBanner}>
          {/* Status */}
          <strong style={styles.rideBannerTitle}>
            {currentRide.status === "completed" ? "Ride completed" :
             currentRide.status === "in_progress" ? "Ride in progress" :
             currentRide.status === "driver_arrived" ? "Driver arrived — Share your PIN" :
             currentRide.status === "driver_arriving" ? "Driver on the way" :
             currentRide.status === "accepted" ? "Driver accepted your ride" :
             currentRide.driver && currentRide.eta_minutes != null ? "Driver on the way" :
             "Looking for a nearby driver..."}
          </strong>

          {currentRide.status === "driver_arrived" && (
            <WaitingFeeBanner ride={currentRide} audience="rider" />
          )}

          {/* Trip route info */}
          <div style={styles.tripRoute}>
            <div style={styles.tripRouteRow}>
              <span style={styles.tripDot}>🟢</span>
              <span style={styles.tripLabel}>{currentRide.pickup || currentRide.pickup_address || "Pickup"}</span>
            </div>
            <div style={styles.tripRouteRow}>
              <span style={styles.tripDot}>🔴</span>
              <span style={styles.tripLabel}>{currentRide.destination || currentRide.destination_address || "Destination"}</span>
            </div>
            <div style={styles.tripMeta}>
              <span>{currentRide.distance_km || "—"} km</span>
              <span>·</span>
              <span>{currentRide.fare ? `${currentRide.fare} MRU` : "—"}</span>
              <span>·</span>
              <span>{currentRide.ride_type || "Economy"}</span>
            </div>
          </div>

          {/* Driver info card - shows after acceptance */}
          {["accepted", "driver_arriving", "driver_arrived", "in_progress"].includes(currentRide.status) ||
          (currentRide.driver && currentRide.eta_minutes != null) ? (
            <div style={styles.driverCard}>
              <div style={styles.driverHeader}>
                <div style={styles.driverAvatar}>
                  {currentRide.driver_picture ? (
                    <img src={currentRide.driver_picture} alt="" style={styles.driverAvatarImg} />
                  ) : (
                    <span style={styles.driverAvatarFallback}>{(currentRide.driver_name || "D").charAt(0)}</span>
                  )}
                </div>
                <div style={styles.driverInfo}>
                  <strong style={styles.driverName}>{currentRide.driver_name || "Your Driver"}</strong>
                  <span style={styles.driverRating}>
                    ★ {Number(currentRide.driver_avg_rating || 5).toFixed(1)} · {currentRide.completed_trips || 0} trips
                  </span>
                  <span style={styles.driverCategory}>{currentRide.driver_category_label || currentRide.driver_category || ""}</span>
                </div>
                <div style={styles.driverActions}>
                  <button type="button" style={styles.driverActionBtn} aria-label="Call">📞</button>
                  <button type="button" style={styles.driverActionBtn} aria-label="Chat">💬</button>
                </div>
              </div>

              {/* Vehicle details */}
              <div style={styles.vehicleDetails}>
                <strong style={styles.vehicleTitle}>{currentRide.vehicle || [currentRide.vehicle_make, currentRide.vehicle_model].filter(Boolean).join(" ") || "Vehicle"}</strong>
                <span style={styles.vehiclePlate}>{currentRide.plate_number || "—"}</span>
                <span style={styles.vehicleType}>{currentRide.ride_type || "Economy"}</span>
              </div>

              {/* PIN */}
              {currentRide.pickup_pin && (
                <div style={styles.pinRow}>
                  <span style={styles.pinLabel}>🔑 Ride PIN</span>
                  <strong style={styles.pinValue}>{currentRide.pickup_pin}</strong>
                </div>
              )}
            </div>
          ) : null}

          {/* Safety actions */}
          <div style={styles.safetyActions}>
            <button type="button" style={styles.sosBtn} aria-label="SOS">🆘 SOS</button>
            <button type="button" style={styles.shareBtn} aria-label="Share trip">📤 Share Trip</button>
          </div>

          {/* Actions */}
          {currentRide.status === "completed" && (
            <button type="button" onClick={() => { localStorage.setItem("selectedRideId", currentRide.id); window.location.href = "/rider-payments"; }} style={styles.rateBtn}>
              Pay & Rate
            </button>
          )}
          {canCancel && !cancelOpen && (
            <button type="button" onClick={() => setCancelOpen(true)} style={styles.cancelBtn}>
              Cancel Ride
            </button>
          )}
        </div>
      )}

      {/* Cancel modal */}
      {cancelOpen && (
        <div style={styles.cancelModal}>
          <h3 style={styles.cancelTitle}>Cancel this ride?</h3>
          <p style={styles.cancelSub}>Please select a reason:</p>
          {["Rider not available", "Driver too far", "Wrong pickup location", "Emergency", "Waited too long", "Changed my mind", "Other"].map((reason) => (
            <button key={reason} type="button" onClick={() => setCancelReason(reason)}
              style={{ ...styles.cancelReasonBtn, ...(cancelReason === reason ? styles.cancelReasonActive : {}) }}>
              {reason}
            </button>
          ))}
          <div style={styles.cancelActions}>
            <button type="button" onClick={() => setCancelOpen(false)} style={styles.cancelKeepBtn}>Keep Ride</button>
            <button type="button" onClick={cancelRide} disabled={!cancelReason || cancelling} style={{ ...styles.cancelConfirmBtn, opacity: !cancelReason || cancelling ? 0.5 : 1 }}>
              {cancelling ? "Cancelling..." : "Confirm Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Bottom navigation */}
      <nav style={styles.bottomNav}>
        {[
          { key: "rides", icon: "🚗", label: "Rides" },
          { key: "delivery", icon: "📦", label: "Delivery" },
          { key: "scheduled", icon: "📅", label: "Scheduled" },
          { key: "profile", icon: "👤", label: "Profile" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              if (tab.key === "delivery") window.location.href = "/delivery";
              else if (tab.key === "profile") window.location.href = "/settings";
              else setActiveTab(tab.key);
            }}
            style={{ ...styles.navBtn, color: activeTab === tab.key ? "#00A651" : "rgba(255,255,255,0.5)" }}
          >
            <span style={styles.navIcon}>{tab.icon}</span>
            <span style={styles.navLabel}>{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

const styles = {
  container: { position: "relative", width: "100%", height: "100vh", height: "100dvh", overflow: "hidden", background: "#0B1220", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  mapContainer: { position: "absolute", inset: 0, zIndex: 0 },
  topOverlay: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "48px 16px 16px", background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 80%, transparent 100%)" },
  welcome: { margin: "0 0 12px", fontSize: 24, fontWeight: 800, color: "#0B1220" },
  searchBar: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer", WebkitTapHighlightColor: "transparent" },
  searchIcon: { fontSize: 16 },
  searchText: { fontSize: 15, color: "#64748b", fontWeight: 500 },
  savedPlaces: { marginTop: 14, display: "flex", flexDirection: "column", gap: 0 },
  savedPlace: { display: "flex", alignItems: "center", gap: 12, padding: "12px 0", border: "none", borderBottom: "1px solid #f1f5f9", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", WebkitTapHighlightColor: "transparent" },
  savedIcon: { fontSize: 20, width: 32, textAlign: "center" },
  savedLabel: { display: "block", fontSize: 14, fontWeight: 700, color: "#0B1220" },
  savedSublabel: { display: "block", fontSize: 12, color: "#64748b", marginTop: 1 },
  bookingPanel: { position: "absolute", bottom: 60, left: 0, right: 0, zIndex: 20, padding: 20, borderRadius: "20px 20px 0 0", background: "#fff", boxShadow: "0 -4px 30px rgba(0,0,0,0.15)", maxHeight: "70vh", overflowY: "auto" },
  bookingHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  closeBtn: { width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f1f5f9", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  inputGroup: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  dot: { fontSize: 12 },
  select: { flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, fontWeight: 500, background: "#f8fafc", color: "#0B1220" },
  rideTypes: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, marginBottom: 14 },
  rideTypeBtn: { padding: "12px 10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", textAlign: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" },
  rideTypeBtnActive: { border: "2px solid #00A651", background: "rgba(0,166,81,0.06)" },
  confirmBtn: { width: "100%", padding: 16, borderRadius: 12, border: "none", background: "#00A651", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", WebkitTapHighlightColor: "transparent" },
  message: { marginTop: 10, padding: 10, borderRadius: 8, background: "#f1f5f9", fontSize: 13, color: "#334155", textAlign: "center" },
  rideBanner: { position: "absolute", bottom: 70, left: 12, right: 12, zIndex: 15, padding: 16, borderRadius: 16, background: "rgba(11,18,32,0.94)", backdropFilter: "blur(12px)", color: "#fff", maxHeight: "70vh", overflowY: "auto" },
  rideBannerTitle: { display: "block", fontSize: 16, fontWeight: 800, marginBottom: 10 },
  rideBannerSub: { display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 },
  tripRoute: { marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.05)" },
  tripRouteRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  tripDot: { fontSize: 10 },
  tripLabel: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: 500 },
  tripMeta: { display: "flex", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 },
  driverCard: { marginBottom: 12, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" },
  driverHeader: { display: "flex", alignItems: "center", gap: 10 },
  driverAvatar: { width: 44, height: 44, borderRadius: "50%", background: "rgba(0,166,81,0.15)", border: "2px solid #00A651", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  driverAvatarImg: { width: "100%", height: "100%", objectFit: "cover" },
  driverAvatarFallback: { fontSize: 18, fontWeight: 800, color: "#00A651" },
  driverInfo: { flex: 1, minWidth: 0 },
  driverName: { display: "block", fontSize: 15, fontWeight: 700, color: "#fff" },
  driverRating: { display: "block", fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 },
  driverCategory: { display: "block", fontSize: 11, color: "#FFD700", marginTop: 2 },
  driverActions: { display: "flex", gap: 6 },
  driverActionBtn: { width: 36, height: 36, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, cursor: "pointer" },
  vehicleDetails: { marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  vehicleTitle: { fontSize: 13, color: "#fff", fontWeight: 600 },
  vehiclePlate: { fontSize: 13, padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 700 },
  vehicleType: { fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "rgba(0,166,81,0.15)", color: "#00A651", fontWeight: 700, textTransform: "capitalize" },
  pinRow: { marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)" },
  pinLabel: { fontSize: 13, color: "rgba(255,255,255,0.6)" },
  pinValue: { fontSize: 22, fontWeight: 900, color: "#FFD700", letterSpacing: 3 },
  safetyActions: { display: "flex", gap: 8, marginBottom: 10 },
  sosBtn: { flex: 1, padding: "10px", borderRadius: 8, border: "1px solid #EF4444", background: "rgba(239,68,68,0.1)", color: "#EF4444", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center" },
  shareBtn: { flex: 1, padding: "10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center" },
  rateBtn: { marginTop: 10, padding: "10px 20px", borderRadius: 10, border: "none", background: "#00A651", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  cancelBtn: { marginTop: 8, padding: "10px 20px", borderRadius: 10, border: "1px solid #EF4444", background: "transparent", color: "#EF4444", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  cancelModal: { position: "absolute", bottom: 70, left: 12, right: 12, zIndex: 25, padding: 20, borderRadius: 16, background: "#fff", boxShadow: "0 -4px 30px rgba(0,0,0,0.2)", color: "#0B1220", maxHeight: "60vh", overflowY: "auto" },
  cancelTitle: { margin: "0 0 4px", fontSize: 18, fontWeight: 800 },
  cancelSub: { margin: "0 0 12px", fontSize: 13, color: "#64748b" },
  cancelReasonBtn: { display: "block", width: "100%", padding: "10px 14px", marginBottom: 6, borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", textAlign: "left", fontSize: 14, cursor: "pointer" },
  cancelReasonActive: { border: "2px solid #EF4444", background: "#fef2f2" },
  cancelActions: { display: "flex", gap: 10, marginTop: 14 },
  cancelKeepBtn: { flex: 1, padding: 12, borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  cancelConfirmBtn: { flex: 1, padding: 12, borderRadius: 10, border: "none", background: "#EF4444", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, display: "flex", justifyContent: "space-around", padding: "10px 0", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))", background: "#0B1220", borderTop: "1px solid rgba(255,255,255,0.08)" },
  navBtn: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", cursor: "pointer", padding: "6px 12px", WebkitTapHighlightColor: "transparent" },
  navIcon: { fontSize: 20 },
  navLabel: { fontSize: 10, fontWeight: 700 },
};
