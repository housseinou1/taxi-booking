import React, { useState } from "react";

import {
  emptyInstructions,
  INSTRUCTION_FIELD_DEFS,
  hasInstructionContent,
} from "../deliveryInstructionUtils";

export default function DeliveryInstructionFields({
  title = "Delivery instructions",
  subtitle = "Help your courier find you faster.",
  instructions,
  onChange,
  recipientAltPhone = "",
  onRecipientAltPhoneChange,
  showSaveOptions = true,
  saveAddress = false,
  onSaveAddressChange,
  saveInstructions = false,
  onSaveInstructionsChange,
  addressLabel = "Home",
  onAddressLabelChange,
  collapsible = true,
  defaultOpen = true,
  showAltPhone = true,
  className = "",
}) {
  const [open, setOpen] = useState(defaultOpen);
  const values = instructions || emptyInstructions();

  const updateField = (key, value) => {
    onChange?.({ ...values, [key]: value });
  };

  const body = (
    <div className="delivery-instr__fields">
      {INSTRUCTION_FIELD_DEFS.map((field) => (
        <label key={field.key} className="delivery-instr__field">
          <span className="delivery-instr__label">
            <em aria-hidden>{field.icon}</em>
            {field.label}
          </span>
          {field.multiline ? (
            <textarea
              rows={3}
              value={values[field.key] || ""}
              onChange={(event) => updateField(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          ) : (
            <input
              type="text"
              value={values[field.key] || ""}
              onChange={(event) => updateField(field.key, event.target.value)}
              placeholder={field.placeholder}
            />
          )}
        </label>
      ))}

      {showAltPhone ? (
        <label className="delivery-instr__field">
          <span className="delivery-instr__label">
            <em aria-hidden>📞</em>
            Recipient alternative phone
          </span>
          <input
            type="tel"
            value={recipientAltPhone}
            onChange={(event) => onRecipientAltPhoneChange?.(event.target.value)}
            placeholder="+222 backup number"
          />
        </label>
      ) : null}

      {showSaveOptions ? (
        <div className="delivery-instr__saves">
          <label className="delivery-instr__check">
            <input
              type="checkbox"
              checked={saveAddress}
              onChange={(event) => onSaveAddressChange?.(event.target.checked)}
            />
            <span>Save this address</span>
          </label>
          {saveAddress ? (
            <label className="delivery-instr__field delivery-instr__field--inline">
              <span className="delivery-instr__label">Address label</span>
              <input
                type="text"
                value={addressLabel}
                onChange={(event) => onAddressLabelChange?.(event.target.value)}
                placeholder="Home, Work..."
              />
            </label>
          ) : null}
          <label className="delivery-instr__check">
            <input
              type="checkbox"
              checked={saveInstructions}
              onChange={(event) => onSaveInstructionsChange?.(event.target.checked)}
            />
            <span>Save delivery instructions for next time</span>
          </label>
        </div>
      ) : null}
    </div>
  );

  if (!collapsible) {
    return (
      <section className={`delivery-instr ${className}`}>
        <header className="delivery-instr__head">
          <div>
            <strong>{title}</strong>
            <p>{subtitle}</p>
          </div>
        </header>
        {body}
      </section>
    );
  }

  return (
    <section className={`delivery-instr ${open ? "is-open" : ""} ${className}`}>
      <button
        type="button"
        className="delivery-instr__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <div>
          <strong>{title}</strong>
          <p>
            {hasInstructionContent(values)
              ? `${instructionRowsCount(values)} detail(s) added`
              : subtitle}
          </p>
        </div>
        <span className="delivery-instr__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? body : null}
    </section>
  );
}

function instructionRowsCount(instructions) {
  return INSTRUCTION_FIELD_DEFS.filter((field) => String(instructions?.[field.key] || "").trim()).length;
}

export function CourierInstructionPanel({ title, rows, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!rows?.length) return null;

  return (
    <div className={`cce-address-instr ${open ? "is-open" : ""}`}>
      <button type="button" className="cce-address-instr__toggle" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <em>{open ? "Hide" : "Show"}</em>
      </button>
      {open ? (
        <ul className="cce-address-instr__list">
          {rows.map((row) => (
            <li key={row.key}>
              <span aria-hidden>{row.icon}</span>
              <div>
                <small>{row.label}</small>
                <p>{row.value}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
