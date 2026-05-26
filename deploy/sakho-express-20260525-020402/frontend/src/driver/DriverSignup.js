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

  const [driverPhoto, setDriverPhoto] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [insuranceDocument, setInsuranceDocument] = useState(null);
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

      const data = new FormData();

      data.append("phone_number", formData.phone_number);
      data.append("car_type", formData.car_type);
      data.append("vehicle_make", formData.vehicle_make);
      data.append("vehicle_model", formData.vehicle_model);
      data.append("vehicle_color", formData.vehicle_color);
      data.append("plate_number", formData.plate_number);

      if (driverPhoto) {
        data.append("driver_photo", driverPhoto);
      }

      if (licenseFile) {
        data.append("license_file", licenseFile);
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

        <label style={labelStyle}>🛡️ Upload Insurance</label>
        <input
          type="file"
          onChange={(e) => setInsuranceDocument(e.target.files[0])}
          style={fileStyle}
        />

        <button
          onClick={submitApplication}
          disabled={loading}
          style={buttonStyle}
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
