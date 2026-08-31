import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MARKET } from "../marketConfig";
import { navigateInApp } from "../navigation/inAppNavigation";
import { getActiveRide } from "../rider/services/apiService";
import TrustedContactsSection from "./TrustedContactsSection";
import SosCountdownModal from "./SosCountdownModal";
import {
  RIDER_INCIDENT_CATEGORIES,
  RIDER_SAFETY_TIP_KEYS,
  formatIncidentStatus,
  formatIncidentType,
  getVerificationFields,
} from "./riderSafetyCategories";
import {
  fetchSafetyIncidents,
  getSafetyPosition,
  reportSafetyIncident,
  triggerSos,
} from "./safetyApi";
import { shareActiveTrip } from "./shareTripService";
import "./RiderSafetyCenter.css";

const SOS_DEDUP_KEY = "yala_rider_sos_sent";

function hasRecentSos(rideId) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SOS_DEDUP_KEY) || "{}");
    const entry = parsed[String(rideId)];
    if (!entry) return false;
    return Date.now() - entry < 5 * 60 * 1000;
  } catch {
    return false;
  }
}

function markSosSent(rideId) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SOS_DEDUP_KEY) || "{}");
    parsed[String(rideId)] = Date.now();
    sessionStorage.setItem(SOS_DEDUP_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export default function RiderSafetyCenter({ activeRide: activeRideProp, onBack }) {
  const { t } = useTranslation();
  const token = localStorage.getItem("access");
  const [activeRide, setActiveRide] = useState(activeRideProp || null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showSosConfirm, setShowSosConfirm] = useState(false);
  const [reportCategory, setReportCategory] = useState("report_driver");
  const [reportDescription, setReportDescription] = useState("");
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);

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
      const ride = await getActiveRide();
      if (ride) setActiveRide(ride);
    } catch {
      // Safety center works off-trip too.
    }
  }, [activeRideProp, token]);

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
    Promise.resolve(getSafetyPosition()).then((position) => {
      if (position?.accuracy != null) setGpsAccuracy(position.accuracy);
    });
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

  const verification = useMemo(() => getVerificationFields(activeRide || {}), [activeRide]);

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
        detail: "SOS, trip sharing, and ride verification are ready for this trip.",
      };
    }
    return {
      label: "Ready",
      tone: "good",
      detail: "Configure trusted contacts before your next ride.",
    };
  }, [activeRide, incidents, offline]);

  const sendSos = async () => {
    setShowSosConfirm(false);
    const rideId = activeRide?.id || activeRide?.ride_id;
    if (!rideId) {
      setError("SOS is available during an active ride.");
      return;
    }
    if (hasRecentSos(rideId)) {
      setMessage("SOS was already sent recently for this ride. Call emergency services if you still need help.");
      return;
    }

    setWorking("sos");
    setMessage("");
    setError("");
    try {
      const position = await getSafetyPosition({ timeout: 10000 });
      if (position?.accuracy != null) setGpsAccuracy(position.accuracy);
      const data = await triggerSos({
        ride_id: rideId,
        description: reportDescription,
        ...position,
      });
      markSosSent(rideId);
      const reference = data?.incident?.reference || data?.reference || "sent";
      setMessage(`SOS ${reference} sent. Yala operations have been alerted with your location.`);
      await refreshIncidents();
    } catch (err) {
      setError(err.message || "SOS could not be sent. Call emergency services directly.");
    } finally {
      setWorking("");
    }
  };

  const handleShareTrip = async () => {
    if (!activeRide?.id) {
      setError("Trip sharing is available during an active ride.");
      return;
    }
    setWorking("share");
    setError("");
    try {
      const result = await shareActiveTrip(activeRide, { notifyPrimary: true });
      if (result.method !== "cancelled") {
        setMessage("Live trip link created and ready to share.");
      }
    } catch (err) {
      setError(err.message || "Could not share trip.");
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
      const category =
        RIDER_INCIDENT_CATEGORIES.find((item) => item.id === reportCategory) ||
        RIDER_INCIDENT_CATEGORIES[0];
      const position = await getSafetyPosition();
      const data = await reportSafetyIncident({
        ride_id: activeRide?.id || activeRide?.ride_id || undefined,
        incident_type: category.backendType,
        severity: category.backendType === "medical_emergency" ? "critical" : "high",
        description: `[${category.label}] ${reportDescription}`.trim(),
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
    else navigateInApp("/rider-dashboard");
  };

  if (!token) {
    window.location.href = "/login?next=/rider/safety";
    return null;
  }

  return (
    <main className="rider-safety-center">
      <header className="rider-safety-center__topbar">
        <button type="button" className="rider-safety-center__back" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <div>
          <span className="rider-safety-center__eyebrow">Yala Rider</span>
          <h1>{t("safetyPanel.riderTitle")}</h1>
        </div>
        <button type="button" className="rider-safety-center__refresh" onClick={refreshAll} disabled={loading}>
          ↻
        </button>
      </header>

      <div className="rider-safety-center__content">
        {offline ? (
          <div className="rider-safety-center__banner rider-safety-center__banner--warn">
            You are offline. SOS and reports will retry when connection returns.
          </div>
        ) : null}
        {error ? <div className="rider-safety-center__banner rider-safety-center__banner--error">{error}</div> : null}
        {message ? <div className="rider-safety-center__banner rider-safety-center__banner--success">{message}</div> : null}

        <section className={`rider-safety-center__status rider-safety-center__status--${safetyStatus.tone}`}>
          <span>🛡 Ride verification status</span>
          <strong>{safetyStatus.label}</strong>
          <p>{safetyStatus.detail}</p>
          {activeRide ? (
            <div className="rider-safety-center__verification">
              <strong>{verification.driverName}</strong>
              <span>{verification.vehicle} · {verification.color} · {verification.plate}</span>
            </div>
          ) : null}
        </section>

        <section className="rider-safety-center__actions-grid">
          <button type="button" className="rider-safety-center__action rider-safety-center__action--sos" onClick={() => setShowSosConfirm(true)} disabled={Boolean(working)}>
            🚨 Emergency SOS
          </button>
          <button type="button" className="rider-safety-center__action" onClick={handleShareTrip} disabled={Boolean(working) || !activeRide}>
            📍 {t("safetyPanel.shareTrip")}
          </button>
          <button type="button" className="rider-safety-center__action" onClick={() => navigateInApp("/support?topic=emergency")}>
            📋 Report safety issue
          </button>
        </section>

        <section className="rider-safety-center__card">
          <h3>{t("safetyPanel.emergencyContacts")}</h3>
          <div className="rider-safety-center__links">
            {MARKET.emergencyNumbers.map((item) => (
              <a key={item.number} href={`tel:${item.number}`} className="rider-safety-center__link">
                <strong>{item.label}</strong>
                <span>{item.number}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="rider-safety-center__card">
          <h3>{t("safetyPanel.trustedContacts")}</h3>
          <TrustedContactsSection compact showQuickCall />
        </section>

        <section className="rider-safety-center__card">
          <h3>{t("safetyPanel.safetyTips")}</h3>
          <ul className="rider-safety-center__tips">
            {RIDER_SAFETY_TIP_KEYS.map((key) => (
              <li key={key}>{t(`safetyPanel.tips.${key}`)}</li>
            ))}
          </ul>
        </section>

        <section className="rider-safety-center__card">
          <h3>Report safety incident</h3>
          <form className="rider-safety-center__report" onSubmit={submitIncidentReport}>
            <div className="rider-safety-center__categories">
              {RIDER_INCIDENT_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`rider-safety-center__category ${reportCategory === category.id ? "active" : ""}`}
                  onClick={() => setReportCategory(category.id)}
                >
                  {category.icon} {category.label}
                </button>
              ))}
            </div>
            <textarea
              value={reportDescription}
              onChange={(event) => setReportDescription(event.target.value)}
              placeholder="Describe what happened…"
              rows={4}
              required
            />
            <button type="submit" disabled={working === "report"}>
              {working === "report" ? "Submitting…" : "Submit report"}
            </button>
          </form>
        </section>

        <section className="rider-safety-center__card">
          <h3>Your safety reports</h3>
          {incidents.length === 0 ? (
            <p className="rider-safety-center__empty">No safety reports yet.</p>
          ) : (
            <div className="rider-safety-center__incidents">
              {incidents.slice(0, 8).map((item) => (
                <article key={item.id || item.reference} className="rider-safety-center__incident">
                  <strong>{item.reference}</strong>
                  <span>{formatIncidentType(item.incident_type)} · {formatIncidentStatus(item.status)}</span>
                  <p>{item.description}</p>
                  <em>{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</em>
                </article>
              ))}
            </div>
          )}
        </section>

        {gpsAccuracy != null ? (
          <p className="rider-safety-center__gps">GPS accuracy: ~{Math.round(gpsAccuracy)}m</p>
        ) : null}
      </div>

      <SosCountdownModal
        open={showSosConfirm}
        onCancel={() => setShowSosConfirm(false)}
        onConfirm={sendSos}
        busy={working === "sos"}
      />
    </main>
  );
}
