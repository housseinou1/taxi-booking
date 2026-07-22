import React, { useState } from "react";

import { MARKET } from "../marketConfig";
import SupportReportForm from "../support/SupportReportForm";
import { DELIVERY_REPORT_OPTIONS } from "../support/supportCategories";
import "../support/support-mobile.css";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import "./delivery-uber.css";

const DELIVERY_FAQS = [
  {
    question: "How do I get paid for deliveries?",
    answer:
      "Earnings appear in Wallet & payouts after each completed delivery. Add your bank details, then request a withdrawal when your available balance is ready.",
  },
  {
    question: "Why can't I go online?",
    answer:
      "Make sure your documents are approved, your courier vehicle is set up, and your phone number is verified. Check Documents and Account for any pending steps.",
  },
  {
    question: "What if a customer is not available?",
    answer:
      "Wait at the location, call the customer from the active delivery screen, and use Help & support to report the issue if you cannot complete the handoff.",
  },
  {
    question: "How do I report a safety incident?",
    answer:
      "Use emergency numbers below for immediate danger. For platform safety issues, submit a report with your delivery ID and details.",
  },
];

export default function DeliveryCourierSupport() {
  const [reportCategory, setReportCategory] = useState(null);

  return (
    <DeliveryUberPage
      title="Help & support"
      onBack={() => {
        window.location.href = "/delivery/courier";
      }}
    >
      <section className="delivery-uber-card delivery-courier-support-card">
        <h2>Safety & emergency</h2>
        <p>Use these numbers only for real emergencies.</p>
        <div className="delivery-courier-emergency-grid">
          {MARKET.emergencyNumbers.map((contact) => (
            <a key={contact.number} href={`tel:${contact.number}`} className="delivery-courier-emergency-link">
              <strong>{contact.label}</strong>
              <span>{contact.number}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="delivery-uber-card delivery-courier-support-card">
        <h2>Call Yala support</h2>
        <p>Speak with the Yala Delivery support team.</p>
        <a href={`tel:${MARKET.privateCallNumber}`} className="delivery-uber__primary-btn delivery-courier-support-call">
          Call {MARKET.privateCallLabel}
        </a>
      </section>

      <section className="delivery-uber-card delivery-courier-support-card">
        <h2>Report an issue</h2>
        {!reportCategory ? (
          <div className="support-hub-grid">
            {DELIVERY_REPORT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="support-hub-tile"
                onClick={() => setReportCategory(option)}
              >
                <span>{option.icon}</span>
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        ) : (
          <SupportReportForm
            appType="delivery"
            category={reportCategory.id}
            categoryLabel={reportCategory.label}
            onCancel={() => setReportCategory(null)}
            contextFields={[
              { key: "delivery_id", label: "Delivery ID (optional)", placeholder: "Delivery reference" },
              { key: "phone", label: "Phone (optional)", type: "tel", placeholder: "+222XXXXXXXX" },
            ]}
          />
        )}
      </section>

      <section className="delivery-uber-card delivery-courier-support-card">
        <h2>FAQ</h2>
        <div className="delivery-courier-faq-list">
          {DELIVERY_FAQS.map((item) => (
            <details key={item.question} className="delivery-courier-faq-item">
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>
    </DeliveryUberPage>
  );
}
