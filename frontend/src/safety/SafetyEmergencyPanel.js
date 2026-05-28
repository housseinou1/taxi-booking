import React, { useMemo, useState } from "react";

import { MARKET } from "../marketConfig";

const defaultTrustedContacts = [
  { name: "Family contact", phone: "+22222114373" },
  { name: "Sakho support", phone: MARKET.privateCallNumber },
];

const riderTips = [
  "Check the driver photo, vehicle, and plate before entering.",
  "Share your trip status with a trusted contact.",
  "Sit where you feel comfortable and keep your phone charged.",
  "Use SOS or emergency numbers if you feel unsafe.",
];

const driverTips = [
  "Confirm the rider name and pickup before starting.",
  "Keep the route inside the app and avoid unsafe shortcuts.",
  "Stop in a safe public place if the ride feels risky.",
  "Use SOS or support if a rider threatens safety or refuses to follow rules.",
];

function SafetyEmergencyPanel({
  role = "rider",
  currentRide,
  onShareTrip,
  compact = false,
  onClose,
}) {
  const [contacts, setContacts] = useState(() => loadTrustedContacts());
  const [contactForm, setContactForm] = useState({ name: "", phone: "" });
  const [message, setMessage] = useState("");
  const isDriver = role === "driver";
  const tips = isDriver ? driverTips : riderTips;

  const tripStatus = useMemo(() => {
    if (!currentRide) return "No active trip";

    const pickup = currentRide.pickup || currentRide.pickup_address || "Pickup";
    const destination = currentRide.destination || currentRide.destination_address || "Destination";
    return `Trip #${currentRide.id || "active"} · ${pickup} to ${destination} · ${currentRide.status || "active"}`;
  }, [currentRide]);

  const addContact = (event) => {
    event.preventDefault();

    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      setMessage("Add a contact name and phone number.");
      return;
    }

    const nextContacts = [
      { name: contactForm.name.trim(), phone: contactForm.phone.trim() },
      ...contacts,
    ].slice(0, 5);

    setContacts(nextContacts);
    localStorage.setItem("sx_trusted_contacts", JSON.stringify(nextContacts));
    setContactForm({ name: "", phone: "" });
    setMessage("Trusted contact saved.");
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
    setMessage("Unsafe ride report saved. Open Support to add more details.");
  };

  const triggerSos = () => {
    const police = MARKET.emergencyNumbers[0];
    setMessage(`SOS ready. Call ${police.label} at ${police.number}, or choose another emergency contact below.`);
  };

  return (
    <section className={`sx-safety-panel ${compact ? "compact" : ""}`}>
      <SafetyEmergencyStyles />

      <div className="sx-safety-head">
        <div>
          <span>Safety center</span>
          <h2>{isDriver ? "Driver safety & emergency" : "Rider safety & emergency"}</h2>
          <p>Use SOS, share trip status, trusted contacts, and support reports from one place.</p>
        </div>
        {onClose && (
          <button type="button" className="sx-safety-close" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <div className="sx-safety-actions">
        <button type="button" className="sx-sos-button" onClick={triggerSos}>
          SOS
        </button>
        <button type="button" onClick={onShareTrip} disabled={!currentRide}>
          Share trip
        </button>
        <button type="button" onClick={reportUnsafeRide}>
          Report unsafe ride
        </button>
      </div>

      {message && <div className="sx-safety-message">{message}</div>}

      <div className="sx-safety-grid">
        <article className="sx-safety-card">
          <span>Trip status</span>
          <strong>{tripStatus}</strong>
          <p>
            {currentRide
              ? "Send this status to a trusted contact before or during the ride."
              : "Trip sharing becomes active when a ride is in progress."}
          </p>
        </article>

        <article className="sx-safety-card sx-emergency-card">
          <span>Emergency contacts</span>
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
          <span>Trusted contacts</span>
          <div className="sx-trusted-list">
            {contacts.map((contact) => (
              <a key={`${contact.name}-${contact.phone}`} href={`tel:${contact.phone}`}>
                <strong>{contact.name}</strong>
                <small>{contact.phone}</small>
              </a>
            ))}
          </div>
          <form onSubmit={addContact} className="sx-trusted-form">
            <input
              value={contactForm.name}
              onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Name"
            />
            <input
              value={contactForm.phone}
              onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="+222 phone"
            />
            <button type="submit">Add</button>
          </form>
        </article>

        <article className="sx-safety-card">
          <span>Safety tips</span>
          <ul>
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
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
