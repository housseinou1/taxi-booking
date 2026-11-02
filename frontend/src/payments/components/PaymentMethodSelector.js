import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  MOBILE_MONEY_PROVIDERS,
  PAYMENT_CATEGORIES,
  resolvePaymentSelection,
  selectionFromMethod,
} from "../paymentMethods";
import "./PaymentMethodSelector.css";

/**
 * Reusable customer payment-method selector.
 *
 * One component for every checkout surface (YALA Rider, YALA Delivery customer,
 * merchant checkout where supported) so the provider-selection logic — and the
 * single-choice rule for Mobile Money — exists exactly once.
 *
 * Behaviour:
 *  - four primary categories: Credit/Debit Card, Mobile Money, YALA Wallet, Bank Transfer
 *  - choosing Mobile Money reveals a dropdown of Bankily / Masravi / Sedad
 *  - exactly one provider can be selected at a time (single native <select>)
 *  - an incomplete selection (Mobile Money, no provider) reports `complete: false`
 *    through `onChange` so the caller can block submission
 *
 * Safety: this component never decides that a payment succeeded. It only reports
 * the customer's intent; settlement is decided server-side by a verified provider
 * confirmation (see payments/paymentStatus.js).
 */
export default function PaymentMethodSelector({
  value,
  onChange,
  availableMethods,
  amount = null,
  currency = "MRU",
  livePaymentsEnabled = false,
  disabled = false,
  error = "",
  idPrefix = "yala-pay",
  showAmount = true,
  label,
}) {
  const { t } = useTranslation();

  const selection = useMemo(() => {
    if (typeof value === "string") return selectionFromMethod(value);
    if (value && typeof value === "object") {
      return { category: value.category || "", provider: value.provider || "" };
    }
    return { category: "", provider: "" };
  }, [value]);

  // A category is offered when it is explicitly allowed, or when at least one of
  // its methods is allowed (so `availableMethods: ["card","bankily"]` still shows
  // the Mobile Money category with the permitted provider inside it).
  const categories = useMemo(() => {
    if (!availableMethods || !availableMethods.length) return PAYMENT_CATEGORIES;
    const allowed = availableMethods.map((item) => String(item).toLowerCase());
    return PAYMENT_CATEGORIES.filter(
      (category) =>
        allowed.includes(category.id) ||
        category.methods.some((method) => allowed.includes(method))
    );
  }, [availableMethods]);

  const providersForCategory = useMemo(() => {
    if (!availableMethods || !availableMethods.length) return MOBILE_MONEY_PROVIDERS;
    const allowed = availableMethods.map((item) => String(item).toLowerCase());
    return MOBILE_MONEY_PROVIDERS.filter((provider) => allowed.includes(provider.id));
  }, [availableMethods]);

  const resolved = resolvePaymentSelection({
    category: selection.category,
    provider: selection.provider,
    availableMethods,
  });

  const showProviders = selection.category === "mobile_money";

  const emit = (nextCategory, nextProvider) => {
    const next = resolvePaymentSelection({
      category: nextCategory,
      provider: nextProvider,
      availableMethods,
    });
    onChange?.(next);
  };

  const handleCategory = (categoryId) => {
    if (disabled) return;
    // Re-selecting the active category keeps the chosen provider; switching away
    // clears it so a stale provider can never be submitted with another category.
    const keepProvider = categoryId === selection.category ? selection.provider : "";
    emit(categoryId, keepProvider);
  };

  const handleProvider = (providerId) => {
    if (disabled) return;
    emit("mobile_money", providerId);
  };

  const visibleError =
    error ||
    (showProviders && !selection.provider
      ? t("payments.errors.chooseProvider", "Choose a mobile money provider to continue.")
      : "");

  return (
    <section className="yala-pay-method" aria-labelledby={`${idPrefix}-legend`}>
      <div className="yala-pay-method__head">
        <h3 id={`${idPrefix}-legend`} className="yala-pay-method__title">
          {label || t("payments.methods.label", "Payment method")}
        </h3>
        {showAmount && amount !== null && amount !== undefined ? (
          <p className="yala-pay-method__amount">
            <span>{t("payments.amountDue", "Amount due")}</span>
            <strong>
              {amount} {currency}
            </strong>
          </p>
        ) : null}
      </div>

      <div
        className="yala-pay-method__grid"
        role="radiogroup"
        aria-labelledby={`${idPrefix}-legend`}
      >
        {categories.map((category) => {
          const active = selection.category === category.id;
          return (
            <button
              key={category.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              className={`yala-pay-method__card ${active ? "is-active" : ""}`}
              onClick={() => handleCategory(category.id)}
            >
              <span className="yala-pay-method__icon" aria-hidden="true">
                {category.icon}
              </span>
              <span className="yala-pay-method__text">
                <strong>{t(category.labelKey, category.defaultLabel)}</strong>
                <small>{t(category.hintKey, category.defaultHint)}</small>
              </span>
              <span className="yala-pay-method__check" aria-hidden="true" />
            </button>
          );
        })}
      </div>

      {showProviders ? (
        <div className="yala-pay-method__provider">
          <label htmlFor={`${idPrefix}-provider`}>
            {t("payments.mobileMoney.choose", "Choose your mobile money provider")}
          </label>
          <select
            id={`${idPrefix}-provider`}
            className="yala-pay-method__select"
            value={selection.provider}
            disabled={disabled}
            onChange={(event) => handleProvider(event.target.value)}
            aria-describedby={visibleError ? `${idPrefix}-error` : undefined}
          >
            <option value="">
              {t("payments.mobileMoney.placeholder", "Select a provider")}
            </option>
            {providersForCategory.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {t(provider.labelKey, provider.defaultLabel)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {visibleError ? (
        <p className="yala-pay-method__error" id={`${idPrefix}-error`} role="alert">
          {visibleError}
        </p>
      ) : null}

      {!livePaymentsEnabled ? (
        <p className="yala-pay-method__sandbox" role="note">
          {t(
            "payments.sandboxNotice",
            "Sandbox mode: providers are not live. No money will move and no payment is confirmed until the provider verifies it."
          )}
        </p>
      ) : null}

      <p className="yala-pay-method__status-hint" data-complete={resolved.complete ? "true" : "false"}>
        {resolved.complete
          ? t(
              "payments.status.pendingHint",
              "You will see a pending status until the provider independently verifies this payment."
            )
          : t(
              "payments.errors.incompleteSelection",
              "Select a payment method to continue."
            )}
      </p>
    </section>
  );
}
