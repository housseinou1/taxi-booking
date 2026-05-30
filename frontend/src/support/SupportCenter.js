import React, { useMemo, useState } from "react";

import { MARKET } from "../marketConfig";

const supportTopics = [
  "Contact support",
  "Report a ride issue",
  "Report payment issue",
  "Lost item report",
];

const faqs = [
  {
    question: "How do I report a problem with a ride?",
    answer:
      "Choose Report a ride issue, add the ride number, pickup, drop-off, driver or rider name, and explain what happened. Safety reports should be sent as soon as possible.",
  },
  {
    question: "What should I do for a payment problem?",
    answer:
      "Use Report payment issue and include the payment method, fare amount, transaction status, and ride number. Admin can compare ride status, payment record, and provider confirmation.",
  },
  {
    question: "How do I recover a lost item?",
    answer:
      "Submit a Lost item report with the item description, ride details, and best contact number. Support can help contact the driver using platform records.",
  },
  {
    question: "Why is my driver account pending or rejected?",
    answer:
      "Driver accounts stay pending until admin approves license, insurance, vehicle registration, profile photo, and identity details. Expired or missing documents can be rejected.",
  },
  {
    question: "Can I call emergency services from the app?",
    answer:
      "Yes. Emergency numbers are available below. For immediate danger, call the correct emergency number first, then report the trip to Yala support.",
  },
];

function SupportCenter() {
  const [activeTopic, setActiveTopic] = useState(supportTopics[0]);
  const [submitted, setSubmitted] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    rideId: "",
    paymentMethod: "",
    itemName: "",
    urgency: "Normal",
    message: "",
  });

  const topicCopy = useMemo(() => getTopicCopy(activeTopic), [activeTopic]);

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submitSupport = (event) => {
    event.preventDefault();

    if (!form.phone.trim() && !form.email.trim()) {
      setSubmitted("Please add a phone number or email so support can contact you.");
      return;
    }

    if (!form.message.trim()) {
      setSubmitted("Please describe the issue before submitting.");
      return;
    }

    const caseNumber = `SX-${Date.now().toString().slice(-6)}`;
    const savedReports = JSON.parse(localStorage.getItem("sx_support_reports") || "[]");
    localStorage.setItem(
      "sx_support_reports",
      JSON.stringify([
        {
          id: caseNumber,
          topic: activeTopic,
          ...form,
          createdAt: new Date().toISOString(),
        },
        ...savedReports,
      ])
    );

    setSubmitted(`Support case ${caseNumber} created. Yala support can review it from this device.`);
    setForm({
      name: "",
      email: "",
      phone: "",
      rideId: "",
      paymentMethod: "",
      itemName: "",
      urgency: "Normal",
      message: "",
    });
  };

  return (
    <main className="sx-support-page">
      <SupportStyles />

      <section className="sx-support-hero">
        <div>
          <span>Yala Help Center</span>
          <h1>Support for riders, drivers, payments, and safety.</h1>
          <p>
            Get help with rides, lost items, payment issues, account access, driver
            documents, and emergency situations from one professional support screen.
          </p>
          <div className="sx-support-actions">
            <a href="#support-form">Open a case</a>
            <a href="#emergency" className="danger">Emergency support</a>
          </div>
        </div>

        <aside className="sx-support-status">
          <strong>Priority routing</strong>
          <p>Safety and emergency cases should be handled first. Payment and lost item reports follow with ride details.</p>
          <div>
            <span>Ride issues</span>
            <span>Payments</span>
            <span>Lost items</span>
          </div>
        </aside>
      </section>

      <section className="sx-support-grid">
        <article className="sx-support-panel sx-faq-panel">
          <div className="sx-panel-head">
            <span>FAQ</span>
            <h2>Quick answers</h2>
          </div>

          <div className="sx-faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </article>

        <article className="sx-support-panel" id="support-form">
          <div className="sx-panel-head">
            <span>{topicCopy.eyebrow}</span>
            <h2>{topicCopy.title}</h2>
            <p>{topicCopy.description}</p>
          </div>

          <div className="sx-topic-tabs">
            {supportTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                className={activeTopic === topic ? "active" : ""}
                onClick={() => {
                  setActiveTopic(topic);
                  setSubmitted("");
                }}
              >
                {topic}
              </button>
            ))}
          </div>

          <form onSubmit={submitSupport} className="sx-support-form">
            <div className="sx-form-grid">
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                Phone
                <input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder="+222 phone number"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                Urgency
                <select
                  value={form.urgency}
                  onChange={(event) => updateForm("urgency", event.target.value)}
                >
                  <option>Normal</option>
                  <option>High</option>
                  <option>Emergency follow-up</option>
                </select>
              </label>
            </div>

            {(activeTopic.includes("ride") || activeTopic.includes("Lost")) && (
              <label>
                Ride number
                <input
                  value={form.rideId}
                  onChange={(event) => updateForm("rideId", event.target.value)}
                  placeholder="Example: Ride #104"
                />
              </label>
            )}

            {activeTopic.includes("payment") && (
              <label>
                Payment method
                <input
                  value={form.paymentMethod}
                  onChange={(event) => updateForm("paymentMethod", event.target.value)}
                  placeholder="Cash, card, Bankily, Masravi, Seddad"
                />
              </label>
            )}

            {activeTopic.includes("Lost") && (
              <label>
                Lost item
                <input
                  value={form.itemName}
                  onChange={(event) => updateForm("itemName", event.target.value)}
                  placeholder="Phone, wallet, bag, document..."
                />
              </label>
            )}

            <label>
              Details
              <textarea
                value={form.message}
                onChange={(event) => updateForm("message", event.target.value)}
                placeholder={topicCopy.placeholder}
                rows={6}
              />
            </label>

            {submitted && <div className="sx-support-message">{submitted}</div>}

            <button type="submit" className="sx-submit-support">
              Submit support request
            </button>
          </form>
        </article>
      </section>

      <section className="sx-emergency-panel" id="emergency">
        <div>
          <span>Emergency support</span>
          <h2>Call local emergency services first.</h2>
          <p>
            If anyone is in immediate danger, call police, ambulance, or fire support.
            After the situation is safe, report the trip details to Yala.
          </p>
        </div>

        <div className="sx-emergency-grid">
          {MARKET.emergencyNumbers.map((contact) => (
            <a key={contact.number} href={`tel:${contact.number}`}>
              <span>{contact.label}</span>
              <strong>{contact.number}</strong>
              <small>{contact.description}</small>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

function getTopicCopy(topic) {
  if (topic === "Report a ride issue") {
    return {
      eyebrow: "Ride issue",
      title: "Report a ride problem",
      description: "Wrong pickup, unsafe behavior, cancellation, route, rating, or trip dispute.",
      placeholder: "Tell us the ride number, pickup, destination, driver or rider name, and what happened.",
    };
  }

  if (topic === "Report payment issue") {
    return {
      eyebrow: "Payment issue",
      title: "Report a payment problem",
      description: "Cash, card, Bankily, Masravi, Seddad, receipt, tip, or payout issue.",
      placeholder: "Tell us the amount, payment method, ride number, and what payment status you see.",
    };
  }

  if (topic === "Lost item report") {
    return {
      eyebrow: "Lost item",
      title: "Recover an item from a trip",
      description: "Report phones, wallets, bags, documents, keys, or anything left in a vehicle.",
      placeholder: "Describe the item, last place seen, ride details, and best way to contact you.",
    };
  }

  return {
    eyebrow: "Contact support",
    title: "Contact Yala support",
    description: "For account access, blocked accounts, driver approval, documents, or general help.",
    placeholder: "Tell us what you need help with and include any account or ride details.",
  };
}

function SupportStyles() {
  return (
    <style>{`
      .sx-support-page {
        min-height: 100vh;
        padding: 22px;
        background:
          radial-gradient(circle at 12% 8%, rgba(250, 204, 21, 0.16), transparent 30%),
          radial-gradient(circle at 86% 18%, rgba(220, 38, 38, 0.16), transparent 28%),
          linear-gradient(135deg, #05070d 0%, #111827 54%, #05070d 100%);
        color: #f8fafc;
        font-family: Inter, Arial, sans-serif;
      }

      .sx-support-page * {
        box-sizing: border-box;
      }

      .sx-support-hero,
      .sx-support-grid,
      .sx-emergency-panel {
        width: min(1180px, 100%);
        margin: 0 auto;
      }

      .sx-support-hero {
        min-height: 360px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
        gap: 18px;
        align-items: stretch;
      }

      .sx-support-hero > div,
      .sx-support-status,
      .sx-support-panel,
      .sx-emergency-panel {
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 18px;
        background: rgba(255,255,255,0.07);
        box-shadow: 0 24px 70px rgba(0,0,0,0.28);
      }

      .sx-support-hero > div {
        padding: clamp(24px, 5vw, 52px);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .sx-support-hero span,
      .sx-panel-head span,
      .sx-emergency-panel span {
        color: #facc15;
        font-size: 0.76rem;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .sx-support-hero h1 {
        margin: 10px 0 14px;
        font-size: clamp(2.4rem, 6vw, 5rem);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .sx-support-hero p,
      .sx-panel-head p,
      .sx-emergency-panel p,
      .sx-support-status p {
        color: #cbd5e1;
        line-height: 1.6;
        font-weight: 750;
      }

      .sx-support-actions,
      .sx-topic-tabs,
      .sx-emergency-grid,
      .sx-support-status div {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .sx-support-actions a,
      .sx-submit-support,
      .sx-topic-tabs button {
        border: none;
        border-radius: 999px;
        padding: 12px 16px;
        font-weight: 950;
        cursor: pointer;
        text-decoration: none;
      }

      .sx-support-actions a,
      .sx-submit-support,
      .sx-topic-tabs button.active {
        background: #facc15;
        color: #111827;
      }

      .sx-support-actions a.danger {
        background: #dc2626;
        color: white;
      }

      .sx-topic-tabs button {
        background: rgba(255,255,255,0.08);
        color: #f8fafc;
        border: 1px solid rgba(255,255,255,0.1);
      }

      .sx-support-status {
        padding: 22px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }

      .sx-support-status strong {
        font-size: 1.4rem;
      }

      .sx-support-status div span {
        background: rgba(34,197,94,0.14);
        color: #86efac;
        border: 1px solid rgba(34,197,94,0.24);
        border-radius: 999px;
        padding: 8px 10px;
        font-size: 0.78rem;
        font-weight: 900;
      }

      .sx-support-grid {
        margin-top: 18px;
        display: grid;
        grid-template-columns: minmax(280px, 430px) minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }

      .sx-support-panel,
      .sx-emergency-panel {
        padding: 20px;
      }

      .sx-panel-head h2,
      .sx-emergency-panel h2 {
        margin: 7px 0 8px;
        font-size: 1.8rem;
        letter-spacing: 0;
      }

      .sx-faq-list {
        display: grid;
        gap: 10px;
      }

      .sx-faq-list details {
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        background: rgba(5, 7, 13, 0.45);
        padding: 14px;
      }

      .sx-faq-list summary {
        cursor: pointer;
        font-weight: 950;
      }

      .sx-faq-list p {
        margin: 10px 0 0;
        color: #cbd5e1;
        line-height: 1.55;
      }

      .sx-support-form {
        display: grid;
        gap: 12px;
      }

      .sx-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .sx-support-form label {
        display: grid;
        gap: 7px;
        color: #e5e7eb;
        font-weight: 900;
      }

      .sx-support-form input,
      .sx-support-form select,
      .sx-support-form textarea {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        background: rgba(5, 7, 13, 0.5);
        color: #f8fafc;
        padding: 13px;
        font: inherit;
        outline: none;
      }

      .sx-support-form textarea {
        resize: vertical;
      }

      .sx-support-message {
        border: 1px solid rgba(34,197,94,0.3);
        border-radius: 12px;
        background: rgba(34,197,94,0.12);
        color: #bbf7d0;
        padding: 12px;
        font-weight: 900;
      }

      .sx-emergency-panel {
        margin-top: 18px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(280px, 520px);
        gap: 18px;
        align-items: center;
      }

      .sx-emergency-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .sx-emergency-grid a {
        min-height: 120px;
        border: 1px solid rgba(248,113,113,0.26);
        border-radius: 16px;
        background: rgba(220,38,38,0.13);
        color: #fee2e2;
        text-decoration: none;
        padding: 16px;
        display: grid;
        align-content: center;
        gap: 5px;
      }

      .sx-emergency-grid strong {
        font-size: 2rem;
        color: white;
      }

      .sx-emergency-grid small {
        color: #fecaca;
        font-weight: 800;
      }

      @media (max-width: 900px) {
        .sx-support-page {
          padding: 14px;
        }

        .sx-support-hero,
        .sx-support-grid,
        .sx-emergency-panel {
          grid-template-columns: 1fr;
        }

        .sx-emergency-grid,
        .sx-form-grid {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}

export default SupportCenter;
