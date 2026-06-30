import React, { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import {
  getExpiredOrMissingDocuments,
  getRequiredCourierDocumentTypes,
} from "./deliveryDocumentReview";
import DeliveryCourierOffer from "./DeliveryCourierOffer";
import DeliveryCourierTrip from "./DeliveryCourierTrip";
import DeliveryChatSheet from "./DeliveryChatSheet";
import {
  apiRequest,
  confirmDeliveryWithProof,
  confirmStopWithProof,
  DeliveryJobCard,
  reportDeliveryException,
} from "./DeliveryShared";
import { DeliveryCourierShell } from "./DeliveryUberLayout";
import DeliveryCourierTypePicker from "./components/DeliveryCourierTypePicker";
import { getDeliveryVehicleLabel } from "./deliveryVehicleTypes";
import { getTripHeadline } from "./deliveryTrip";
import useDeliveryCourierRealtime from "./useDeliveryCourierRealtime";
import useCourierLocationReporter from "./useCourierLocationReporter";
import { stopDeliveryOfferAlert, startDeliveryOfferAlertLoop, unlockRideRequestSound } from "../native/sound";
import { DEFAULT_DELIVERY_CITY } from "./deliveryCities";
import { getCourierLevelInfo } from "./deliveryCourierLevel";
import "./delivery-uber.css";
import "./delivery-premium-ui.css";
import "./delivery-customer-dashboard.css";
import "./delivery-courier-dashboard.css";

const POLL_MS = 20000;

/**
 * Yala Delivery courier dashboard — map-first, orange branding, delivery-only UI.
 * Not shared with Yala Driver (taxi).
 */
export default function DeliveryCourierDashboard() {
  const [available, setAvailable] = useState([]);
  const [mine, setMine] = useState([]);
  const [courierProfile, setCourierProfile] = useState(null);
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("motorcycle");
  const [deliveryCities, setDeliveryCities] = useState([DEFAULT_DELIVERY_CITY]);
  const [citiesSaving, setCitiesSaving] = useState(false);
  const [modeLoading, setModeLoading] = useState(true);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("requests");
  const [actionBusy, setActionBusy] = useState(false);
  const [dismissedOfferId, setDismissedOfferId] = useState(null);
  const [highlightedOfferId, setHighlightedOfferId] = useState(null);
  const [todayEarnings, setTodayEarnings] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [expiredDocAlerts, setExpiredDocAlerts] = useState([]);
  const noticeTimerRef = useRef(null);
  const seenOfferIdsRef = useRef(new Set());

  const showNotice = (message) => {
    setNotice(message);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 3200);
  };

  const loadSettings = useCallback(async () => {
    try {
      setModeLoading(true);
      const settings = await apiRequest(`${API_URL}/deliveries/driver/mode/`);
      setDeliveryMode(settings.delivery_mode_enabled);
      setDeliveryVehicleType(settings.delivery_vehicle_type || "motorcycle");
      setDeliveryCities(
        Array.isArray(settings.delivery_cities) && settings.delivery_cities.length
          ? settings.delivery_cities
          : [DEFAULT_DELIVERY_CITY]
      );
    } catch (_) {
      // Settings might not exist yet
    } finally {
      setModeLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [availableData, mineData] = await Promise.all([
        apiRequest(`${API_URL}/deliveries/available/`),
        apiRequest(`${API_URL}/deliveries/mine/`),
      ]);
      setAvailable(availableData);
      setMine(mineData);
      setError("");
    } catch (err) {
      // Only show error if we have no data at all
      if (available.length === 0 && mine.length === 0) {
        setError(err.message);
        // Auto-dismiss after 5s
        setTimeout(() => setError(""), 5000);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    load();
    apiRequest(`${API_URL}/deliveries/courier/account/`)
      .then((data) => setCourierProfile(data))
      .catch(() => setCourierProfile(null));
    apiRequest(`${API_URL}/deliveries/courier/earnings/`)
      .then((data) => {
        const today = data?.today || {};
        setTodayEarnings({
          amount: Number(today.earnings || 0).toFixed(0),
          count: today.count || 0,
        });
      })
      .catch(() => setTodayEarnings(null));
    apiRequest(`${API_URL}/drivers/me/documents/?context=delivery`)
      .then((data) => {
        const docs = data?.documents || [];
        const vehicleType = data?.delivery_vehicle_type || "motorcycle";
        const docTypes = getRequiredCourierDocumentTypes(vehicleType);
        const alerts = getExpiredOrMissingDocuments(docs, docTypes).filter(
          (a) => a.reason === "expired"
        );
        setExpiredDocAlerts(alerts);
      })
      .catch(() => setExpiredDocAlerts([]));
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [loadSettings, load]);

  const active = mine.filter((d) => !["delivered", "cancelled", "delivery_exception"].includes(d.status));
  const activeDelivery = active[0] || null;
  const lifetime = courierProfile?.lifetime || {};
  const profileName = courierProfile?.full_name || "Yala Courier";
  const firstName = profileName.split(" ").filter(Boolean)[0] || "Courier";
  const initials = profileName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const levelInfo = getCourierLevelInfo(courierProfile || {});
  const courierLevel = levelInfo.label;
  const totalDeliveries = lifetime.total_deliveries || todayEarnings?.count || 0;
  const rating = lifetime.rating || "4.8";
  const acceptanceRate = lifetime.acceptance_rate || 92;

  const handleMaskedCall = useCallback(async () => {
    if (!activeDelivery?.id) return;
    try {
      const session = await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/call-session/`, {
        method: "POST",
      });
      if (session?.dial_number) {
        window.location.href = `tel:${session.dial_number}`;
      }
    } catch (err) {
      setError(err.message || "Could not start call.");
    }
  }, [activeDelivery?.id]);

  const incomingOffer =
    deliveryMode && !activeDelivery && highlightedOfferId
      ? available.find((item) => item.id === highlightedOfferId) || null
      : null;
  const showIncomingOffer =
    incomingOffer && incomingOffer.id !== dismissedOfferId && incomingOffer.status === "requested";

  useDeliveryCourierRealtime({
    enabled: deliveryMode,
    hasActiveDelivery: Boolean(activeDelivery),
    load,
    setAvailable,
    setDismissedOfferId,
    setHighlightedOfferId,
  });

  useCourierLocationReporter({ enabled: Boolean(activeDelivery) });

  useEffect(() => {
    if (!deliveryMode || activeDelivery) return undefined;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [deliveryMode, activeDelivery, load]);

  useEffect(() => {
    if (active.length > 0) {
      setTab("active");
    }
  }, [active.length]);

  const saveDeliveryCities = async (cities) => {
    try {
      setCitiesSaving(true);
      setError("");
      const settings = await apiRequest(`${API_URL}/deliveries/driver/mode/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_cities: cities }),
      });
      setDeliveryCities(
        Array.isArray(settings.delivery_cities) && settings.delivery_cities.length
          ? settings.delivery_cities
          : cities
      );
      showNotice("Work cities updated");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCitiesSaving(false);
    }
  };

  const saveVehicleType = async (vehicleType) => {
    try {
      setVehicleSaving(true);
      setError("");
      const settings = await apiRequest(`${API_URL}/deliveries/driver/mode/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_vehicle_type: vehicleType }),
      });
      setDeliveryVehicleType(settings.delivery_vehicle_type || vehicleType);
      showNotice(`Working as ${getDeliveryVehicleLabel(settings.delivery_vehicle_type || vehicleType)}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setVehicleSaving(false);
    }
  };

  const toggleMode = async () => {
    if (!deliveryMode && expiredDocAlerts.length > 0) {
      setError("Document expired. Please update your documents before going online.");
      return;
    }
    try {
      setError("");
      const newValue = !deliveryMode;
      if (newValue) {
        await unlockRideRequestSound();
      } else {
        stopDeliveryOfferAlert();
      }
      await apiRequest(`${API_URL}/deliveries/driver/mode/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_mode_enabled: newValue }),
      });
      setDeliveryMode(newValue);
      setDismissedOfferId(null);
      setHighlightedOfferId(null);
      showNotice(newValue ? "You're online for deliveries" : "You're offline");
    } catch (err) {
      setError(err.message);
    }
  };

  const act = async (delivery, action, body) => {
    try {
      setActionBusy(true);
      setError("");
      stopDeliveryOfferAlert();
      await apiRequest(`${API_URL}/deliveries/${delivery.id}/${action}/`, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      showNotice(`Delivery #${delivery.id} updated`);
      setDismissedOfferId(null);
      setTab("active");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeclineOffer = async (delivery) => {
    stopDeliveryOfferAlert();
    setDismissedOfferId(delivery.id);
    setHighlightedOfferId(null);
    try {
      await apiRequest(`${API_URL}/deliveries/${delivery.id}/decline/`, { method: "POST" });
    } catch (_) {
      // ignore
    }
    await load();
  };

  const handleOfferTimeout = async (delivery) => {
    stopDeliveryOfferAlert();
    setDismissedOfferId(delivery.id);
    setHighlightedOfferId(null);
    try {
      await apiRequest(`${API_URL}/deliveries/${delivery.id}/offer-timeout/`, { method: "POST" });
    } catch (_) {
      // ignore
    }
    await load();
  };

  const handlePickup = async (delivery, { pickupPin, pickupConfirmed }) => {
    await act(delivery, "pickup", {
      pickup_pin: pickupPin || "",
      pickup_confirmed: Boolean(pickupConfirmed),
    });
  };

  const handleConfirm = async (delivery, pin, proofFile) => {
    try {
      setActionBusy(true);
      setError("");
      await confirmDeliveryWithProof(delivery.id, pin, proofFile);
      showNotice(`Delivery #${delivery.id} completed`);
      await load();
      setTab("requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmStop = async (delivery, stopId, pin, proofFile) => {
    try {
      setActionBusy(true);
      setError("");
      const res = await confirmStopWithProof(delivery.id, stopId, pin, proofFile);
      showNotice(res.all_stops_completed ? "Delivery completed" : "Stop confirmed");
      await load();
      if (res.all_stops_completed) setTab("requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeliveryException = async (delivery, payload) => {
    try {
      setActionBusy(true);
      setError("");
      await reportDeliveryException(delivery.id, payload);
      showNotice("Delivery sent to Yala support for review");
      await load();
      setTab("requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleCourierCancel = async (delivery) => {
    try {
      setActionBusy(true);
      setError("");
      await apiRequest(`${API_URL}/deliveries/${delivery.id}/cancel/`, { method: "POST" });
      showNotice("Delivery cancelled");
      await load();
      setTab("requests");
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <>
      <DeliveryCourierShell
        statusOnline={deliveryMode}
        notice={notice}
        error={error}
        onRefresh={load}
        onToggleOnline={toggleMode}
        onlineToggleLoading={modeLoading}
        onlineToggleDisabled={!deliveryMode && expiredDocAlerts.length > 0}
        activeDelivery={activeDelivery}
        todayEarnings={todayEarnings}
        earningsLabel={todayEarnings ? `${todayEarnings.amount} MRU` : "0 MRU"}
        sheetHead={null}
        sheetTitle={
          activeDelivery
            ? getTripHeadline(activeDelivery)
            : "Ready to deliver"
        }
        sheetSubtitle={
          activeDelivery
            ? `${activeDelivery.fare} MRU · ${activeDelivery.distance_km} km`
            : `${getDeliveryVehicleLabel(deliveryVehicleType)} · ${deliveryCities.join(", ")}`
        }
      >
        {activeDelivery ? (
          <DeliveryCourierTrip
            delivery={activeDelivery}
            busy={actionBusy}
            onArrive={() => act(activeDelivery, "arrive")}
            onPickup={handlePickup}
            onStart={() => act(activeDelivery, "start")}
            onConfirm={handleConfirm}
            onConfirmStop={handleConfirmStop}
            onDeliveryException={handleDeliveryException}
            onCancel={handleCourierCancel}
            onCall={handleMaskedCall}
            onChat={() => setChatOpen(true)}
            onResendPin={() => showNotice("PIN resend requested. Yala support can verify the recipient.")}
            onAdminSupport={() => showNotice("Admin support request will be included with your review proof.")}
          />
        ) : (
          <>
            {expiredDocAlerts.length > 0 ? (
              <div className="delivery-alert-banner" style={{ margin: "0 0 12px" }} role="alert">
                {expiredDocAlerts.map((alert) => (
                  <p key={alert.key} className="delivery-alert-banner__item is-expired">
                    <span className="delivery-alert-dot" aria-hidden="true" />
                    {alert.label} expired. Update before going online.
                  </p>
                ))}
                <button
                  type="button"
                  className="delivery-alert-banner__action"
                  onClick={() => {
                    window.location.href = "/delivery/documents";
                  }}
                >
                  Update documents
                </button>
              </div>
            ) : null}

            <DeliveryCourierTypePicker
              value={deliveryVehicleType}
              onChange={saveVehicleType}
              disabled={vehicleSaving || modeLoading}
              compact
            />

            <div className="delivery-uber__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`delivery-uber__tab ${tab === "requests" ? "is-active" : ""}`}
                onClick={() => setTab("requests")}
              >
                Requests ({available.length})
              </button>
              <button
                type="button"
                role="tab"
                className={`delivery-uber__tab ${tab === "active" ? "is-active" : ""}`}
                onClick={() => setTab("active")}
              >
                Active ({active.length})
              </button>
            </div>

            {loading ? <div className="delivery-uber__empty">Loading deliveries...</div> : null}

            {!loading && tab === "requests" && (
              <>
                {!deliveryMode ? (
                  <div className="delivery-uber__empty">Go online to see nearby delivery requests.</div>
                ) : null}
                {deliveryMode && available.length === 0 ? (
                  <div className="delivery-uber__empty">
                    No delivery requests nearby. New orders appear automatically.
                  </div>
                ) : null}
                {deliveryMode &&
                  available.map((delivery) => (
                    <DeliveryJobCard key={delivery.id} delivery={delivery} highlight>
                      <p className="delivery-uber-offer__pin-note">
                        Recipient gets a system-generated 4-digit PIN when you accept.
                      </p>
                      <div className="delivery-uber__accept-bar">
                        <button
                          type="button"
                          className="delivery-uber__btn"
                          disabled={active.length > 0 || actionBusy}
                          onClick={() => act(delivery, "accept")}
                        >
                          Accept delivery · {delivery.fare} MRU
                        </button>
                      </div>
                    </DeliveryJobCard>
                  ))}
              </>
            )}

            {!loading && tab === "active" && (
              <>
                {active.length === 0 ? (
                  <div className="delivery-uber__empty">All caught up! You don't have any active deliveries. New delivery requests will appear here.</div>
                ) : null}
                {active.map((delivery) => (
                  <DeliveryJobCard key={delivery.id} delivery={delivery}>
                    <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>
                      {delivery.recipient_name} · {delivery.recipient_phone}
                    </p>
                  </DeliveryJobCard>
                ))}
                <button
                  type="button"
                  className="delivery-courier-dash__history-link"
                  onClick={() => {
                    window.location.href = "/delivery/history";
                  }}
                >
                  View delivery history
                </button>
              </>
            )}
          </>
        )}
      </DeliveryCourierShell>

      {showIncomingOffer ? (
        <DeliveryCourierOffer
          delivery={incomingOffer}
          busy={actionBusy}
          onAccept={(delivery) => act(delivery, "accept")}
          onDecline={() => handleDeclineOffer(incomingOffer)}
          onTimeout={() => handleOfferTimeout(incomingOffer)}
        />
      ) : null}

      {chatOpen && activeDelivery?.id ? (
        <DeliveryChatSheet
          deliveryId={activeDelivery.id}
          role="courier"
          onClose={() => setChatOpen(false)}
        />
      ) : null}
    </>
  );
}
