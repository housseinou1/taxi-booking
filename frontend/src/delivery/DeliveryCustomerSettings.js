import React from "react";

import LegalCenter from "../legal/LegalCenter";
import "./delivery-uber.css";
import "./delivery-customer-dashboard.css";

export default function DeliveryCustomerSettings() {
  const handleBack = () => {
    window.location.href = "/delivery";
  };

  return (
    <main className="delivery-dash delivery-uber delivery-uber--customer" style={{ minHeight: "100dvh", background: "#f8f9fb" }}>
      <header className="delivery-dash__top" style={{ position: "sticky", top: 0, background: "#fff" }}>
        <button type="button" className="delivery-dash__icon-btn" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <strong style={{ flex: 1, textAlign: "center", fontSize: 17 }}>Account</strong>
        <span style={{ width: 44 }} />
      </header>

      <div style={{ padding: 16, display: "grid", gap: 16 }}>
        <section className="delivery-uber-card">
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Profile</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            Manage verification, payments, and support from your Yala Delivery account.
          </p>
          <button
            type="button"
            className="delivery-dash__confirm-btn"
            style={{ marginTop: 14 }}
            onClick={() => {
              window.location.href = "/settings";
            }}
          >
            App settings
          </button>
        </section>

        <section>
          <h3 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9ca3af" }}>
            Legal
          </h3>
          <button
            type="button"
            className="delivery-dash__courier-card"
            style={{ width: "100%", textAlign: "left", marginBottom: 8 }}
            onClick={() => {
              window.location.href = "/delivery/customer/terms";
            }}
          >
            <span className="delivery-dash__courier-body">
              <strong>Terms & Privacy</strong>
              <span className="delivery-dash__courier-meta">Ordering, payment, and privacy policy</span>
            </span>
            <span aria-hidden>›</span>
          </button>
          <LegalCenter app="delivery" />
        </section>
      </div>
    </main>
  );
}
