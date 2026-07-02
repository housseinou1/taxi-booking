import React from "react";

const DEFAULT_STEPS = [
  { key: "order_received", label: "Order received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready_for_pickup", label: "Ready for pickup" },
];

export default function MerchantStatusCard({ merchantOrder, merchantName }) {
  const steps = merchantOrder?.progress?.length
    ? merchantOrder.progress
    : DEFAULT_STEPS.map((step) => ({ ...step, complete: false, active: false }));

  if (!merchantOrder && !merchantName) return null;

  return (
    <section className="delivery-track__merchant-card" aria-label="Merchant order progress">
      <div className="delivery-track__merchant-head">
        <span className="delivery-track__merchant-icon" aria-hidden>🏪</span>
        <div>
          <strong>{merchantName || merchantOrder?.merchant_name || "Store"}</strong>
          <p>{merchantOrder?.status_label || "Order in progress"}</p>
        </div>
      </div>
      <div className="delivery-track__merchant-progress">
        {steps.map((step, index) => (
          <div
            key={step.key}
            className={`delivery-track__merchant-step ${
              step.complete ? "is-done" : step.active ? "is-active" : ""
            }`}
          >
            <span className="delivery-track__merchant-dot" aria-hidden />
            <span>{step.label}</span>
            {index < steps.length - 1 ? <span className="delivery-track__merchant-line" aria-hidden /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
