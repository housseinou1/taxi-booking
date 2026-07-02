import React, { useState } from "react";
import { API_URL } from "../apiConfig";

function DriverSignup() {
  const [formData, setFormData] = useState({
    phone_number: "",
    car_type: "regular",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_color: "",
    plate_number: "",
  });

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

      if (!formData.vehicle_make || !formData.vehicle_model || !formData.plate_number) {
        alert("Please fill in all vehicle information (make, model, and plate number).");
        return;
      }

      const data = new FormData();

      data.append("phone_number", formData.phone_number);
      data.append("car_type", formData.car_type);
      data.append("vehicle_make", formData.vehicle_make);
      data.append("vehicle_model", formData.vehicle_model);
      data.append("vehicle_color", formData.vehicle_color);
      data.append("plate_number", formData.plate_number);

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

      alert("Vehicle saved. Next, sign the Yala Driver Agreement.");

      localStorage.removeItem("needs_vehicle_setup");

      window.location.href = "/driver/sign?return=/driver";
    } catch (error) {
      console.error(error);
      alert("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={heroStyle}>
          <span style={eyebrowStyle}>Yala driver registration</span>
          <h1 style={titleStyle}>Add your vehicle information</h1>
          <p style={subtitleStyle}>
            Enter your car details to create your driver account. You can upload documents later from the Driver Dashboard.
          </p>
        </div>

        <div style={statusStripStyle}>
          <span style={statusDotStyle} />
          <div>
            <strong>After registration</strong>
            <small>Upload documents from Dashboard → Documents to get approved.</small>
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

        <p style={legalNoteStyle}>
          After saving your vehicle, you will sign the Yala Driver Agreement electronically before going online.
        </p>

        <button
          onClick={submitApplication}
          disabled={loading}
          style={{
            ...buttonStyle,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Saving vehicle..." : "Save vehicle & continue"}
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

const legalNoteStyle = {
  marginTop: "18px",
  marginBottom: "8px",
  padding: "14px",
  borderRadius: "12px",
  background: "rgba(250, 204, 21, 0.1)",
  border: "1px solid rgba(250, 204, 21, 0.22)",
  color: "#fde68a",
  lineHeight: 1.5,
  fontWeight: 700,
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
