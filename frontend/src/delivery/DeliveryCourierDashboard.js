import React, { useCallback, useEffect, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import {
  getExpiredOrMissingDocuments,
  getRequiredCourierDocumentTypes,
} from "./deliveryDocumentReview";
import DeliveryCourierOffer from "./DeliveryCourierOffer";
import DeliveryCourierTrip from "./DeliveryCourierTrip";
import DeliveryCourierComplete from "./DeliveryCourierComplete";
import DeliveryChatSheet from "./DeliveryChatSheet";
import DeliveryCourierHomeSheet from "./components/DeliveryCourierHomeSheet";
import {
  apiRequest,
  confirmDeliveryWithProof,
  confirmStopWithProof,
  reportDeliveryException,
} from "./DeliveryShared";
import { DeliveryCourierShell } from "./DeliveryUberLayout";
import { getDeliveryVehicleLabel } from "./deliveryVehicleTypes";
import useDeliveryCourierRealtime from "./useDeliveryCourierRealtime";
import useCourierLocationReporter from "./useCourierLocationReporter";
import { useDeliveryChatUnread } from "./useDeliveryChatUnread";
import { stopDeliveryOfferAlert, startDeliveryOfferAlertLoop, unlockRideRequestSound } from "../native/sound";
import { DEFAULT_DELIVERY_CITY } from "./deliveryCities";
import "./delivery-uber.css";
import "./delivery-premium-ui.css";
import "./delivery-customer-dashboard.css";
import "./delivery-courier-dashboard.css";
import "./delivery-courier-flow.css";
import "./delivery-courier-eats.css";
import "./delivery-instructions.css";

const POLL_MS = 20000;
const ONLINE_TIME_KEY = "yala_delivery_online_ms";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readStoredOnlineMs() {
  try {
    const raw = localStorage.getItem(ONLINE_TIME_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (parsed?.date !== getTodayKey()) return 0;
    return Number(parsed.ms || 0);
  } catch {
    return 0;
  }
}

function writeStoredOnlineMs(ms) {
  try {
    localStorage.setItem(ONLINE_TIME_KEY, JSON.stringify({ date: getTodayKey(), ms }));
  } catch {
    // ignore
  }
}

function formatOnlineDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

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
  const [sheetState, setSheetState] = useState("half");
  const [actionBusy, setActionBusy] = useState(false);
  const [dismissedOfferId, setDismissedOfferId] = useState(null);
  const [highlightedOfferId, setHighlightedOfferId] = useState(null);
  const [todayEarnings, setTodayEarnings] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [expiredDocAlerts, setExpiredDocAlerts] = useState([]);
  const [completedDelivery, setCompletedDelivery] = useState(null);
  const [onlineTimeMs, setOnlineTimeMs] = useState(readStoredOnlineMs);
  const noticeTimerRef = useRef(null);
  const seenOfferIdsRef = useRef(new Set());
  const offersBaselineReadyRef = useRef(false);
  const alertedOfferIdRef = useRef(null);
  const onlineSinceRef = useRef(null);

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
      if (settings.delivery_mode_enabled) {
        onlineSinceRef.current = onlineSinceRef.current || Date.now();
        setOnlineTimeMs(readStoredOnlineMs());
      }
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
  const { unread: chatUnread, setUnread: setChatUnread } = useDeliveryChatUnread(
    activeDelivery?.id,
    activeDelivery?.status,
    { enabled: Boolean(activeDelivery), chatOpen }
  );
  const liveOnlineMs =
    deliveryMode && onlineSinceRef.current
      ? onlineTimeMs + (Date.now() - onlineSinceRef.current)
      : onlineTimeMs;

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

  useEffect(() => {
    if (!showIncomingOffer || !incomingOffer?.id) {
      if (!showIncomingOffer) {
        alertedOfferIdRef.current = null;
      }
      return;
    }
    if (alertedOfferIdRef.current === incomingOffer.id) return;

    alertedOfferIdRef.current = incomingOffer.id;
    startDeliveryOfferAlertLoop({
      title: "New Delivery Request",
      body: `${incomingOffer.pickup || "Pickup"} → ${incomingOffer.destination || "Dropoff"} · ${incomingOffer.fare || "0"} MRU`,
    }).catch(() => {});
  }, [showIncomingOffer, incomingOffer?.id, incomingOffer?.pickup, incomingOffer?.destination, incomingOffer?.fare]);

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
    if (!deliveryMode) {
      if (onlineSinceRef.current) {
        const elapsed = Date.now() - onlineSinceRef.current;
        setOnlineTimeMs((prev) => {
          const next = prev + elapsed;
          writeStoredOnlineMs(next);
          return next;
        });
        onlineSinceRef.current = null;
      }
      return undefined;
    }

    if (!onlineSinceRef.current) {
      onlineSinceRef.current = Date.now();
    }

    const timer = window.setInterval(() => {
      if (!onlineSinceRef.current) return;
      const live = readStoredOnlineMs() + (Date.now() - onlineSinceRef.current);
      setOnlineTimeMs(live);
    }, 30000);

    return () => window.clearInterval(timer);
  }, [deliveryMode]);

  useEffect(() => {
    if (active.length > 0) {
      setTab("active");
    } else if (!activeDelivery && !completedDelivery) {
      setTab("requests");
    }
  }, [active.length, activeDelivery, completedDelivery]);

  const refreshTodayEarnings = async () => {
    try {
      const data = await apiRequest(`${API_URL}/deliveries/courier/earnings/`);
      const today = data?.today || {};
      setTodayEarnings({
        amount: Number(today.earnings || 0).toFixed(0),
        count: today.count || 0,
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!deliveryMode) {
      offersBaselineReadyRef.current = false;
      seenOfferIdsRef.current.clear();
      return;
    }
    if (offersBaselineReadyRef.current || loading) return;
    available.forEach((item) => {
      if (item?.id) seenOfferIdsRef.current.add(item.id);
    });
    offersBaselineReadyRef.current = true;
  }, [deliveryMode, available, loading]);

  // Poll/API fallback: ring when new offers appear (DoorDash-style even without WebSocket)
  useEffect(() => {
    if (!deliveryMode || activeDelivery || available.length === 0 || !offersBaselineReadyRef.current) return;

    const freshOffers = available.filter(
      (item) => item?.id && item.status === "requested" && !seenOfferIdsRef.current.has(item.id)
    );
    if (freshOffers.length === 0) return;

    freshOffers.forEach((item) => seenOfferIdsRef.current.add(item.id));
    const offer = freshOffers[0];
    setDismissedOfferId(null);
    setHighlightedOfferId(offer.id);

    startDeliveryOfferAlertLoop({
      title: "New Delivery Request",
      body: `${offer.pickup || "Pickup"} → ${offer.destination || "Dropoff"} · ${offer.fare || "0"} MRU`,
    }).catch(() => {});
  }, [available, deliveryMode, activeDelivery]);

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
        offersBaselineReadyRef.current = false;
      } else {
        stopDeliveryOfferAlert();
        offersBaselineReadyRef.current = false;
        seenOfferIdsRef.current.clear();
      }
      await apiRequest(`${API_URL}/deliveries/driver/mode/`, {
        method: "PATCH",
        body: JSON.stringify({ delivery_mode_enabled: newValue }),
      });
      setDeliveryMode(newValue);
      setDismissedOfferId(null);
      setHighlightedOfferId(null);
      if (newValue) {
        await load();
      }
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
      alertedOfferIdRef.current = null;
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
    alertedOfferIdRef.current = null;
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
    alertedOfferIdRef.current = null;
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
      stopDeliveryOfferAlert();
      await confirmDeliveryWithProof(delivery.id, pin, proofFile);
      setCompletedDelivery({ ...delivery, status: "delivered" });
      await load();
      await refreshTodayEarnings();
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
      stopDeliveryOfferAlert();
      const res = await confirmStopWithProof(delivery.id, stopId, pin, proofFile);
      if (res.all_stops_completed) {
        setCompletedDelivery({ ...delivery, status: "delivered" });
      } else {
        showNotice("Stop confirmed");
      }
      await load();
      await refreshTodayEarnings();
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
        onlineTimeLabel={formatOnlineDuration(liveOnlineMs)}
        sheetState={sheetState}
        onSheetStateChange={setSheetState}
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
            chatUnread={chatUnread}
            onResendPin={() => showNotice("PIN resend requested. Yala support can verify the recipient.")}
            onAdminSupport={() => showNotice("Admin support request will be included with your review proof.")}
          />
        ) : (
          <DeliveryCourierHomeSheet
            deliveryMode={deliveryMode}
            loading={loading}
            tab={tab}
            onTabChange={setTab}
            available={available}
            active={active}
            actionBusy={actionBusy}
            expiredDocAlerts={expiredDocAlerts}
            deliveryVehicleType={deliveryVehicleType}
            vehicleSaving={vehicleSaving}
            modeLoading={modeLoading}
            onVehicleChange={saveVehicleType}
            onAccept={(delivery) => act(delivery, "accept")}
            showInlineRequests={!showIncomingOffer}
          />
        )}
      </DeliveryCourierShell>

      {completedDelivery ? (
        <DeliveryCourierComplete
          delivery={completedDelivery}
          onDone={() => {
            setCompletedDelivery(null);
            setTab("requests");
            load();
            refreshTodayEarnings();
          }}
        />
      ) : null}

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
          deliveryStatus={activeDelivery.status}
          role="courier"
          contactName={activeDelivery.customer_name || activeDelivery.recipient_name || "Customer"}
          onClose={() => setChatOpen(false)}
          onUnreadChange={setChatUnread}
        />
      ) : null}
    </>
  );
}
