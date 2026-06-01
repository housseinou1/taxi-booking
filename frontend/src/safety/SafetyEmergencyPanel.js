import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MARKET } from "../marketConfig";

const defaultTrustedContacts = [
  { nameKey: "familyContact", phone: "+22222114373" },
  { nameKey: "sakhoSupport", phone: MARKET.privateCallNumber },
];

const riderTips = [
  "riderCheckDriver",
  "shareStatus",
  "sitComfortable",
  "useSos",
];

const driverTips = [
  "driverConfirm",
  "keepRoute",
  "safeStop",
  "driverUseSos",
];

function SafetyEmergencyPanel({
  role = "rider",
  currentRide,
  onShareTrip,
  compact = false,
  onClose,
}) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState(() => loadTrustedContacts());
  const [contactForm, setContactForm] = useState({ name: "", phone: "" });
  const [message, setMessage] = useState("");
  const isDriver = role === "driver";
  const tips = isDriver ? driverTips : riderTips;

  const tripStatus = useMemo(() => {
    if (!currentRide) return t("safetyPanel.noActiveTrip");

    const pickup = currentRide.pickup || currentRide.pickup_address || t("safetyPanel.pickup");
    const destination = currentRide.destination || currentRide.destination_address || t("safetyPanel.destination");
    return t("safetyPanel.tripStatusLine", {
      id: currentRide.id || t("safetyPanel.active"),
      pickup,
      destination,
      status: currentRide.status || t("safetyPanel.active"),
    });
  }, [currentRide, t]);

  const addContact = (event) => {
    event.preventDefault();

    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      setMessage(t("safetyPanel.messages.addContact"));
      return;
    }

    const nextContacts = [
      { name: contactForm.name.trim(), phone: contactForm.phone.trim() },
      ...contacts,
    ].slice(0, 5);

    setContacts(nextContacts);
    localStorage.setItem("sx_trusted_contacts", JSON.stringify(nextContacts));
    setContactForm({ name: "", phone: "" });
    setMessage(t("safetyPanel.messages.contactSaved"));
  };

  const reportUnsafeRide = () => {
    const report = {
      id: `SAFE-${Date.now().toString().slice(-6)}`,
      role,
      tripStatus,
      createdAt: new Date().toISOString(),
      status: "new",
    };
    const reports = JSON.parse(localStorage.getItem("sx_safety_reports") || "[]");
    localStorage.setItem("sx_safety_reports", JSON.stringify([report, ...reports]));
    setMessage(t("safetyPanel.messages.unsafeSaved"));
  };

  const triggerSos = () => {
    const police = MARKET.emergencyNumbers[0];
    setMessage(t("safetyPanel.messages.sosReady", { label: police.label, number: police.number }));
  };

  return (
    <section className={`sx-safety-panel ${compact ? "compact" : ""}`}>
      <SafetyEmergencyStyles />

      <div className="sx-safety-head">
        <div>
          <span>{t("safetyPanel.eyebrow")}</span>
          <h2>{isDriver ? t("safetyPanel.driverTitle") : t("safetyPanel.riderTitle")}</h2>
          <p>{t("safetyPanel.subtitle")}</p>
        </div>
        {onClose && (
          <button type="button" className="sx-safety-close" onClick={onClose}>
            {t("safetyPanel.close")}
          </button>
        )}
      </div>

      <div className="sx-safety-actions">
        <button type="button" className="sx-sos-button" onClick={triggerSos}>
          SOS
        </button>
        <button type="button" onClick={onShareTrip} disabled={!currentRide}>
          {t("safetyPanel.shareTrip")}
        </button>
        <button type="button" onClick={reportUnsafeRide}>
          {t("safetyPanel.reportUnsafe")}
        </button>
      </div>

      {message && <div className="sx-safety-message">{message}</div>}

      <div className="sx-safety-grid">
        <article className="sx-safety-card">
          <span>{t("safetyPanel.tripStatus")}</span>
          <strong>{tripStatus}</strong>
          <p>
            {currentRide
              ? t("safetyPanel.tripSharingActive")
              : t("safetyPanel.tripSharingInactive")}
          </p>
        </article>

        <article className="sx-safety-card sx-emergency-card">
          <span>{t("safetyPanel.emergencyContacts")}</span>
          <div className="sx-emergency-list">
            {MARKET.emergencyNumbers.map((item) => (
              <a key={item.number} href={`tel:${item.number}`}>
                <strong>{item.label}</strong>
                <b>{item.number}</b>
              </a>
            ))}
          </div>
        </article>

        <article className="sx-safety-card">
          <span>{t("safetyPanel.trustedContacts")}</span>
          <div className="sx-trusted-list">
            {contacts.map((contact) => (
              <a key={`${contact.name}-${contact.phone}`} href={`tel:${contact.phone}`}>
                <strong>{contact.nameKey ? t(`safetyPanel.defaults.${contact.nameKey}`) : contact.name}</strong>
                <small>{contact.phone}</small>
              </a>
            ))}
          </div>
          <form onSubmit={addContact} className="sx-trusted-form">
            <input
              value={contactForm.name}
              onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("safetyPanel.namePlaceholder")}
            />
            <input
              value={contactForm.phone}
              onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder={t("safetyPanel.phonePlaceholder")}
            />
            <button type="submit">{t("safetyPanel.add")}</button>
          </form>
        </article>

        <article className="sx-safety-card">
          <span>{t("safetyPanel.safetyTips")}</span>
          <ul>
            {tips.map((tip) => (
              <li key={tip}>{t(`safetyPanel.tips.${tip}`)}</li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}

function loadTrustedContacts() {
  try {
    const saved = JSON.parse(localStorage.getItem("sx_trusted_contacts") || "[]");
    return saved.length ? saved : defaultTrustedContacts;
  } catch (error) {
    return defaultTrustedContacts;
  }
}

function SafetyEmergencyStyles() {
  return (
    <style>{`
      .sx-safety-panel {
        width: 100%;
        border: 1px solid rgba(248, 113, 113, 0.24);
        border-radius: 18px;
        background:
          radial-gradient(circle at 10% 0%, rgba(220, 38, 38, 0.22), transparent 34%),
          linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(5, 7, 13, 0.96));
        color: #f8fafc;
        padding: 18px;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
      }

      .sx-safety-panel * {
        box-sizing: border-box;
      }

      .sx-safety-head {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 14px;
      }

      .sx-safety-head span,
      .sx-safety-card span {
        color: #fca5a5;
        font-size: 0.74rem;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .sx-safety-head h2 {
        margin: 6px 0 6px;
        font-size: clamp(1.4rem, 4vw, 2rem);
        letter-spacing: 0;
      }

      .sx-safety-head p,
      .sx-safety-card p,
      .sx-safety-card li {
        color: #cbd5e1;
        line-height: 1.5;
        font-weight: 750;
      }

      .sx-safety-close,
      .sx-safety-actions button,
      .sx-trusted-form button {
        border: none;
        border-radius: 999px;
        padding: 10px 13px;
        font-weight: 950;
        cursor: pointer;
      }

      .sx-safety-close,
      .sx-safety-actions button {
        background: rgba(255,255,255,0.1);
        color: #f8fafc;
        border: 1px solid rgba(255,255,255,0.12);
      }

      .sx-safety-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }

      .sx-safety-actions .sx-sos-button {
        background: #dc2626;
        color: white;
        min-width: 92px;
        box-shadow: 0 16px 30px rgba(220, 38, 38, 0.34);
      }

      .sx-safety-actions button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .sx-safety-message {
        border: 1px solid rgba(250, 204, 21, 0.28);
        border-radius: 12px;
        background: rgba(250, 204, 21, 0.12);
        color: #fde68a;
        padding: 11px 12px;
        font-weight: 900;
        margin-bottom: 12px;
      }

      .sx-safety-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .sx-safety-card {
        min-width: 0;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px;
        background: rgba(255,255,255,0.07);
        padding: 14px;
      }

      .sx-safety-card strong {
        display: block;
        margin-top: 7px;
        overflow-wrap: anywhere;
      }

      .sx-emergency-list,
      .sx-trusted-list {
        display: grid;
        gap: 8px;
        margin-top: 10px;
      }

      .sx-emergency-list a,
      .sx-trusted-list a {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border-radius: 12px;
        background: rgba(220, 38, 38, 0.14);
        color: #fee2e2;
        text-decoration: none;
        padding: 11px;
      }

      .sx-trusted-list a {
        background: rgba(34, 197, 94, 0.12);
        color: #bbf7d0;
      }

      .sx-trusted-list small {
        color: #d1fae5;
        font-weight: 850;
      }

      .sx-trusted-form {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 8px;
        margin-top: 10px;
      }

      .sx-trusted-form input {
        width: 100%;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 10px;
        background: rgba(5, 7, 13, 0.5);
        color: #f8fafc;
        padding: 10px;
        outline: none;
      }

      .sx-trusted-form button {
        background: #facc15;
        color: #111827;
      }

      .sx-safety-card ul {
        margin: 10px 0 0;
        padding-inline-start: 20px;
      }

      @media (max-width: 760px) {
        .sx-safety-panel {
          padding: 14px;
          border-radius: 16px;
        }

        .sx-safety-head,
        .sx-safety-grid,
        .sx-trusted-form {
          grid-template-columns: 1fr;
        }

        .sx-safety-head {
          display: grid;
        }

        .sx-safety-grid {
          display: grid;
        }
      }
    `}</style>
  );
}

export default SafetyEmergencyPanel;
