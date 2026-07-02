import React from "react";

import { CUSTOMER_TERMS_SECTIONS, CUSTOMER_TERMS_VERSION } from "./deliveryCustomerTermsContent";
import "./DeliveryCustomerTermsPage.css";

const SESSION_KEY = "yala_delivery_customer_terms_read";

function getBackTarget() {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("return");
  if (next && (next.startsWith("/delivery") || next === "/settings")) {
    return next;
  }
  if (window.history.length > 1) {
    return null;
  }
  return "/delivery";
}

export default function DeliveryCustomerTermsPage({ showAcceptButton = false, onAccept }) {
  const handleBack = () => {
    const target = getBackTarget();
    if (target) {
      window.location.href = target;
      return;
    }
    window.history.back();
  };

  const handleAccept = () => {
    if (onAccept) {
      onAccept();
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
    handleBack();
  };

  return (
    <div className="delivery-customer-terms-page">
      <header className="delivery-customer-terms-page__header">
        <button type="button" className="delivery-customer-terms-page__back" onClick={handleBack} aria-label="Back">
          ←
        </button>
        <h1>Delivery Terms</h1>
        <span />
      </header>

      <div className="delivery-customer-terms-page__hero">
        <small>Yala Delivery</small>
        <h2>Customer Delivery Terms</h2>
        <p>Please read all sections carefully. Version {CUSTOMER_TERMS_VERSION}.</p>
      </div>

      <div
        className={`delivery-customer-terms-page__content ${
          showAcceptButton ? "delivery-customer-terms-page__content--accept" : ""
        }`}
      >
        {CUSTOMER_TERMS_SECTIONS.map((section) => (
          <article key={section.id} className="delivery-customer-terms-page__card">
            <div className="delivery-customer-terms-page__card-head">
              <span className="delivery-customer-terms-page__section-num">{section.id}</span>
              <h3>
                Section {section.id} — {section.title}
              </h3>
            </div>
            {section.body ? <p>{section.body}</p> : null}
            {section.intro ? <p>{section.intro}</p> : null}
            {section.bullets?.length ? (
              <ul>
                {section.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      {showAcceptButton ? (
        <footer className="delivery-customer-terms-page__footer">
          <button type="button" className="delivery-customer-terms-page__accept-btn" onClick={handleAccept}>
            I have read and agree
          </button>
        </footer>
      ) : null}
    </div>
  );
}

export { SESSION_KEY as CUSTOMER_TERMS_SESSION_KEY };
