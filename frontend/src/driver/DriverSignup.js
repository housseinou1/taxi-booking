import React, { useState } from "react";
import { API_URL } from "../apiConfig";

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
  const [vehicleRegistrationFile, setVehicleRegistrationFile] = useState(null);
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

      const missingDocuments = [
        !driverPhoto && "profile photo",
        !licenseFile && "driver license",
        !vehicleRegistrationFile && "vehicle registration",
        !insuranceDocument && "insurance document",
        !formData.license_expires_at && "license expiration date",
        !formData.vehicle_registration_expires_at && "registration expiration date",
        !formData.insurance_expires_at && "insurance expiration date",
      ].filter(Boolean);

      if (missingDocuments.length) {
        alert(`Please add: ${missingDocuments.join(", ")}.`);
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

      if (vehicleRegistrationFile) {
        data.append("vehicle_registration", vehicleRegistrationFile);
      }

      if (insuranceDocument) {
        data.append("insurance_document", insuranceDocument);
      }

      const response = await fetch(`${API_URL}/drivers/register/`, {
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

      alert("Driver application submitted successfully. Admin approval is now pending.");

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
        <div style={heroStyle}>
          <span style={eyebrowStyle}>Sakho Express driver verification</span>
          <h1 style={titleStyle}>Submit your driver application</h1>
          <p style={subtitleStyle}>
            Upload the required documents. Admin approval is required before you can go online.
          </p>
        </div>

        <div style={statusStripStyle}>
          <span style={statusDotStyle} />
          <div>
            <strong>Pending after submission</strong>
            <small>License, insurance, registration, and profile photo will be reviewed.</small>
          </div>
        </div>

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

        <label style={labelStyle}>Upload driver profile photo</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setDriverPhoto(e.target.files[0])}
          style={fileStyle}
        />

        <label style={labelStyle}>Upload driver license</label>
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

        <label style={labelStyle}>Upload vehicle registration</label>
        <input
          type="file"
          onChange={(e) => setVehicleRegistrationFile(e.target.files[0])}
          style={fileStyle}
        />
        <label style={labelStyle}>Vehicle registration expiration date</label>
        <input
          type="date"
          name="vehicle_registration_expires_at"
          value={formData.vehicle_registration_expires_at}
          onChange={handleChange}
          style={inputStyle}
        />

        <label style={labelStyle}>Upload insurance document</label>
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
  alignItems: "flex-start",
  minHeight: "100vh",
  padding: "36px 18px",
  fontFamily: "Inter, Arial, sans-serif",
  background:
    "radial-gradient(circle at top left, rgba(155,0,137,0.24), transparent 34%), linear-gradient(135deg, #05070d 0%, #111827 48%, #05070d 100%)",
};

const cardStyle = {
  background: "rgba(11, 18, 32, 0.94)",
  color: "white",
  padding: "28px",
  borderRadius: "18px",
  width: "100%",
  maxWidth: "760px",
  boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
  border: "1px solid rgba(255,255,255,0.1)",
};

const heroStyle = {
  marginBottom: "18px",
};

const eyebrowStyle = {
  color: "#facc15",
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: "0.78rem",
};

const titleStyle = {
  color: "white",
  margin: "8px 0 10px",
  fontSize: "2rem",
  lineHeight: 1.08,
};

const subtitleStyle = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.5,
  fontWeight: 700,
};

const statusStripStyle = {
  display: "grid",
  gridTemplateColumns: "12px minmax(0, 1fr)",
  gap: "12px",
  alignItems: "center",
  background: "rgba(250, 204, 21, 0.12)",
  border: "1px solid rgba(250, 204, 21, 0.25)",
  borderRadius: "14px",
  padding: "14px",
  marginBottom: "22px",
};

const statusDotStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  background: "#facc15",
  boxShadow: "0 0 0 6px rgba(250, 204, 21, 0.12)",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "10px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  outline: "none",
  boxSizing: "border-box",
  fontWeight: 800,
};

const labelStyle = {
  display: "block",
  marginTop: "12px",
  marginBottom: "8px",
  fontWeight: 900,
  color: "#e5e7eb",
};

const fileStyle = {
  width: "100%",
  padding: "12px",
  border: "1px dashed rgba(255,255,255,0.28)",
  borderRadius: "12px",
  marginBottom: "12px",
  background: "rgba(255,255,255,0.06)",
  color: "#e5e7eb",
  boxSizing: "border-box",
};

const termsBoxStyle = {
  marginTop: "18px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "14px",
  background: "rgba(255,255,255,0.06)",
  padding: "14px",
};

const termsHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: "10px",
  alignItems: "center",
  color: "white",
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
  color: "#cbd5e1",
  fontSize: "0.92rem",
  lineHeight: 1.4,
};

const termsCheckStyle = {
  marginTop: "14px",
  display: "grid",
  gridTemplateColumns: "20px minmax(0, 1fr)",
  gap: "10px",
  alignItems: "start",
  color: "white",
  fontWeight: 800,
  lineHeight: 1.35,
};

const buttonStyle = {
  width: "100%",
  padding: "14px",
  background: "linear-gradient(135deg, #facc15, #f97316)",
  color: "#111827",
  border: "none",
  borderRadius: "999px",
  fontWeight: 950,
  cursor: "pointer",
  marginTop: "16px",
  boxShadow: "0 16px 34px rgba(249, 115, 22, 0.24)",
};

export default DriverSignup;
