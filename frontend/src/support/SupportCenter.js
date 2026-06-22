import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MARKET } from "../marketConfig";

const supportTopics = [
  "contact",
  "ride",
  "payment",
  "lost",
];

const faqs = [
  {
    questionKey: "rideProblemQ",
    answerKey: "rideProblemA",
  },
  {
    questionKey: "paymentProblemQ",
    answerKey: "paymentProblemA",
  },
  {
    questionKey: "lostItemQ",
    answerKey: "lostItemA",
  },
  {
    questionKey: "driverPendingQ",
    answerKey: "driverPendingA",
  },
  {
    questionKey: "emergencyQ",
    answerKey: "emergencyA",
  },
];

function SupportCenter({ variant = "default" }) {
  const { t } = useTranslation();
  const isRider = variant === "rider";
  const [activeTopic, setActiveTopic] = useState(() => getInitialTopic());
  const [submitted, setSubmitted] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    rideId: "",
    paymentMethod: "",
    itemName: "",
    urgency: "normal",
    message: "",
  });

  const topicCopy = useMemo(() => getTopicCopy(activeTopic, t), [activeTopic, t]);

  useEffect(() => {
    const topic = getInitialTopic();
    if (topic !== activeTopic) {
      setActiveTopic(topic);
      setSubmitted("");
    }
  }, [activeTopic]);

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const submitSupport = (event) => {
    event.preventDefault();

    if (!form.phone.trim() && !form.email.trim()) {
      setSubmitted(t("supportCenter.messages.contactRequired"));
      return;
    }

    if (!form.message.trim()) {
      setSubmitted(t("supportCenter.messages.detailsRequired"));
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

    setSubmitted(t("supportCenter.messages.caseCreated", { caseNumber }));
    setForm({
      name: "",
      email: "",
      phone: "",
      rideId: "",
      paymentMethod: "",
      itemName: "",
      urgency: "normal",
      message: "",
    });
  };

  return (
    <main className={`sx-support-page ${isRider ? "sx-support-page--rider" : ""}`}>
      <SupportStyles />

      {isRider ? (
        <section className="sx-support-rider-intro">
          <p>Get help with rides, payments, lost items, and safety.</p>
          <div className="sx-support-rider-quick">
            <button type="button" onClick={() => setActiveTopic("ride")}>
              <span>🚗</span>
              <strong>Ride issue</strong>
            </button>
            <button type="button" onClick={() => setActiveTopic("payment")}>
              <span>💳</span>
              <strong>Payment</strong>
            </button>
            <button type="button" onClick={() => setActiveTopic("lost")}>
              <span>🎒</span>
              <strong>Lost item</strong>
            </button>
            <a href="#emergency" className="sx-support-rider-emergency">
              <span>🆘</span>
              <strong>Emergency</strong>
            </a>
          </div>
        </section>
      ) : (
      <section className="sx-support-hero">
        <div>
          <span>{t("supportCenter.eyebrow")}</span>
          <h1>{t("supportCenter.title")}</h1>
          <p>{t("supportCenter.subtitle")}</p>
          <div className="sx-support-actions">
            <a href="#support-form">{t("supportCenter.openCase")}</a>
            <a href="#emergency" className="danger">{t("supportCenter.emergencySupport")}</a>
          </div>
        </div>

        <aside className="sx-support-status">
          <strong>{t("supportCenter.priorityTitle")}</strong>
          <p>{t("supportCenter.priorityText")}</p>
          <div>
            <span>{t("supportCenter.rideIssues")}</span>
            <span>{t("supportCenter.payments")}</span>
            <span>{t("supportCenter.lostItems")}</span>
          </div>
        </aside>
      </section>
      )}

      <section className="sx-support-grid">
        <article className="sx-support-panel sx-faq-panel">
          <div className="sx-panel-head">
            <span>{t("supportCenter.faq")}</span>
            <h2>{t("supportCenter.quickAnswers")}</h2>
          </div>

          <div className="sx-faq-list">
            {faqs.map((faq) => (
              <details key={faq.questionKey}>
                <summary>{t(`supportCenter.faqs.${faq.questionKey}`)}</summary>
                <p>{t(`supportCenter.faqs.${faq.answerKey}`)}</p>
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
                {t(`supportCenter.topics.${topic}`)}
              </button>
            ))}
          </div>

          <form onSubmit={submitSupport} className="sx-support-form">
            <div className="sx-form-grid">
              <label>
                {t("supportCenter.name")}
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  placeholder={t("supportCenter.namePlaceholder")}
                />
              </label>
              <label>
                {t("supportCenter.phone")}
                <input
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  placeholder={t("supportCenter.phonePlaceholder")}
                />
              </label>
              <label>
                {t("supportCenter.email")}
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateForm("email", event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                {t("supportCenter.urgency")}
                <select
                  value={form.urgency}
                  onChange={(event) => updateForm("urgency", event.target.value)}
                >
                  <option value="normal">{t("supportCenter.urgencyNormal")}</option>
                  <option value="high">{t("supportCenter.urgencyHigh")}</option>
                  <option value="emergency">{t("supportCenter.urgencyEmergency")}</option>
                </select>
              </label>
            </div>

            {(activeTopic === "ride" || activeTopic === "lost") && (
              <label>
                {t("supportCenter.rideNumber")}
                <input
                  value={form.rideId}
                  onChange={(event) => updateForm("rideId", event.target.value)}
                  placeholder={t("supportCenter.rideNumberPlaceholder")}
                />
              </label>
            )}

            {activeTopic === "payment" && (
              <label>
                {t("supportCenter.paymentMethod")}
                <input
                  value={form.paymentMethod}
                  onChange={(event) => updateForm("paymentMethod", event.target.value)}
                  placeholder={t("supportCenter.paymentMethodPlaceholder")}
                />
              </label>
            )}

            {activeTopic === "lost" && (
              <label>
                {t("supportCenter.lostItem")}
                <input
                  value={form.itemName}
                  onChange={(event) => updateForm("itemName", event.target.value)}
                  placeholder={t("supportCenter.lostItemPlaceholder")}
                />
              </label>
            )}

            <label>
              {t("supportCenter.details")}
              <textarea
                value={form.message}
                onChange={(event) => updateForm("message", event.target.value)}
                placeholder={topicCopy.placeholder}
                rows={6}
              />
            </label>

            {submitted && <div className="sx-support-message">{submitted}</div>}

            <button type="submit" className="sx-submit-support">
              {t("supportCenter.submit")}
            </button>
          </form>
        </article>
      </section>

      <section className="sx-emergency-panel" id="emergency">
        <div>
          <span>{t("supportCenter.emergencyEyebrow")}</span>
          <h2>{t("supportCenter.emergencyTitle")}</h2>
          <p>{t("supportCenter.emergencyText")}</p>
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

function getInitialTopic() {
  const topic = new URLSearchParams(window.location.search || "").get("topic");
  return supportTopics.includes(topic) ? topic : supportTopics[0];
}

function getTopicCopy(topic, t) {
  if (topic === "ride") {
    return {
      eyebrow: t("supportCenter.copy.ride.eyebrow"),
      title: t("supportCenter.copy.ride.title"),
      description: t("supportCenter.copy.ride.description"),
      placeholder: t("supportCenter.copy.ride.placeholder"),
    };
  }

  if (topic === "payment") {
    return {
      eyebrow: t("supportCenter.copy.payment.eyebrow"),
      title: t("supportCenter.copy.payment.title"),
      description: t("supportCenter.copy.payment.description"),
      placeholder: t("supportCenter.copy.payment.placeholder"),
    };
  }

  if (topic === "lost") {
    return {
      eyebrow: t("supportCenter.copy.lost.eyebrow"),
      title: t("supportCenter.copy.lost.title"),
      description: t("supportCenter.copy.lost.description"),
      placeholder: t("supportCenter.copy.lost.placeholder"),
    };
  }

  return {
    eyebrow: t("supportCenter.copy.contact.eyebrow"),
    title: t("supportCenter.copy.contact.title"),
    description: t("supportCenter.copy.contact.description"),
    placeholder: t("supportCenter.copy.contact.placeholder"),
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

      .sx-support-page--rider {
        min-height: auto;
        padding: 16px;
        background: #ffffff;
        color: #111827;
      }

      .sx-support-rider-intro {
        max-width: 720px;
        margin: 0 auto 16px;
      }

      .sx-support-rider-intro p {
        margin: 0 0 14px;
        color: #6b7280;
        font-size: 15px;
        line-height: 1.5;
      }

      .sx-support-rider-quick {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .sx-support-rider-quick button,
      .sx-support-rider-emergency {
        min-height: 72px;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        background: #f9fafb;
        color: #111827;
        text-decoration: none;
        padding: 12px;
        display: grid;
        gap: 6px;
        justify-items: start;
        cursor: pointer;
        font: inherit;
      }

      .sx-support-rider-quick strong {
        font-size: 14px;
        font-weight: 700;
      }

      .sx-support-rider-emergency {
        background: #fef2f2;
        border-color: #fecaca;
        color: #991b1b;
      }

      .sx-support-page--rider .sx-support-grid {
        margin-top: 8px;
      }

      .sx-support-page--rider .sx-support-panel,
      .sx-support-page--rider .sx-emergency-panel {
        border: 1px solid #e5e7eb;
        background: #ffffff;
        box-shadow: none;
        color: #111827;
      }

      .sx-support-page--rider .sx-panel-head span,
      .sx-support-page--rider .sx-emergency-panel span {
        color: #00a651;
      }

      .sx-support-page--rider .sx-panel-head p,
      .sx-support-page--rider .sx-emergency-panel p,
      .sx-support-page--rider .sx-faq-list p {
        color: #6b7280;
      }

      .sx-support-page--rider .sx-faq-list details {
        border-color: #e5e7eb;
        background: #f9fafb;
        color: #111827;
      }

      .sx-support-page--rider .sx-support-form label {
        color: #374151;
      }

      .sx-support-page--rider .sx-support-form input,
      .sx-support-page--rider .sx-support-form select,
      .sx-support-page--rider .sx-support-form textarea {
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
      }

      .sx-support-page--rider .sx-topic-tabs button {
        border: 1px solid #d1d5db;
        background: #ffffff;
        color: #111827;
      }

      .sx-support-page--rider .sx-topic-tabs button.active {
        background: #111827;
        color: #ffffff;
        border-color: #111827;
      }

      .sx-support-page--rider .sx-submit-support {
        background: #00a651;
        color: #ffffff;
      }

      .sx-support-page--rider .sx-emergency-grid a {
        border-color: #fecaca;
        background: #fef2f2;
        color: #991b1b;
      }

      .sx-support-page--rider .sx-emergency-grid strong {
        color: #991b1b;
        font-size: 1.4rem;
      }
    `}</style>
  );
}

export default SupportCenter;
