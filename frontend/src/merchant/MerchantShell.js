import React from "react";

import "../delivery/delivery-customer-dashboard.css";

const MERCHANT_TYPE_LABELS = {
  restaurant: "Restaurant",
  pharmacy: "Pharmacy",
  grocery: "Grocery store",
  supermarket: "Supermarket",
  shop: "Shop",
  market: "Market",
};

export function getMerchantTypeLabel(type) {
  return MERCHANT_TYPE_LABELS[type] || "Store";
}

export default function MerchantShell({ merchant, tab, tabs, onTabChange, statusBanner, error, children }) {
  return (
    <div className="merchant-dash">
      <header className="merchant-dash__header">
        <div>
          <h1>{merchant.business_name}</h1>
          <small>
            {getMerchantTypeLabel(merchant.business_type)} · Merchant dashboard
          </small>
        </div>
        <button
          type="button"
          className="merchant-dash__btn merchant-dash__btn--ghost"
          onClick={() => {
            window.location.href = "/delivery";
          }}
        >
          Back
        </button>
      </header>

      {statusBanner ? (
        <div className="delivery-uber__toast" style={{ margin: "12px 16px 0" }}>
          {statusBanner}
        </div>
      ) : null}
      {error ? (
        <div className="delivery-uber__toast is-error" style={{ margin: "12px 16px 0" }}>
          {error}
        </div>
      ) : null}

      <nav className="merchant-dash__tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`merchant-dash__tab ${tab === item.key ? "is-active" : ""}`}
            onClick={() => onTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="merchant-dash__body">{children}</div>
    </div>
  );
}
