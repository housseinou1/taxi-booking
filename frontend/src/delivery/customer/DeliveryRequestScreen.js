import React, { useEffect, useRef } from "react";

import DeliveryInstructionFields from "../components/DeliveryInstructionFields";
import { getCategoryFormFields } from "../deliveryCategoryFields";
import { DEFAULT_DELIVERY_CITY, MAURITANIA_WILAYAS } from "../deliveryCities";
import { HOME_DELIVERY_CATEGORIES, getCustomerCategory } from "../deliveryCustomerCategories";
import { emptyInstructions, instructionsFromDefaults } from "../deliveryInstructionUtils";
import { getDeliveryInstructionDefaults } from "../../security/securityApi";

const NOUAKCHOTT_AREAS = [
  "Tevragh Zeina",
  "Ksar",
  "Teyarett",
  "Toujounine",
  "Arafat",
  "Dar Naim",
  "El Mina",
  "Sebkha",
  "Riyad",
  "Socogim",
  "Ilot K",
  "Ilot V",
  "TVZ Centre",
  "Palais des Congrès",
  "Carrefour BMD",
  "Ancien Aéroport",
  "Nouakchott Airport",
  "Marché Capitale",
  "Cinquième",
  "Sixième",
  "Plage",
  "ZRA",
  "PK10",
  "PK12",
  "PK17",
  "Bouhdida",
  "Ten Sweilim",
  "Basra",
  "Saudi",
  "Hay Saken",
];

function CategoryField({ field, form, onUpdate }) {
  const value = form[field.key];

  if (field.type === "toggle") {
    return (
      <label>
        <span className="delivery-dash__field-label">{field.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onUpdate(field.key, e.target.checked)}
        />
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        <span className="delivery-dash__field-label">{field.label}</span>
        <select value={value || field.options[0]?.key} onChange={(e) => onUpdate(field.key, e.target.value)}>
          {field.options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label>
        <span className="delivery-dash__field-label">{field.label}</span>
        <textarea
          value={value || ""}
          onChange={(e) => onUpdate(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={field.rows || 3}
          required={field.required}
        />
      </label>
    );
  }

  if (field.type === "file") {
    const fileName = value instanceof File ? value.name : "";
    return (
      <label>
        <span className="delivery-dash__field-label">{field.label}</span>
        <input
          type="file"
          accept={field.accept}
          onChange={(e) => onUpdate(field.key, e.target.files?.[0] || null)}
        />
        {fileName ? <small>{fileName}</small> : null}
      </label>
    );
  }

  return (
    <label>
      <span className="delivery-dash__field-label">{field.label}</span>
      <input
        type={field.type || "text"}
        value={value ?? ""}
        onChange={(e) => onUpdate(field.key, e.target.value)}
        placeholder={field.placeholder}
        min={field.min}
        step={field.step}
        required={field.required}
      />
    </label>
  );
}

export default function DeliveryRequestScreen({
  form,
  category,
  onChange,
  onCategoryChange,
  onContinue,
  onBack,
}) {
  const categoryMeta = getCustomerCategory(category);
  const categoryFields = getCategoryFormFields(category);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    getDeliveryInstructionDefaults()
      .then((defaults) => {
        onChange({
          ...formRef.current,
          dropoff_instructions: instructionsFromDefaults(defaults),
          recipient_alt_phone: defaults?.recipient_alt_phone || formRef.current.recipient_alt_phone || "",
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (field, value) => {
    onChange({ ...form, [field]: value });
  };

  return (
    <div className="delivery-dash__form-screen">
      <div className="delivery-dash__screen-head">
        <button type="button" className="delivery-dash__back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h2>Delivery details</h2>
          <p>{categoryMeta.description}</p>
        </div>
      </div>

      <p className="delivery-dash__section-label">Locations</p>
      <div className="delivery-dash__location-stack">
        <div className="delivery-dash__location-row">
          <div className="delivery-dash__location-rail">
            <span className="delivery-dash__dot delivery-dash__dot--pickup" />
            <span className="delivery-dash__line" />
          </div>
          <div className="delivery-dash__location-field">
            <span>Pickup location</span>
            <select
              value={form.pickup}
              onChange={(e) => update("pickup", e.target.value)}
              required
            >
              <option value="">{`Pickup in ${form.service_city || DEFAULT_DELIVERY_CITY}`}</option>
              {NOUAKCHOTT_AREAS.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="delivery-dash__location-row">
          <div className="delivery-dash__location-rail">
            <span className="delivery-dash__dot delivery-dash__dot--dropoff" />
          </div>
          <div className="delivery-dash__location-field">
            <span>Dropoff location</span>
            <select
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
              required
            >
              <option value="">Where should we deliver?</option>
              {NOUAKCHOTT_AREAS.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="delivery-dash__section-label">Category</p>
      <div className="delivery-dash__card">
        <label>
          <span className="delivery-dash__field-label">Delivery type</span>
          <select
            value={category}
            onChange={(e) => onCategoryChange?.(e.target.value)}
          >
            {HOME_DELIVERY_CATEGORIES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.icon} {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="delivery-dash__field-label">City</span>
          <select value={form.service_city} onChange={(e) => update("service_city", e.target.value)}>
            {MAURITANIA_WILAYAS.map((entry) => (
              <optgroup key={entry.wilaya} label={entry.wilaya}>
                {entry.cities.map((city) => (
                  <option key={city.label} value={city.label}>
                    {city.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>

      <p className="delivery-dash__section-label">Recipient</p>
      <div className="delivery-dash__card delivery-dash__split">
        <label>
          <span className="delivery-dash__field-label">Recipient name</span>
          <input value={form.recipient_name} onChange={(e) => update("recipient_name", e.target.value)} required />
        </label>
        <label>
          <span className="delivery-dash__field-label">Recipient phone</span>
          <input
            value={form.recipient_phone}
            onChange={(e) => update("recipient_phone", e.target.value)}
            placeholder="+222..."
            required
          />
        </label>
      </div>

      {categoryFields.length > 0 ? (
        <>
          <p className="delivery-dash__section-label">Package / item details</p>
          <div className="delivery-dash__card">
            {categoryFields.map((field) => (
              <CategoryField key={field.key} field={field} form={form} onUpdate={update} />
            ))}
          </div>
        </>
      ) : null}

      <p className="delivery-dash__section-label">Dropoff instructions</p>
      <div className="delivery-dash__card delivery-dash__card--flush">
        <DeliveryInstructionFields
          title="Help courier find dropoff"
          subtitle="Building, gate, and landmark details."
          instructions={form.dropoff_instructions || emptyInstructions()}
          onChange={(value) => update("dropoff_instructions", value)}
          recipientAltPhone={form.recipient_alt_phone || ""}
          onRecipientAltPhoneChange={(value) => update("recipient_alt_phone", value)}
          saveAddress={Boolean(form.save_address)}
          onSaveAddressChange={(value) => update("save_address", value)}
          saveInstructions={Boolean(form.save_instructions)}
          onSaveInstructionsChange={(value) => update("save_instructions", value)}
          addressLabel={form.address_label || "Home"}
          onAddressLabelChange={(value) => update("address_label", value)}
          collapsible
          defaultOpen
        />
      </div>

      <p className="delivery-dash__section-label">Pickup instructions (optional)</p>
      <div className="delivery-dash__card delivery-dash__card--flush">
        <DeliveryInstructionFields
          title="Pickup location details"
          subtitle="Use if pickup is hard to find."
          instructions={form.pickup_instructions || emptyInstructions()}
          onChange={(value) => update("pickup_instructions", value)}
          showSaveOptions={false}
          showAltPhone={false}
          collapsible
          defaultOpen={false}
        />
      </div>

      <button type="button" className="delivery-dash__confirm-btn" onClick={onContinue}>
        Confirm
      </button>
    </div>
  );
}
