import React, { useState } from "react";

import { MARKET } from "../marketConfig";
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
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [deliveryId, setDeliveryId] = useState("");
  const [notice, setNotice] = useState("");

  const submitReport = (event) => {
    event.preventDefault();
    if (!phone.trim() && !message.trim()) {
      setNotice("Add a phone number and describe the issue.");
      return;
    }

    const caseNumber = `YDL-${Date.now().toString().slice(-6)}`;
    const savedReports = JSON.parse(localStorage.getItem("sx_support_reports") || "[]");
    localStorage.setItem(
      "sx_support_reports",
      JSON.stringify([
        {
          id: caseNumber,
          topic: "delivery",
          phone: phone.trim(),
          deliveryId: deliveryId.trim(),
          message: message.trim(),
          createdAt: new Date().toISOString(),
        },
        ...savedReports,
      ])
    );

    setNotice(`Report submitted. Case ${caseNumber}. Our team will follow up.`);
    setMessage("");
    setDeliveryId("");
  };

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
        <form className="delivery-courier-support-form" onSubmit={submitReport}>
          <label className="delivery-uber-field">
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+222XXXXXXXX"
            />
          </label>
          <label className="delivery-uber-field">
            Delivery ID (optional)
            <input
              type="text"
              value={deliveryId}
              onChange={(event) => setDeliveryId(event.target.value)}
              placeholder="Example: 1042"
            />
          </label>
          <label className="delivery-uber-field">
            What happened?
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the delivery, payment, or safety issue."
            />
          </label>
          {notice ? <p className="delivery-courier-support-notice">{notice}</p> : null}
          <button type="submit" className="delivery-uber__primary-btn">
            Submit report
          </button>
        </form>
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
