import React from "react";

import { DELIVERY_VEHICLE_TYPES } from "../deliveryVehicleTypes";

/** Display order: Bicycle, Motorcycle, Vehicle / Car */
const COURIER_TYPE_ORDER = ["bicycle", "motorcycle", "car"];

const OPTIONS = COURIER_TYPE_ORDER.map((key) =>
  DELIVERY_VEHICLE_TYPES.find((item) => item.key === key)
).filter(Boolean);

export default function DeliveryCourierTypePicker({
  value,
  onChange,
  disabled = false,
  compact = false,
}) {
  return (
    <label className={`courier-type-select ${compact ? "courier-type-select--compact" : ""}`}>
      {!compact ? (
        <span className="courier-type-select__label">How will you deliver?</span>
      ) : null}
      <div className="courier-type-select__wrap">
        <select
          className="courier-type-select__input"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-label="Courier type"
        >
          <option value="" disabled>
            Select courier type
          </option>
          {OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.icon} {option.label} — {option.maxPackage}
            </option>
          ))}
        </select>
        <span className="courier-type-select__arrow" aria-hidden>▾</span>
      </div>
      {value && !compact ? (
        <span className="courier-type-select__hint">
          {OPTIONS.find((o) => o.key === value)?.description || ""}
        </span>
      ) : null}
      <CourierTypePickerStyles />
    </label>
  );
}

function CourierTypePickerStyles() {
  return (
    <style>{`
      .courier-type-select {
        display: grid;
        gap: 8px;
      }

      .courier-type-select--compact {
        gap: 0;
      }

      .courier-type-select__label {
        font-size: 14px;
        font-weight: 700;
        color: #374151;
      }

      .courier-type-select__wrap {
        position: relative;
      }

      .courier-type-select__input {
        width: 100%;
        min-height: 56px;
        padding: 0 44px 0 16px;
        border: 2px solid #e5e7eb;
        border-radius: 16px;
        background: #fff;
        color: #111827;
        font-size: 16px;
        font-weight: 600;
        font-family: inherit;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .courier-type-select__input:focus {
        border-color: #FF6B00;
        box-shadow: 0 0 0 4px rgba(255, 107, 0, 0.12);
      }

      .courier-type-select__input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .courier-type-select__arrow {
        position: absolute;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 18px;
        color: #9ca3af;
        pointer-events: none;
      }

      .courier-type-select__hint {
        font-size: 13px;
        color: #6b7280;
        padding-left: 2px;
      }

      /* Compact mode for dashboard */
      .courier-type-select--compact .courier-type-select__input {
        min-height: 44px;
        border-radius: 12px;
        font-size: 14px;
      }

      /* Dark theme (delivery-uber context) */
      .delivery-uber .courier-type-select__input,
      .delivery-uber-page .courier-type-select__input {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.15);
        color: #fff;
      }

      .delivery-uber .courier-type-select__input:focus,
      .delivery-uber-page .courier-type-select__input:focus {
        border-color: #FF6B00;
        box-shadow: 0 0 0 4px rgba(255, 107, 0, 0.15);
      }

      .delivery-uber .courier-type-select__label,
      .delivery-uber-page .courier-type-select__label {
        color: rgba(255, 255, 255, 0.8);
      }

      .delivery-uber .courier-type-select__hint,
      .delivery-uber-page .courier-type-select__hint {
        color: rgba(255, 255, 255, 0.5);
      }

      .delivery-uber .courier-type-select__input option,
      .delivery-uber-page .courier-type-select__input option {
        background: #1a1d24;
        color: #fff;
      }
    `}</style>
  );
}
