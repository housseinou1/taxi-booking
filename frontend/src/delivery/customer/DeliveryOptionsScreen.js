import React, { useEffect, useMemo, useState } from "react";

import DeliveryCustomerTermsAcceptance from "../components/DeliveryCustomerTermsAcceptance";
import { DELIVERY_VEHICLE_TYPES } from "../deliveryVehicleTypes";
import { fetchServerCourierFares } from "../deliveryPricing";
import { getDefaultCourierType } from "../deliveryCourierRouting";
import { mapCategoryToApi } from "../deliveryCustomerCategories";
import { DELIVERY_PAYMENT_METHODS } from "../../payments/paymentApi";
import { getDeliveryPayButtonLabel } from "../../payments/deliveryPayment";

export default function DeliveryOptionsScreen({
  form,
  category,
  distanceKm,
  selectedOption,
  onSelectOption,
  paymentMethod,
  onPaymentMethodChange,
  onConfirm,
  onBack,
  busy = false,
  showTermsAcceptance = false,
  termsChecked = false,
  privacyChecked = false,
  onTermsCheckedChange,
  onPrivacyCheckedChange,
}) {
  const packageType = form.package_type || "small";
  const [fareOptions, setFareOptions] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetchServerCourierFares({
      serviceCategory: mapCategoryToApi(category),
      packageType,
      distanceKm,
      fragile: form.is_fragile,
      urgent: form.is_urgent,
      weightKg: form.weight_kg || null,
      promoCode: form.promo_code || "",
    }).then((options) => {
      if (!cancelled) setFareOptions(options);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [category, packageType, distanceKm, form.is_fragile, form.is_urgent, form.weight_kg, form.promo_code]);

  const localOptions = useMemo(
    () => fareOptions,
    [fareOptions]
  );

  const selectedFare = localOptions.find((item) => item.key === selectedOption) || localOptions[0];

  useEffect(() => {
    const allowed = localOptions.map((item) => item.key);
    if (!allowed.includes(selectedOption)) {
      onSelectOption(getDefaultCourierType(packageType));
    }
  }, [packageType, localOptions, onSelectOption, selectedOption]);

  const courierCards = DELIVERY_VEHICLE_TYPES.map((vehicle) => {
    const fare = localOptions.find((item) => item.key === vehicle.key);
    return { ...vehicle, fare };
  }).filter((item) => item.fare);

  const payLabel = getDeliveryPayButtonLabel(paymentMethod, selectedFare?.total || 0);

  return (
    <div className="delivery-dash__form-screen">
      <div className="delivery-dash__screen-head">
        <button type="button" className="delivery-dash__back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h2>Choose courier type</h2>
          <p>Select bicycle, motorcycle, or regular car</p>
        </div>
      </div>

      <div className="delivery-dash__courier-list" role="list">
        {courierCards.map((option) => {
          const active = selectedOption === option.key;
          const fare = option.fare;
          return (
            <button
              key={option.key}
              type="button"
              role="listitem"
              className={`delivery-dash__courier-card ${active ? "is-selected" : ""}`}
              onClick={() => onSelectOption(option.key)}
            >
              <span className="delivery-dash__courier-icon" aria-hidden>
                {option.icon}
              </span>
              <span className="delivery-dash__courier-body">
                <strong>{option.label}</strong>
                <span className="delivery-dash__courier-meta">
                  <span>{fare.etaMinutes} min ETA</span>
                  <span>{distanceKm} km</span>
                </span>
                <small style={{ display: "block", marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                  Best for: {option.description}
                </small>
              </span>
              <span className="delivery-dash__courier-price">
                {fare.total}
                <small>MRU</small>
              </span>
              <span className="delivery-dash__courier-check" aria-hidden />
            </button>
          );
        })}
      </div>

      <section className="delivery-dash__payment-section">
        <h3>Payment method</h3>
        <div className="delivery-dash__payment-chips">
          {DELIVERY_PAYMENT_METHODS.map((method) => (
            <button
              key={method.value}
              type="button"
              className={`delivery-dash__payment-chip ${paymentMethod === method.value ? "is-active" : ""}`}
              onClick={() => onPaymentMethodChange(method.value)}
              disabled={busy}
            >
              {method.label}
            </button>
          ))}
        </div>
      </section>

      <div className="delivery-dash__sticky-confirm">
        {showTermsAcceptance ? (
          <DeliveryCustomerTermsAcceptance
            termsChecked={termsChecked}
            privacyChecked={privacyChecked}
            onTermsChange={onTermsCheckedChange}
            onPrivacyChange={onPrivacyCheckedChange}
            returnPath="/delivery"
            disabled={busy}
          />
        ) : null}
        <button
          type="button"
          className="delivery-dash__confirm-btn delivery-dash__confirm-btn--pay"
          onClick={onConfirm}
          disabled={busy || (showTermsAcceptance && (!termsChecked || !privacyChecked))}
          aria-busy={busy}
        >
          {payLabel}
        </button>
      </div>
    </div>
  );
}
