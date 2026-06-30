import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import { MARKET } from "../marketConfig";
import NotificationCenter from "../components/NotificationCenter";
import DeliveryChatSheet from "./DeliveryChatSheet";
import DeliveryCompleteScreen from "./customer/DeliveryCompleteScreen";
import DeliveryRatingScreen from "./customer/DeliveryRatingScreen";
import DeliveryCustomerHome from "./customer/DeliveryCustomerHome";
import DeliveryStoresBrowse from "./customer/DeliveryStoresBrowse";
import StoreDetail from "./customer/StoreDetail";
import DeliveryCart from "./customer/DeliveryCart";
import DeliveryLiveTracking from "./customer/DeliveryLiveTracking";
import MerchantStatusCard from "./components/MerchantStatusCard";
import DeliveryOptionsScreen from "./customer/DeliveryOptionsScreen";
import DeliveryRequestScreen from "./customer/DeliveryRequestScreen";
import DeliverySearchingScreen from "./customer/DeliverySearchingScreen";
import DeliveryCustomerShell from "./DeliveryCustomerShell";
import DeliveryCustomerVerification from "../security/DeliveryCustomerVerification";
import { getDeliveryCityCenter } from "./deliveryCities";
import {
  getCategoryFormDefaults,
  mapCategoryToApi,
} from "./deliveryCustomerCategories";
import {
  buildDeliveryFormData,
  buildDeliveryPayload,
  validateCategoryForm,
} from "./deliveryCategoryFields";
import { getDefaultCourierType } from "./deliveryCourierRouting";
import { haversineKm } from "./deliveryPricing";
import useDeliveryTrackingRealtime from "./useDeliveryTrackingRealtime";
import useSmoothCourierPosition from "./hooks/useSmoothCourierPosition";
import { apiRequest } from "./DeliveryShared";
import { STORE_CATEGORY_MAP } from "../merchant/merchantApi";
import "./delivery-uber.css";
import "./delivery-live-tracking.css";

const SCREENS = {
  HOME: "home",
  STORES: "stores",
  STORE: "store",
  CART: "cart",
  ORDER_PLACED: "order_placed",
  REQUEST: "request",
  OPTIONS: "options",
  SEARCHING: "searching",
  TRACKING: "tracking",
  COMPLETE: "complete",
  RATING: "rating",
  VERIFICATION: "verification",
};

const initialForm = {
  service_city: MARKET.defaultCity,
  pickup: "",
  destination: "",
  recipient_name: "",
  recipient_phone: "",
  package_type: "small",
  package_description: "",
  distance_km: "5",
  is_fragile: false,
  customer_notes: "",
  restaurant_name: "",
  food_items: "",
  preparation_time_minutes: "",
  pharmacy_name: "",
  shopping_list: "",
  prescription_reference: "",
  prescription_photo: null,
  is_urgent: false,
  is_temperature_sensitive: false,
  store_name: "",
  item_quantity: "",
  substitution_notes: "",
  is_secure_delivery: false,
  weight_kg: "",
  promo_code: "",
  pickup_lat: MARKET.center[0],
  pickup_lng: MARKET.center[1],
  destination_lat: MARKET.center[0] + 0.01,
  destination_lng: MARKET.center[1] + 0.01,
};

const SHEET_STATE_BY_SCREEN = {
  [SCREENS.HOME]: "collapsed",
  [SCREENS.STORES]: "full",
  [SCREENS.STORE]: "full",
  [SCREENS.CART]: "full",
  [SCREENS.ORDER_PLACED]: "half",
  [SCREENS.REQUEST]: "full",
  [SCREENS.OPTIONS]: "full",
  [SCREENS.SEARCHING]: "half",
  [SCREENS.TRACKING]: "half",
  [SCREENS.COMPLETE]: "full",
  [SCREENS.RATING]: "full",
  [SCREENS.VERIFICATION]: "full",
};

const SHELL_VARIANT_BY_SCREEN = {
  [SCREENS.HOME]: "home",
  [SCREENS.SEARCHING]: "compact",
  [SCREENS.TRACKING]: "tracking",
  [SCREENS.ORDER_PLACED]: "compact",
  [SCREENS.REQUEST]: "form",
  [SCREENS.OPTIONS]: "form",
};

export default function DeliveryCustomerApp() {
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [sheetState, setSheetState] = useState("collapsed");
  const [category, setCategory] = useState("package");
  const [form, setForm] = useState(initialForm);
  const [selectedOption, setSelectedOption] = useState("motorcycle");
  const [courierPosition, setCourierPosition] = useState(null);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [recipientCode, setRecipientCode] = useState("");
  const [pickupPin, setPickupPin] = useState("");
  const [dropoffPin, setDropoffPin] = useState("");
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState({ paymentMethod: "cash", tip: 0 });
  const pollRef = useRef(null);

  const rawCourierPosition = useMemo(() => {
    if (courierPosition) return { lat: courierPosition[0], lng: courierPosition[1] };
    if (activeDelivery?.driver_lat && activeDelivery?.driver_lng) {
      return { lat: activeDelivery.driver_lat, lng: activeDelivery.driver_lng };
    }
    return null;
  }, [courierPosition, activeDelivery?.driver_lat, activeDelivery?.driver_lng]);

  const smoothCourierPosition = useSmoothCourierPosition(
    rawCourierPosition,
    screen === SCREENS.TRACKING
  );

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

  const distanceKm = useMemo(() => {
    const km = haversineKm(form.pickup_lat, form.pickup_lng, form.destination_lat, form.destination_lng);
    return Number(Math.max(km, 0.5).toFixed(1));
  }, [form.pickup_lat, form.pickup_lng, form.destination_lat, form.destination_lng]);

  const pickup = useMemo(
    () => ({ lat: form.pickup_lat, lng: form.pickup_lng, label: form.pickup }),
    [form.pickup_lat, form.pickup_lng, form.pickup]
  );
  const destination = useMemo(
    () => ({ lat: form.destination_lat, lng: form.destination_lng, label: form.destination }),
    [form.destination_lat, form.destination_lng, form.destination]
  );

  const loadActiveDelivery = useCallback(async () => {
    try {
      const deliveries = await apiRequest(`${API_URL}/deliveries/mine/`);
      const active = deliveries.find((item) => !["delivered", "cancelled"].includes(item.status));
      if (!active) {
        const lastDelivered = deliveries.find((item) => item.status === "delivered");
        if (lastDelivered && screen === SCREENS.TRACKING) {
          setActiveDelivery(lastDelivered);
          setScreen(SCREENS.COMPLETE);
        }
        return;
      }
      setActiveDelivery(active);
      if (active.status === "requested") setScreen(SCREENS.SEARCHING);
      else if (["accepted", "courier_arriving", "picked_up", "in_transit", "delivering", "delivery_exception"].includes(active.status)) setScreen(SCREENS.TRACKING);
      else if (active.status === "delivered") setScreen(SCREENS.COMPLETE);
    } catch (err) {
      setError(err.message);
    }
  }, [screen]);

  useEffect(() => {
    loadActiveDelivery();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [loadActiveDelivery]);

  useEffect(() => {
    setSheetState(SHEET_STATE_BY_SCREEN[screen] || "half");
  }, [screen]);

  useEffect(() => {
    if (!activeDelivery?.id || screen !== SCREENS.TRACKING) return undefined;

    const refresh = async () => {
      try {
        const [data, tracking] = await Promise.all([
          apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/`),
          apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/tracking/`),
        ]);
        setActiveDelivery({
          ...data,
          eta_minutes: tracking.eta_minutes,
          customer_display_status: tracking.customer_display_status || data.customer_display_status,
          customer_display_label: tracking.customer_display_label || data.customer_display_label,
          arriving_soon: tracking.arriving_soon || data.arriving_soon,
          near_dropoff_notified: tracking.near_dropoff_notified,
          merchant_order: tracking.merchant_order || data.merchant_order,
          driver_photo: tracking.driver_photo || data.driver_photo,
          courier_vehicle_type: tracking.courier_vehicle_type || data.courier_vehicle_type,
          courier_vehicle_label: tracking.courier_vehicle_label || data.courier_vehicle_label,
          plate_number: tracking.plate_number || data.plate_number,
        });
        if (tracking.eta_minutes) setEtaMinutes(tracking.eta_minutes);
        if (tracking.driver_lat && tracking.driver_lng) {
          setCourierPosition([tracking.driver_lat, tracking.driver_lng]);
        }
        if (data.status === "delivered") setScreen(SCREENS.COMPLETE);
      } catch (_) {
        // ignore polling errors
      }
    };

    pollRef.current = window.setInterval(refresh, 8000);
    refresh();

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [activeDelivery?.id, screen]);

  const applyCityCenter = (cityName) => {
    const center = getDeliveryCityCenter(cityName);
    setForm((prev) => ({
      ...prev,
      service_city: cityName,
      pickup_lat: center[0],
      pickup_lng: center[1],
      destination_lat: center[0] + 0.012,
      destination_lng: center[1] + 0.012,
    }));
  };

  const startCategory = (categoryKey) => {
    if (STORE_CATEGORY_MAP[categoryKey]) {
      setCategory(categoryKey);
      setSelectedStore(null);
      setScreen(SCREENS.STORES);
      return;
    }
    const defaults = getCategoryFormDefaults(categoryKey);
    setCategory(categoryKey);
    setForm({
      ...initialForm,
      service_city: form.service_city,
      pickup_lat: form.pickup_lat,
      pickup_lng: form.pickup_lng,
      destination_lat: form.destination_lat,
      destination_lng: form.destination_lng,
      ...defaults,
    });
    setSelectedOption(getDefaultCourierType(defaults.package_type));
    setScreen(SCREENS.REQUEST);
  };

  const continueToOptions = () => {
    const validationError = validateCategoryForm(category, form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setForm((prev) => ({ ...prev, distance_km: String(distanceKm) }));
    setScreen(SCREENS.OPTIONS);
  };

  const confirmDelivery = async () => {
    setSubmitting(true);
    setError("");
    try {
      const apiCategory = mapCategoryToApi(category);
      const hasFile = form.prescription_photo instanceof File;
      const body = hasFile
        ? buildDeliveryFormData(form, apiCategory, distanceKm, selectedOption)
        : JSON.stringify(buildDeliveryPayload(form, apiCategory, distanceKm, selectedOption));

      const delivery = await apiRequest(`${API_URL}/deliveries/request/`, {
        method: "POST",
        body,
      });
      setRecipientCode(delivery.recipient_code || "");
      setPickupPin(delivery.pickup_pin || "");
      setDropoffPin(delivery.dropoff_pin || "");
      setEtaMinutes(delivery.estimated_duration_minutes || 25);
      setActiveDelivery(delivery);
      setScreen(SCREENS.SEARCHING);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async () => {
    if (!activeDelivery?.id) {
      resetFlow();
      return;
    }
    try {
      await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/cancel/`, { method: "POST" });
      resetFlow();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetFlow = () => {
    setActiveDelivery(null);
    setRecipientCode("");
    setPickupPin("");
    setDropoffPin("");
    setEtaMinutes(null);
    setCourierPosition(null);
    setSelectedStore(null);
    setPlacedOrder(null);
    setForm(initialForm);
    setScreen(SCREENS.HOME);
  };

  const handleReportIssue = useCallback(async () => {
    if (!activeDelivery?.id) return;
    const reason = window.prompt("Describe the issue with this delivery:") || "";
    if (reason.trim().length < 5) return;
    try {
      await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/dispute/`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setError("");
      window.alert("Issue reported. Our support team will review it.");
    } catch (err) {
      setError(err.message || "Could not report issue.");
    }
  }, [activeDelivery?.id]);

  const handleCompleteContinue = async ({ paymentMethod, tip }) => {
    if (!activeDelivery?.id) {
      resetFlow();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/pay/`, {
        method: "POST",
        body: JSON.stringify({
          payment_method: paymentMethod,
          tip_amount: tip,
        }),
      });
      setPaymentDraft({ paymentMethod, tip });
      setActiveDelivery((prev) => (prev ? { ...prev, tip_amount: tip, payment_method: paymentMethod } : prev));
      setScreen(SCREENS.RATING);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRatingSubmit = async ({ courierRating, merchantRating, experienceRating, review }) => {
    if (!activeDelivery?.id) {
      resetFlow();
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/rate/`, {
        method: "POST",
        body: JSON.stringify({
          rating: courierRating,
          review,
          merchant_rating: merchantRating,
          experience_rating: experienceRating,
        }),
      });
      resetFlow();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (screen !== SCREENS.SEARCHING || !activeDelivery?.id) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const data = await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/`);
        setActiveDelivery(data);
        if (data.driver || ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"].includes(data.status)) {
          setScreen(SCREENS.TRACKING);
        }
      } catch (_) {
        // ignore polling errors
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [screen, activeDelivery?.id]);

  useDeliveryTrackingRealtime({
    deliveryId: activeDelivery?.id,
    enabled: screen === SCREENS.TRACKING,
    onStatus: (status) => {
      setActiveDelivery((prev) => (prev ? { ...prev, status } : prev));
      if (status === "delivered") setScreen(SCREENS.COMPLETE);
    },
    onLocation: (lat, lng, eta) => {
      setCourierPosition([lat, lng]);
      if (eta) {
        setEtaMinutes(eta);
        setActiveDelivery((prev) =>
          prev
            ? {
                ...prev,
                eta_minutes: eta,
                arriving_soon: eta <= 3,
                customer_display_status: eta <= 3 && ["in_transit", "delivering", "picked_up"].includes(prev.status)
                  ? "arriving_soon"
                  : prev.customer_display_status,
              }
            : prev
        );
      }
    },
    onAssigned: (payload) => {
      setActiveDelivery((prev) => (prev ? { ...prev, ...payload, driver_name: payload.driver_name } : prev));
      setScreen(SCREENS.TRACKING);
    },
  });

  const showRouteOnMap = [
    SCREENS.REQUEST,
    SCREENS.OPTIONS,
    SCREENS.SEARCHING,
    SCREENS.TRACKING,
  ].includes(screen);

  const renderBody = () => {
    if (screen === SCREENS.HOME) {
      return (
        <DeliveryCustomerHome onSelectCategory={startCategory} />
      );
    }
    if (screen === SCREENS.STORES) {
      return (
        <DeliveryStoresBrowse
          category={category}
          onSelectStore={(store) => {
            setSelectedStore(store);
            setScreen(SCREENS.STORE);
          }}
          onBack={() => setScreen(SCREENS.HOME)}
        />
      );
    }
    if (screen === SCREENS.STORE && selectedStore) {
      return (
        <StoreDetail
          store={selectedStore}
          onBack={() => setScreen(SCREENS.STORES)}
          onOpenCart={(store) => {
            setSelectedStore(store);
            setScreen(SCREENS.CART);
          }}
        />
      );
    }
    if (screen === SCREENS.CART && selectedStore) {
      return (
        <DeliveryCart
          store={selectedStore}
          deliveryAddress={form.destination || "Nouakchott"}
          distanceKm={distanceKm}
          onBack={() => setScreen(SCREENS.STORE)}
          onOrdered={(order) => {
            setPlacedOrder(order);
            setScreen(SCREENS.ORDER_PLACED);
          }}
        />
      );
    }
    if (screen === SCREENS.ORDER_PLACED && placedOrder) {
      return (
        <div className="delivery-track">
          <div className="delivery-track__head-copy">
            <span className="delivery-track__status-pill">Order confirmed</span>
            <p>Order #{placedOrder.id} · {placedOrder.total} MRU</p>
          </div>
          <MerchantStatusCard
            merchantOrder={{
              status: placedOrder.status,
              status_label: placedOrder.status_display || "Preparing your order",
              merchant_name: placedOrder.merchant_name || selectedStore?.business_name,
              progress: [
                { key: "order_received", label: "Order received", complete: true, active: false },
                { key: "preparing", label: "Preparing", complete: ["preparing", "ready_for_pickup"].includes(placedOrder.status), active: placedOrder.status === "preparing" },
                { key: "ready_for_pickup", label: "Ready for pickup", complete: placedOrder.status === "ready_for_pickup", active: placedOrder.status === "ready_for_pickup" },
              ],
            }}
            merchantName={placedOrder.merchant_name || selectedStore?.business_name}
          />
          <p className="delivery-uber__muted">We will assign a courier when your order is ready.</p>
          <button type="button" className="delivery-track__primary-btn" onClick={resetFlow}>Back to home</button>
        </div>
      );
    }
    if (screen === SCREENS.REQUEST) {
      return (
        <DeliveryRequestScreen
          form={form}
          category={category}
          onChange={(next) => {
            if (next.service_city !== form.service_city) applyCityCenter(next.service_city);
            setForm(next);
          }}
          onCategoryChange={(categoryKey) => {
            const defaults = getCategoryFormDefaults(categoryKey);
            setCategory(categoryKey);
            setForm((prev) => ({ ...prev, ...defaults }));
          }}
          onContinue={continueToOptions}
          onBack={() => setScreen(SCREENS.HOME)}
        />
      );
    }
    if (screen === SCREENS.OPTIONS) {
      return (
        <DeliveryOptionsScreen
          form={form}
          category={category}
          distanceKm={distanceKm}
          selectedOption={selectedOption}
          onSelectOption={setSelectedOption}
          onConfirm={confirmDelivery}
          onBack={() => setScreen(SCREENS.REQUEST)}
          busy={submitting}
        />
      );
    }
    if (screen === SCREENS.SEARCHING) {
      return (
        <DeliverySearchingScreen
          etaMinutes={activeDelivery?.estimated_duration_minutes || etaMinutes || 20}
          onCancel={cancelRequest}
        />
      );
    }
    if (screen === SCREENS.TRACKING && activeDelivery) {
      return (
        <DeliveryLiveTracking
          delivery={activeDelivery}
          etaMinutes={etaMinutes || activeDelivery.eta_minutes}
          pickupPin={pickupPin || activeDelivery.pickup_pin}
          dropoffPin={dropoffPin || activeDelivery.dropoff_pin}
          onCall={handleMaskedCall}
          onChat={() => setChatOpen(true)}
          onReportIssue={handleReportIssue}
        />
      );
    }
    if (screen === SCREENS.COMPLETE && activeDelivery) {
      return (
        <DeliveryCompleteScreen
          delivery={{
            ...activeDelivery,
            tip_amount: paymentDraft.tip,
            payment_method: paymentDraft.paymentMethod,
          }}
          busy={submitting}
          onContinue={handleCompleteContinue}
        />
      );
    }
    if (screen === SCREENS.RATING && activeDelivery) {
      return (
        <DeliveryRatingScreen
          delivery={activeDelivery}
          busy={submitting}
          onSubmit={handleRatingSubmit}
          onReportIssue={handleReportIssue}
        />
      );
    }
    if (screen === SCREENS.VERIFICATION) {
      return <DeliveryCustomerVerification onClose={() => setScreen(SCREENS.HOME)} />;
    }
    return null;
  };

  const profileInitial = (() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      const name = user.first_name || user.email || "Y";
      return String(name).charAt(0).toUpperCase();
    } catch {
      return "Y";
    }
  })();

  return (
    <DeliveryCustomerShell
      sheetState={sheetState}
      onSheetStateChange={setSheetState}
      variant={screen === SCREENS.TRACKING ? "tracking" : SHELL_VARIANT_BY_SCREEN[screen] || "full"}
      showFloatingSearch={screen === SCREENS.HOME}
      whereToLabel="Where to deliver?"
      showLocate={screen === SCREENS.HOME || screen === SCREENS.REQUEST || screen === SCREENS.OPTIONS}
      deliveryStatus={activeDelivery?.customer_display_status || activeDelivery?.status}
      pickup={showRouteOnMap ? pickup : null}
      destination={showRouteOnMap ? destination : null}
      courierPosition={smoothCourierPosition}
      profileInitial={profileInitial}
      notificationSlot={
        localStorage.getItem("access") ? (
          <NotificationCenter mode="delivery" variant="inline" />
        ) : null
      }
      onMenu={() => {
        window.location.href = "/settings";
      }}
      onProfile={() => {
        if (!localStorage.getItem("access")) {
          window.location.href = "/register?role=rider&next=/delivery";
          return;
        }
        setScreen(SCREENS.VERIFICATION);
      }}
      onWhereTo={() => startCategory("package")}
      onLocate={() => applyCityCenter(form.service_city)}
    >
      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}
      {submitting ? <div className="delivery-uber__toast">Creating your delivery...</div> : null}
      {recipientCode ? (
        <div className="delivery-uber__pin-banner">
          Drop-off PIN: <strong>{recipientCode}</strong>
        </div>
      ) : null}
      {dropoffPin && ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"].includes(activeDelivery?.status) ? (
        <div className="delivery-uber__pin-banner delivery-uber__pin-banner--dropoff">
          📦 Recipient PIN: <strong>{dropoffPin}</strong>
          <small> — Share with recipient</small>
        </div>
      ) : null}
      {pickupPin && ["accepted", "courier_arriving"].includes(activeDelivery?.status) ? (
        <div className="delivery-uber__pin-banner delivery-uber__pin-banner--pickup">
          Pickup PIN: <strong>{pickupPin}</strong>
        </div>
      ) : null}
      {renderBody()}
      {chatOpen && activeDelivery?.id ? (
        <DeliveryChatSheet
          deliveryId={activeDelivery.id}
          role="customer"
          onClose={() => setChatOpen(false)}
        />
      ) : null}
    </DeliveryCustomerShell>
  );
}
