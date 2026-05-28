import React, { useState } from "react";
import { API_URL, authFetch } from "../apiConfig";

const DRIVER_TERMS_VERSION = "driver-terms-2026-05";

const driverTerms = [
  "I confirm that my license, vehicle registration, insurance, National ID, and profile information are real and current.",
  "I agree to follow Mauritania traffic laws, drive safely, and never drive under the influence of alcohol, drugs, or unsafe fatigue.",
  "I will keep the vehicle clean, roadworthy, insured, and suitable for carrying riders.",
  "I understand that riders and drivers may rate each other, and poor safety or service reports may lead to review, suspension, or removal.",
  "I agree not to collect unauthorized extra fees outside the fare, tip, or approved payment process shown in the app.",
  "I will respect rider privacy and will not misuse phone numbers, pickup locations, drop-off locations, documents, or trip information.",
  "I understand the admin may verify my documents, approve or reject my driver account, block my account, and review trips for safety or fraud.",
  "I agree to use the emergency and support features responsibly and report serious safety issues immediately.",
];

function DriverSignup() {
  const [formData, setFormData] = useState({
    phone_number: "",
    car_type: "regular",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_color: "",
    plate_number: "",
    license_expires_at: "",
    vehicle_registration_expires_at: "",
    insurance_expires_at: "",
  });

  const [driverPhoto, setDriverPhoto] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [insuranceDocument, setInsuranceDocument] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const submitApplication = async () => {
    try {
      setLoading(true);

      const token = localStorage.getItem("access");

      if (!token) {
        alert("Please login again.");
        return;
      }

      if (!termsAccepted) {
        alert("Please read and accept the driver terms and conditions.");
        return;
      }

      const data = new FormData();

      data.append("phone_number", formData.phone_number);
      data.append("car_type", formData.car_type);
      data.append("vehicle_make", formData.vehicle_make);
      data.append("vehicle_model", formData.vehicle_model);
      data.append("vehicle_color", formData.vehicle_color);
      data.append("plate_number", formData.plate_number);
      data.append("license_expires_at", formData.license_expires_at);
      data.append("vehicle_registration_expires_at", formData.vehicle_registration_expires_at);
      data.append("insurance_expires_at", formData.insurance_expires_at);
      data.append("terms_accepted", "true");
      data.append("terms_version", DRIVER_TERMS_VERSION);

      if (driverPhoto) {
        data.append("driver_photo", driverPhoto);
      }

      if (licenseFile) {
        data.append("license_file", licenseFile);
      }

      if (insuranceDocument) {
        data.append("insurance_document", insuranceDocument);
      }

      const response = await authFetch(`${API_URL}/drivers/register/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: data,
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.detail || result.error || "Driver application failed");
        return;
      }

      alert("Driver application submitted successfully ✅");

      localStorage.removeItem("needs_vehicle_setup");

      window.location.href = "/driver";
    } catch (error) {
      console.error(error);
      alert("Server error. Make sure Django is running.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>🚗 Driver Vehicle Setup</h1>

        <input
          type="text"
          name="phone_number"
          placeholder="Phone Number"
          value={formData.phone_number}
          onChange={handleChange}
          style={inputStyle}
        />

        <select
          name="car_type"
          value={formData.car_type}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="regular">Regular</option>
          <option value="xl">XL</option>
          <option value="comfort">Comfort</option>
          <option value="share">Share</option>
        </select>

        <input
          type="text"
          name="vehicle_make"
          placeholder="Vehicle Make - Example: Toyota"
          value={formData.vehicle_make}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          type="text"
          name="vehicle_model"
          placeholder="Vehicle Model - Example: Corolla"
          value={formData.vehicle_model}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          type="text"
          name="vehicle_color"
          placeholder="Vehicle Color - Example: White"
          value={formData.vehicle_color}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          type="text"
          name="plate_number"
          placeholder="Plate Number - Example: NKC-2026"
          value={formData.plate_number}
          onChange={handleChange}
          style={inputStyle}
        />

        <label style={labelStyle}>👤 Upload Driver Picture</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setDriverPhoto(e.target.files[0])}
          style={fileStyle}
        />

        <label style={labelStyle}>📄 Upload Driver License</label>
        <input
          type="file"
          onChange={(e) => setLicenseFile(e.target.files[0])}
          style={fileStyle}
        />
        <label style={labelStyle}>License expiration date</label>
        <input
          type="date"
          name="license_expires_at"
          value={formData.license_expires_at}
          onChange={handleChange}
          style={inputStyle}
        />

        <label style={labelStyle}>Vehicle registration expiration date</label>
        <input
          type="date"
          name="vehicle_registration_expires_at"
          value={formData.vehicle_registration_expires_at}
          onChange={handleChange}
          style={inputStyle}
        />

        <label style={labelStyle}>🛡️ Upload Insurance</label>
        <input
          type="file"
          onChange={(e) => setInsuranceDocument(e.target.files[0])}
          style={fileStyle}
        />
        <label style={labelStyle}>Insurance expiration date</label>
        <input
          type="date"
          name="insurance_expires_at"
          value={formData.insurance_expires_at}
          onChange={handleChange}
          style={inputStyle}
        />

        <section style={termsBoxStyle}>
          <div style={termsHeaderStyle}>
            <span>Driver Terms and Conditions</span>
            <small>{DRIVER_TERMS_VERSION}</small>
          </div>

          <div style={termsListStyle}>
            {driverTerms.map((term) => (
              <p key={term} style={termItemStyle}>
                {term}
              </p>
            ))}
          </div>

          <label style={termsCheckStyle}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
            />
            <span>
              I have read and agree to the driver terms and conditions.
            </span>
          </label>
        </section>

        <button
          onClick={submitApplication}
          disabled={loading || !termsAccepted}
          style={{
            ...buttonStyle,
            opacity: loading || !termsAccepted ? 0.6 : 1,
            cursor: loading || !termsAccepted ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Submitting..." : "Submit Application"}
        </button>
      </div>
    </div>
  );
}

const pageStyle = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "30px",
  fontFamily: "Arial, sans-serif",
};

const cardStyle = {
  background: "white",
  padding: "30px",
  borderRadius: "22px",
  width: "100%",
  maxWidth: "430px",
  boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
};

const titleStyle = {
  textAlign: "center",
  color: "#111827",
  marginBottom: "22px",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
};

const labelStyle = {
  display: "block",
  marginTop: "12px",
  marginBottom: "8px",
  fontWeight: "bold",
  color: "#111827",
};

const fileStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #d1d5db",
  borderRadius: "12px",
  marginBottom: "12px",
};

const termsBoxStyle = {
  marginTop: "18px",
  border: "1px solid #d7dde7",
  borderRadius: "12px",
  background: "#f8fafc",
  padding: "14px",
};

const termsHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "center",
  color: "#111827",
  fontWeight: 900,
  marginBottom: "10px",
};

const termsListStyle = {
  maxHeight: "220px",
  overflowY: "auto",
  display: "grid",
  gap: "8px",
  paddingRight: "6px",
};

const termItemStyle = {
  margin: 0,
  color: "#334155",
  fontSize: "0.92rem",
  lineHeight: 1.4,
};

const termsCheckStyle = {
  marginTop: "14px",
  display: "grid",
  gridTemplateColumns: "20px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
  color: "#111827",
  fontWeight: 800,
  lineHeight: 1.35,
};

const buttonStyle = {
  width: "100%",
  padding: "14px",
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "16px",
};

export default DriverSignup;
