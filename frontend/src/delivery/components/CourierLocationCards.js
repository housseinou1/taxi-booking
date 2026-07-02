import React, { useState } from "react";

import { instructionRows } from "../deliveryInstructionUtils";
import { CourierInstructionPanel } from "./DeliveryInstructionFields";

function ActionButton({ icon, label, onClick, variant = "ghost" }) {
  if (!onClick) return null;
  return (
    <button type="button" className={`cce-address-card__action cce-address-card__action--${variant}`} onClick={onClick}>
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function AddressCard({
  type,
  label,
  address,
  contactName,
  contactPhone,
  altPhone,
  instructions,
  isActive,
  isComplete,
  defaultInstructionsOpen,
  onCall,
  onChat,
  onNavigate,
}) {
  const [expanded, setExpanded] = useState(Boolean(isActive));
  const rows = instructionRows(instructions);
  const phones = [contactPhone, altPhone].filter(Boolean);

  return (
    <article
      className={`cce-address-card cce-address-card--${type} ${isActive ? "is-active" : ""} ${
        isComplete ? "is-complete" : ""
      } ${expanded ? "is-expanded" : ""}`}
    >
      <button type="button" className="cce-address-card__head" onClick={() => setExpanded((v) => !v)}>
        <div className="cce-address-card__icon" aria-hidden>
          {type === "pickup" ? "↑" : "↓"}
        </div>
        <div className="cce-address-card__copy">
          <small>{label}</small>
          <strong>{address || `${label} location`}</strong>
          {contactName ? (
            <p>
              {contactName}
              {contactPhone ? ` · ${contactPhone}` : ""}
            </p>
          ) : null}
        </div>
        <div className="cce-address-card__meta">
          {isComplete ? <span className="cce-address-card__done">✓</span> : null}
          <span className="cce-address-card__chevron" aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {expanded ? (
        <div className="cce-address-card__body">
          {phones.length ? (
            <div className="cce-address-card__phones">
              <span className="cce-address-card__phones-label">Recipient phone</span>
              {phones.map((phone) => (
                <a key={phone} href={`tel:${phone}`} className="cce-address-card__phone">
                  📞 {phone}
                </a>
              ))}
            </div>
          ) : null}

          <CourierInstructionPanel
            title={type === "pickup" ? "Pickup instructions" : "Dropoff instructions"}
            rows={rows}
            defaultOpen={defaultInstructionsOpen || Boolean(isActive)}
          />

          <div className="cce-address-card__actions">
            <ActionButton icon="💬" label="Chat" onClick={onChat} variant="chat" />
            <ActionButton icon="📞" label="Call" onClick={onCall} variant="call" />
            <ActionButton icon="↗" label="Navigate" onClick={onNavigate} variant="navigate" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function CourierLocationCards({
  pickup,
  pickupName,
  pickupPhone,
  pickupAltPhone,
  pickupInstructions,
  pickupLat,
  pickupLng,
  dropoff,
  dropoffName,
  dropoffPhone,
  dropoffAltPhone,
  dropoffInstructions,
  dropoffLat,
  dropoffLng,
  activeLeg = "pickup",
  onCallPickup,
  onCallDropoff,
  onChat,
  onNavigatePickup,
  onNavigateDropoff,
}) {
  return (
    <div className="cce-address-cards">
      <AddressCard
        type="pickup"
        label="Pickup"
        address={pickup}
        contactName={pickupName}
        contactPhone={pickupPhone}
        altPhone={pickupAltPhone}
        instructions={pickupInstructions}
        isActive={activeLeg === "pickup"}
        isComplete={activeLeg !== "pickup"}
        defaultInstructionsOpen={activeLeg === "pickup"}
        onCall={onCallPickup}
        onChat={onChat}
        onNavigate={onNavigatePickup}
      />
      <AddressCard
        type="dropoff"
        label="Dropoff"
        address={dropoff}
        contactName={dropoffName}
        contactPhone={dropoffPhone}
        altPhone={dropoffAltPhone}
        instructions={dropoffInstructions}
        isActive={activeLeg === "dropoff"}
        isComplete={false}
        defaultInstructionsOpen={activeLeg === "dropoff"}
        onCall={onCallDropoff}
        onChat={onChat}
        onNavigate={onNavigateDropoff}
      />
    </div>
  );
}
