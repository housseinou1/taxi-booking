import React from "react";

import { DELIVERY_VEHICLE_TYPES } from "../deliveryVehicleTypes";
import "../delivery-courier-onboarding.css";

/** Display order: Bicycle, Motorcycle, Vehicle / Car */
const COURIER_TYPE_ORDER = ["bicycle", "motorcycle", "car"];

export default function DeliveryCourierTypeSelect({
  value,
  onChange,
  disabled = false,
  label = "How will you deliver?",
  placeholder = "Select courier type",
  id = "delivery-courier-type",
}) {
  const options = COURIER_TYPE_ORDER.map((key) =>
    DELIVERY_VEHICLE_TYPES.find((item) => item.key === key)
  ).filter(Boolean);

  return (
    <label className="delivery-courier-select" htmlFor={id}>
      <span className="delivery-courier-select__label">{label}</span>
      <div className="delivery-courier-select__wrap">
        <select
          id={id}
          className="delivery-courier-select__control"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          required
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.icon} {option.label} — {option.maxPackage}
            </option>
          ))}
        </select>
        <span className="delivery-courier-select__chevron" aria-hidden="true">
          ▾
        </span>
      </div>
    </label>
  );
}
