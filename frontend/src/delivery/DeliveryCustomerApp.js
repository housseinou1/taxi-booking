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
import { useDeliveryChatUnread } from "./useDeliveryChatUnread";
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
import {
  fetchCustomerDeliveryTermsStatus,
  readCustomerTermsSessionFlag,
  readCustomerPrivacySessionFlag,
  acceptCustomerDeliveryTerms,
} from "./deliveryTermsApi";
import { applyDeliveryAreaToForm } from "./deliveryLocationUtils";
import { emptyInstructions } from "./deliveryInstructionUtils";
import "./delivery-uber.css";
import "./delivery-instructions.css";
import "./delivery-live-tracking.css";
import "./DeliveryCustomerTermsPage.css";

function isCustomerDeliveryLegalOnRecord(data = {}) {
  return Boolean(data.delivery_terms_accepted && data.privacy_policy_accepted);
}

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
  pickup_instructions: emptyInstructions(),
  dropoff_instructions: emptyInstructions(),
  recipient_alt_phone: "",
  save_address: false,
  save_instructions: false,
  address_label: "Home",
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
  const [busyAction, setBusyAction] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [selectedStore, setSelectedStore] = useState(null);
  const [placedOrder, setPlacedOrder] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { unread: chatUnread, setUnread: setChatUnread } = useDeliveryChatUnread(
    activeDelivery?.id,
    activeDelivery?.status,
    { enabled: Boolean(activeDelivery), chatOpen }
  );
  const [reportIssueText, setReportIssueText] = useState("");
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueSubmitting, setReportIssueSubmitting] = useState(false);
  const [reportIssueError, setReportIssueError] = useState("");
  const [customerTermsOnRecord, setCustomerTermsOnRecord] = useState(false);
  const [customerTermsChecked, setCustomerTermsChecked] = useState(false);
  const [customerPrivacyChecked, setCustomerPrivacyChecked] = useState(false);
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

  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const loadActiveDelivery = useCallback(async () => {
    try {
      const deliveries = await apiRequest(`${API_URL}/deliveries/mine/`);
      const active = deliveries.find((item) => !["delivered", "cancelled"].includes(item.status));
      if (!active) {
        const lastDelivered = deliveries.find((item) => item.status === "delivered");
        if (lastDelivered && screenRef.current === SCREENS.TRACKING) {
          setActiveDelivery(lastDelivered);
          setBusyAction(null);
          setPaymentSuccess(false);
          setError("");
          setScreen(SCREENS.COMPLETE);
        }
        return;
      }
      setActiveDelivery(active);
      setRecipientCode(active.recipient_code || "");
      setPickupPin(active.pickup_pin || "");
      setDropoffPin(active.dropoff_pin || "");
      if (active.status === "requested") setScreen(SCREENS.SEARCHING);
      else if (["accepted", "courier_arriving", "picked_up", "in_transit", "delivering", "delivery_exception"].includes(active.status)) setScreen(SCREENS.TRACKING);
      else if (active.status === "delivered") {
        setBusyAction(null);
        setPaymentSuccess(false);
        setError("");
        setScreen(SCREENS.COMPLETE);
      }
    } catch (err) {
      // Silently ignore load errors — this is a background poll, not a user action
    }
  }, []);

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
    if (!localStorage.getItem("access")) return;
    fetchCustomerDeliveryTermsStatus()
      .then((data) => {
        const onRecord = isCustomerDeliveryLegalOnRecord(data);
        setCustomerTermsOnRecord(onRecord);
        setCustomerTermsChecked(Boolean(data.delivery_terms_accepted));
        setCustomerPrivacyChecked(Boolean(data.privacy_policy_accepted));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (readCustomerTermsSessionFlag()) {
      setCustomerTermsChecked(true);
    }
    if (readCustomerPrivacySessionFlag()) {
      setCustomerPrivacyChecked(true);
    }
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
        if (data.recipient_code) setRecipientCode(data.recipient_code);
        if (data.pickup_pin) setPickupPin(data.pickup_pin);
        if (data.dropoff_pin) setDropoffPin(data.dropoff_pin);
        if (tracking.eta_minutes) setEtaMinutes(tracking.eta_minutes);
        if (tracking.driver_lat && tracking.driver_lng) {
          setCourierPosition([tracking.driver_lat, tracking.driver_lng]);
        }
        if (data.status === "delivered") {
          setBusyAction(null);
          setPaymentSuccess(false);
          setError("");
          setScreen(SCREENS.COMPLETE);
        }
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
    if (!localStorage.getItem("access")) {
      window.location.href = "/register?role=rider&next=/delivery";
      return;
    }

    const needsTerms = !customerTermsOnRecord;
    if (needsTerms && (!customerTermsChecked || !customerPrivacyChecked)) {
      setError("Please accept the Terms & Conditions and Privacy Policy before placing your order.");
      return;
    }
    setBusyAction("payment");
    setError("");
    try {
      if (needsTerms) {
        await acceptCustomerDeliveryTerms();
      }
      const apiCategory = mapCategoryToApi(category);
      const hasFile = form.prescription_photo instanceof File;
      const payload = buildDeliveryPayload(form, apiCategory, distanceKm, selectedOption, paymentMethod);
      if (needsTerms) {
        payload.delivery_terms_accepted = true;
        payload.privacy_accepted = true;
      }
      const body = hasFile
        ? buildDeliveryFormData(form, apiCategory, distanceKm, selectedOption, paymentMethod)
        : JSON.stringify(payload);

      if (hasFile && needsTerms) {
        body.append("delivery_terms_accepted", "true");
        body.append("privacy_accepted", "true");
      }

      const delivery = await apiRequest(`${API_URL}/deliveries/request/`, {
        method: "POST",
        body,
      });
      if (needsTerms) {
        setCustomerTermsOnRecord(true);
      }
      setRecipientCode(delivery.recipient_code || "");
      setPickupPin(delivery.pickup_pin || "");
      setDropoffPin(delivery.dropoff_pin || "");
      setEtaMinutes(delivery.estimated_duration_minutes || 25);
      setActiveDelivery(delivery);
      setPaymentSuccess(true);
      setScreen(SCREENS.SEARCHING);
    } catch (err) {
      setError(err.message);
      setPaymentSuccess(false);
    } finally {
      setBusyAction(null);
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
    setPaymentSuccess(false);
    setForm(initialForm);
    setScreen(SCREENS.HOME);
  };

  const handleReportIssue = useCallback(() => {
    setReportIssueText("");
    setReportIssueError("");
    setReportIssueOpen(true);
  }, []);

  const submitReportIssue = useCallback(async () => {
    if (!activeDelivery?.id) return;
    if (reportIssueText.trim().length < 5) {
      setReportIssueError("Please describe the issue (at least 5 characters).");
      return;
    }
    setReportIssueSubmitting(true);
    setReportIssueError("");
    try {
      await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/dispute/`, {
        method: "POST",
        body: JSON.stringify({ reason: reportIssueText.trim() }),
      });
      setReportIssueOpen(false);
      setError("");
    } catch (err) {
      setReportIssueError(err.message || "Could not report issue.");
    } finally {
      setReportIssueSubmitting(false);
    }
  }, [activeDelivery?.id, reportIssueText]);

  const handleCompleteContinue = () => {
    if (!activeDelivery?.id) {
      resetFlow();
      return;
    }
    setScreen(SCREENS.RATING);
  };

  const handleRatingSubmit = async ({ courierRating, merchantRating, experienceRating, review }) => {
    if (!activeDelivery?.id) {
      resetFlow();
      return;
    }
    setBusyAction("rating");
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
      setBusyAction(null);
    }
  };

  useEffect(() => {
    if (screen !== SCREENS.SEARCHING || !activeDelivery?.id) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const data = await apiRequest(`${API_URL}/deliveries/${activeDelivery.id}/`);
        setActiveDelivery(data);
        if (data.status === "delivered") {
          setBusyAction(null);
          setPaymentSuccess(false);
          setError("");
          setScreen(SCREENS.COMPLETE);
          return;
        }
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
      if (status === "delivered") {
        setBusyAction(null);
        setPaymentSuccess(false);
        setError("");
        setScreen(SCREENS.COMPLETE);
      }
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
          destinationLat={form.destination_lat}
          destinationLng={form.destination_lng}
          distanceKm={distanceKm}
          showTermsAcceptance={!customerTermsOnRecord}
          termsChecked={customerTermsChecked}
          privacyChecked={customerPrivacyChecked}
          onTermsCheckedChange={setCustomerTermsChecked}
          onPrivacyCheckedChange={setCustomerPrivacyChecked}
          onBack={() => setScreen(SCREENS.STORE)}
          onOrdered={(order) => {
            if (!customerTermsOnRecord) {
              setCustomerTermsOnRecord(true);
            }
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
            let updated = next;
            if (next.service_city !== form.service_city) {
              applyCityCenter(next.service_city);
              return;
            }
            if (next.pickup !== form.pickup && next.pickup) {
              updated = applyDeliveryAreaToForm(updated, "pickup", next.pickup);
            }
            if (next.destination !== form.destination && next.destination) {
              updated = applyDeliveryAreaToForm(updated, "destination", next.destination);
            }
            setForm(updated);
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
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          onConfirm={confirmDelivery}
          onBack={() => setScreen(SCREENS.REQUEST)}
          busy={busyAction === "payment"}
          showTermsAcceptance={!customerTermsOnRecord}
          termsChecked={customerTermsChecked}
          privacyChecked={customerPrivacyChecked}
          onTermsCheckedChange={setCustomerTermsChecked}
          onPrivacyCheckedChange={setCustomerPrivacyChecked}
        />
      );
    }
    if (screen === SCREENS.SEARCHING) {
      return (
        <DeliverySearchingScreen
          etaMinutes={activeDelivery?.estimated_duration_minutes || etaMinutes || 20}
          onCancel={cancelRequest}
          paymentSuccess={paymentSuccess}
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
          chatUnread={chatUnread}
          onReportIssue={handleReportIssue}
        />
      );
    }
    if (screen === SCREENS.COMPLETE && activeDelivery) {
      return (
        <DeliveryCompleteScreen
          delivery={activeDelivery}
          busy={busyAction === "rating"}
          onContinue={handleCompleteContinue}
        />
      );
    }
    if (screen === SCREENS.RATING && activeDelivery) {
      return (
        <DeliveryRatingScreen
          delivery={activeDelivery}
          busy={busyAction === "rating"}
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
        window.location.href = "/delivery/customer/settings";
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
      {(recipientCode || activeDelivery?.recipient_code || dropoffPin || activeDelivery?.dropoff_pin) &&
      [SCREENS.SEARCHING, SCREENS.TRACKING].includes(screen) ? (
        <div className="delivery-uber__pin-banner delivery-uber__pin-banner--dropoff">
          Recipient PIN:{" "}
          <strong>
            {dropoffPin ||
              activeDelivery?.dropoff_pin ||
              recipientCode ||
              activeDelivery?.recipient_code}
          </strong>
          <small> — Share with recipient for courier handoff</small>
        </div>
      ) : null}
      {(pickupPin || activeDelivery?.pickup_pin) && ["accepted", "courier_arriving"].includes(activeDelivery?.status) ? (
        <div className="delivery-uber__pin-banner delivery-uber__pin-banner--pickup">
          Pickup PIN: <strong>{pickupPin || activeDelivery?.pickup_pin}</strong>
        </div>
      ) : null}
      {renderBody()}
      {chatOpen && activeDelivery?.id ? (
        <DeliveryChatSheet
          deliveryId={activeDelivery.id}
          deliveryStatus={activeDelivery.status}
          role="customer"
          contactName={activeDelivery.driver_name || "Courier"}
          onClose={() => setChatOpen(false)}
          onUnreadChange={setChatUnread}
        />
      ) : null}
      {reportIssueOpen ? (
        <div className="delivery-uber__modal-overlay" role="dialog" aria-modal="true" aria-label="Report delivery issue">
          <div className="delivery-uber__modal">
            <h3>Report an issue</h3>
            <p>Describe the problem with this delivery:</p>
            <textarea
              className="delivery-uber__textarea"
              rows={4}
              value={reportIssueText}
              onChange={(e) => setReportIssueText(e.target.value)}
              placeholder="e.g. Package not arrived, wrong address..."
              autoFocus
            />
            {reportIssueError ? <p className="delivery-uber__toast is-error">{reportIssueError}</p> : null}
            <div className="delivery-uber__modal-actions">
              <button
                type="button"
                className="delivery-uber__btn delivery-uber__btn--secondary"
                onClick={() => setReportIssueOpen(false)}
                disabled={reportIssueSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delivery-uber__primary-btn"
                onClick={submitReportIssue}
                disabled={reportIssueSubmitting}
              >
                {reportIssueSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DeliveryCustomerShell>
  );
}
