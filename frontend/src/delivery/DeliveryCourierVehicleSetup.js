import React, { useState } from "react";

import { API_URL } from "../apiConfig";
import { isDeliveryUberUI } from "../native/platform";
import DeliveryCourierTypeSelect from "./components/DeliveryCourierTypeSelect";
import { isBicycleCourier, isMotorVehicleCourier } from "./deliveryDocumentReview";
import { DeliveryHeader } from "./DeliveryShared";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import "./Delivery.css";
import "./delivery-uber.css";
import "./delivery-customer-dashboard.css";
import "./delivery-courier-onboarding.css";

import { LEGAL_VERSION } from "../legal/legalVersions";

const courierTerms = [
  "I confirm that my identity, contact details, and delivery vehicle information are accurate.",
  "I agree to follow Mauritania traffic laws and deliver packages safely and on time.",
  "I will treat customer orders, addresses, and payments with care and confidentiality.",
  "I understand Yala may verify my documents and approve or suspend my courier account.",
  "I agree to use in-app support and emergency tools responsibly.",
];

function getVehicleLabels(deliveryVehicleType) {
  if (deliveryVehicleType === "motorcycle") {
    return {
      section: "Motorcycle details",
      make: "Motorcycle make",
      model: "Motorcycle model",
      color: "Motorcycle color",
    };
  }
  return {
    section: "Vehicle details",
    make: "Vehicle make",
    model: "Vehicle model",
    color: "Vehicle color",
  };
}

export default function DeliveryCourierVehicleSetup() {
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("");
  const [formData, setFormData] = useState({
    phone_number: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_color: "",
    plate_number: "",
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const uberUI = isDeliveryUberUI();
  const requiresVehicleFields = isMotorVehicleCourier(deliveryVehicleType);
  const vehicleLabels = getVehicleLabels(deliveryVehicleType);

  const handleChange = (event) => {
    setFormData((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  };

  const submitSetup = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!deliveryVehicleType) {
      setError("Select bicycle, motorcycle, or vehicle/car to continue.");
      return;
    }

    if (!termsAccepted) {
      setError("Please accept the courier terms and conditions.");
      return;
    }

    if (!formData.phone_number.trim()) {
      setError("Phone number is required.");
      return;
    }

    if (requiresVehicleFields) {
      if (!formData.vehicle_make.trim() || !formData.vehicle_model.trim()) {
        setError("Please enter the make and model.");
        return;
      }
      if (!formData.vehicle_color.trim()) {
        setError("Color is required.");
        return;
      }
      if (!formData.plate_number.trim()) {
        setError("Please enter your plate number.");
        return;
      }
    }

    try {
      setLoading(true);
      const body = new FormData();
      body.append("terms_accepted", "true");
      body.append("terms_version", LEGAL_VERSION.courier);
      body.append("delivery_vehicle_type", deliveryVehicleType);
      body.append("phone_number", formData.phone_number.trim());

      if (requiresVehicleFields) {
        body.append("vehicle_make", formData.vehicle_make.trim());
        body.append("vehicle_model", formData.vehicle_model.trim());
        body.append("vehicle_color", formData.vehicle_color.trim());
        body.append("plate_number", formData.plate_number.trim());
      }

      const response = await fetch(`${API_URL}/deliveries/courier/vehicle-setup/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || data.error || "Could not save vehicle information.");
      }

      setNotice("Saved. Continue with documents.");
      window.setTimeout(() => {
        window.location.href = "/delivery/courier";
      }, 800);
    } catch (err) {
      setError(err.message || "Could not save vehicle information.");
    } finally {
      setLoading(false);
    }
  };

  const form = (
    <form className={uberUI ? undefined : "delivery-vehicle-setup-form"} onSubmit={submitSetup}>
      <DeliveryCourierTypeSelect
        value={deliveryVehicleType}
        onChange={setDeliveryVehicleType}
        disabled={loading}
      />

      <div className={`delivery-courier-fields ${deliveryVehicleType ? "is-visible" : ""}`}>
        <div className="delivery-courier-fields__section">
          <p className="delivery-courier-fields__heading">Contact</p>
          <label className={uberUI ? "delivery-uber-field" : "delivery-field"}>
            Phone number
            <input
              type="tel"
              name="phone_number"
              placeholder="+222XXXXXXXX"
              value={formData.phone_number}
              onChange={handleChange}
              required
            />
          </label>
        </div>

        {requiresVehicleFields ? (
          <div className="delivery-courier-fields__section">
            <p className="delivery-courier-fields__heading">{vehicleLabels.section}</p>
            <label className={uberUI ? "delivery-uber-field" : "delivery-field"}>
              {vehicleLabels.make}
              <input
                type="text"
                name="vehicle_make"
                placeholder={deliveryVehicleType === "motorcycle" ? "Example: Honda" : "Example: Toyota"}
                value={formData.vehicle_make}
                onChange={handleChange}
                required
              />
            </label>
            <label className={uberUI ? "delivery-uber-field" : "delivery-field"}>
              {vehicleLabels.model}
              <input
                type="text"
                name="vehicle_model"
                placeholder={deliveryVehicleType === "motorcycle" ? "Example: Wave" : "Example: Corolla"}
                value={formData.vehicle_model}
                onChange={handleChange}
                required
              />
            </label>
            <label className={uberUI ? "delivery-uber-field" : "delivery-field"}>
              {vehicleLabels.color}
              <input
                type="text"
                name="vehicle_color"
                placeholder="Example: White"
                value={formData.vehicle_color}
                onChange={handleChange}
                required
              />
            </label>
            <label className={uberUI ? "delivery-uber-field" : "delivery-field"}>
              Plate number
              <input
                type="text"
                name="plate_number"
                placeholder="Example: NKC-2026"
                value={formData.plate_number}
                onChange={handleChange}
                required
              />
            </label>
          </div>
        ) : null}

        {isBicycleCourier(deliveryVehicleType) ? (
          <div className="delivery-courier-fields__section">
            <p className="delivery-courier-fields__heading">Bicycle courier</p>
            <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
              No vehicle details needed. Complete your profile and upload your National ID in profile setup.
            </p>
          </div>
        ) : null}
      </div>

      <section className={uberUI ? "delivery-uber-card" : "delivery-terms-box"} style={{ marginTop: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Courier terms</h2>
        <ul style={{ margin: "0 0 12px", paddingLeft: 18, color: "#6b7280", fontSize: 14 }}>
          {courierTerms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
          />
          I accept the courier terms and conditions
        </label>
      </section>

      {error ? <div className={uberUI ? "delivery-uber__toast is-error" : "delivery-error-banner"}>{error}</div> : null}
      {notice ? <div className={uberUI ? "delivery-uber-card" : "delivery-notice-banner"}>{notice}</div> : null}

      <button
        type="submit"
        className={uberUI ? "delivery-uber__cta" : "delivery-button"}
        disabled={loading || !deliveryVehicleType}
      >
        {loading ? "Saving..." : "Save and continue"}
      </button>
    </form>
  );

  if (uberUI) {
    return (
      <DeliveryUberPage
        title="Vehicle setup"
        onBack={() => {
          window.location.href = "/delivery/courier";
        }}
      >
        <div className="delivery-uber-card">
          <h2>How will you deliver?</h2>
          <p>Select bicycle, motorcycle, or vehicle/car. We only ask for details that match your courier type.</p>
        </div>
        {form}
      </DeliveryUberPage>
    );
  }

  return (
    <div className="delivery-page delivery-vehicle-setup">
      <DeliveryHeader subtitle="Vehicle setup" backPath="/delivery/courier" />
      <section className="delivery-onboarding-hero">
        <span className="delivery-onboarding-eyebrow">Courier vehicle</span>
        <h1>How will you deliver?</h1>
        <p>Select bicycle, motorcycle, or vehicle/car. We only ask for details that match your courier type.</p>
      </section>
      {form}
    </div>
  );
}
