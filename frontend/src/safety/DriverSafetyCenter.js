import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";
import { navigateInApp } from "../navigation/inAppNavigation";
import DriverTripSafetyBar from "./DriverTripSafetyBar";
import TrustedContactsSection from "./TrustedContactsSection";
import {
  DRIVER_INCIDENT_CATEGORIES,
  DRIVER_SAFETY_TIPS,
  formatIncidentStatus,
  formatIncidentType,
} from "./driverSafetyCategories";
import {
  fetchSafetyIncidents,
  getSafetyPosition,
  reportSafetyIncident,
  triggerSos,
} from "./safetyApi";
import "./DriverSafetyCenter.css";

const ACTIVE_RIDE_STATUSES = new Set([
  "requested",
  "scheduled",
  "accepted",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
]);

function getActiveRideFromList(rides = []) {
  if (!Array.isArray(rides)) return null;
  return (
    rides.find((ride) => ACTIVE_RIDE_STATUSES.has(String(ride.status || "").toLowerCase())) ||
    null
  );
}

export default function DriverSafetyCenter({ activeRide: activeRideProp, onBack }) {
  const token = localStorage.getItem("access");
  const [activeRide, setActiveRide] = useState(activeRideProp || null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showSosConfirm, setShowSosConfirm] = useState(false);
  const [reportCategory, setReportCategory] = useState("accident");
  const [reportDescription, setReportDescription] = useState("");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const refreshIncidents = useCallback(async () => {
    if (!token) return;
    try {
      const data = await fetchSafetyIncidents();
      setIncidents(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load incident history.");
    }
  }, [token]);

  const loadActiveRide = useCallback(async () => {
    if (activeRideProp || !token) return;
    try {
      const response = await axios.get(`${API_URL}/rides/driver-rides/`, authHeaders);
      const rides = response.data?.results || response.data?.rides || response.data || [];
      setActiveRide(getActiveRideFromList(rides));
    } catch {
      // Non-blocking — safety center still works off-trip.
    }
  }, [activeRideProp, authHeaders, token]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.allSettled([refreshIncidents(), loadActiveRide()]);
    setLoading(false);
  }, [loadActiveRide, refreshIncidents]);

  useEffect(() => {
    if (activeRideProp) setActiveRide(activeRideProp);
  }, [activeRideProp]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    let mounted = true;
    Promise.resolve(getSafetyPosition?.())
      .then((position) => {
        if (mounted && position?.accuracy != null) {
          setGpsAccuracy(position.accuracy);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const safetyStatus = useMemo(() => {
    if (offline) {
      return { label: "Offline mode", tone: "warning", detail: "Emergency actions will retry when you reconnect." };
    }
    const openCount = incidents.filter((item) =>
      ["open", "acknowledged", "investigating"].includes(String(item.status || "").toLowerCase())
    ).length;
    if (openCount > 0) {
      return {
        label: "Active safety cases",
        tone: "alert",
        detail: `${openCount} open incident${openCount === 1 ? "" : "s"} on your account.`,
      };
    }
    if (activeRide) {
      return {
        label: "Trip protected",
        tone: "good",
        detail: "SOS and live location sharing are ready for this trip.",
      };
    }
    return {
      label: "Ready",
      tone: "good",
      detail: "Emergency contacts and SOS are configured for your next trip.",
    };
  }, [activeRide, incidents, offline]);

  const sendSos = async () => {
    setShowSosConfirm(false);
    setWorking("sos");
    setMessage("");
    setError("");
    try {
      const position = await getSafetyPosition({ timeout: 10000 });
      if (position?.accuracy != null) setGpsAccuracy(position.accuracy);
      const payload = {
        ride_id: activeRide?.id || activeRide?.ride_id || undefined,
        description: reportDescription,
        ...position,
      };
      const data = await triggerSos(payload);
      const reference = data?.incident?.reference || data?.reference || "sent";
      setMessage(`SOS ${reference} sent. Operations and Yala safety staff have been alerted.`);
      await refreshIncidents();
    } catch (err) {
      setError(err.message || "SOS could not be sent. Call emergency services directly.");
    } finally {
      setWorking("");
    }
  };

  const submitIncidentReport = async (event) => {
    event.preventDefault();
    setWorking("report");
    setMessage("");
    setError("");
    try {
      const position = await getSafetyPosition();
      const data = await reportSafetyIncident({
        ride_id: activeRide?.id || activeRide?.ride_id || undefined,
        incident_type: reportCategory,
        severity: reportCategory === "medical_emergency" ? "critical" : "high",
        description: reportDescription,
        ...position,
      });
      setReportDescription("");
      setMessage(`Report ${data.reference} submitted. Our safety team will follow up.`);
      await refreshIncidents();
    } catch (err) {
      setError(err.message || "Could not submit incident report.");
    } finally {
      setWorking("");
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigateInApp("/driver");
  };

  if (!token) {
    window.location.href = "/login?next=/driver/safety";
    return null;
  }

  return (
    <main className="driver-safety-center">
      <header className="driver-safety-center__topbar">
        <button type="button" className="driver-safety-center__back" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <div>
          <span className="driver-safety-center__eyebrow">Yala Driver</span>
          <h1>Safety Center</h1>
        </div>
        <button type="button" className="driver-safety-center__refresh" onClick={refreshAll} disabled={loading}>
          ↻
        </button>
      </header>

      <div className="driver-safety-center__content">
        {offline ? <div className="driver-safety-center__banner driver-safety-center__banner--warn">You are offline. SOS and reports will retry when connection returns.</div> : null}
        {error ? <div className="driver-safety-center__banner driver-safety-center__banner--error">{error}</div> : null}
        {message ? <div className="driver-safety-center__banner driver-safety-center__banner--success">{message}</div> : null}

        <section className={`driver-safety-center__status driver-safety-center__status--${safetyStatus.tone}`}>
          <span>🛡 Driver Safety Status</span>
          <strong>{safetyStatus.label}</strong>
          <p>{safetyStatus.detail}</p>
        </section>

        {activeRide ? (
          <DriverTripSafetyBar
            ride={activeRide}
            gpsAccuracy={gpsAccuracy}
            onEmergency={() => setShowSosConfirm(true)}
          />
        ) : null}

        <section className="driver-safety-center__sos-card">
          <div>
            <h2>Emergency SOS</h2>
            <p>Alerts operations, shares your GPS, and records the event immediately.</p>
          </div>
          <button
            type="button"
            className="driver-safety-center__sos-btn"
            onClick={() => setShowSosConfirm(true)}
            disabled={Boolean(working)}
          >
            {working === "sos" ? "Sending SOS..." : "SOS Emergency"}
          </button>
        </section>

        <section className="driver-safety-center__grid">
          <article className="driver-safety-center__card">
            <h3>Emergency services</h3>
            <div className="driver-safety-center__links">
              {MARKET.emergencyNumbers.map((item) => (
                <a key={item.number} href={`tel:${item.number}`} className="driver-safety-center__link">
                  <strong>{item.label}</strong>
                  <span>{item.number}</span>
                </a>
              ))}
            </div>
          </article>

          <article className="driver-safety-center__card">
            <h3>Company support</h3>
            <div className="driver-safety-center__links">
              <button type="button" className="driver-safety-center__link" onClick={() => navigateInApp("/driver/support?tab=contact")}>
                <strong>Contact support</strong>
                <span>24/7 driver help</span>
              </button>
              <button type="button" className="driver-safety-center__link" onClick={() => navigateInApp("/driver/support?tab=faq")}>
                <strong>Safety FAQ</strong>
                <span>Common safety questions</span>
              </button>
              <a href={`tel:${MARKET.emergencyNumbers[3]?.number || MARKET.privateCallNumber}`} className="driver-safety-center__link">
                <strong>Roadside assistance</strong>
                <span>{MARKET.emergencyNumbers[3]?.number || MARKET.privateCallNumber}</span>
              </a>
            </div>
          </article>
        </section>

        <section className="driver-safety-center__card">
          <h3>Emergency contacts</h3>
          <TrustedContactsSection compact showQuickCall />
        </section>

        <section className="driver-safety-center__card">
          <h3>Report an incident</h3>
          <form className="driver-safety-center__report" onSubmit={submitIncidentReport}>
            <div className="driver-safety-center__categories">
              {DRIVER_INCIDENT_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`driver-safety-center__category${reportCategory === category.id ? " is-active" : ""}`}
                  onClick={() => setReportCategory(category.id)}
                >
                  <span>{category.icon}</span>
                  <strong>{category.label}</strong>
                </button>
              ))}
            </div>
            <textarea
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              placeholder="Describe what happened. Include rider details if relevant."
              required
            />
            <button type="submit" disabled={working === "report"}>
              {working === "report" ? "Submitting..." : "Submit incident report"}
            </button>
          </form>
        </section>

        <section className="driver-safety-center__card">
          <div className="driver-safety-center__card-header">
            <h3>Incident history</h3>
            <button type="button" onClick={refreshIncidents}>Refresh</button>
          </div>
          {loading ? <p className="driver-safety-center__empty">Loading incidents...</p> : null}
          {!loading && incidents.length === 0 ? (
            <p className="driver-safety-center__empty">No safety incidents reported yet.</p>
          ) : null}
          <div className="driver-safety-center__incidents">
            {incidents.slice(0, 12).map((incident) => (
              <div key={incident.id} className="driver-safety-center__incident">
                <div>
                  <strong>{incident.reference}</strong>
                  <span>{formatIncidentType(incident.incident_type)}</span>
                </div>
                <span className={`driver-safety-center__status-pill driver-safety-center__status-pill--${incident.status}`}>
                  {formatIncidentStatus(incident.status)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="driver-safety-center__card">
          <h3>Safety tips</h3>
          <div className="driver-safety-center__tips">
            {DRIVER_SAFETY_TIPS.map((tip) => (
              <article key={tip.id}>
                <strong>{tip.title}</strong>
                <p>{tip.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="driver-safety-center__card">
          <h3>Safety guidelines</h3>
          <ul className="driver-safety-center__guidelines">
            <li>Keep your vehicle documents valid and up to date.</li>
            <li>Use SOS only for genuine emergencies.</li>
            <li>Report unsafe rider behavior immediately after stopping safely.</li>
            <li>Share your live trip with a trusted contact on long or late-night rides.</li>
          </ul>
        </section>
      </div>

      {showSosConfirm ? (
        <div className="driver-safety-center__modal" role="dialog" aria-modal="true">
          <div className="driver-safety-center__modal-card">
            <h3>Send emergency SOS?</h3>
            <p>
              Yala operations will be notified with your GPS
              {activeRide ? `, trip #${activeRide.id || activeRide.ride_id}, and passenger details` : ""}.
            </p>
            <div className="driver-safety-center__modal-actions">
              <button type="button" onClick={() => setShowSosConfirm(false)}>Cancel</button>
              <button type="button" className="driver-safety-center__sos-btn" onClick={sendSos}>
                Send SOS now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
