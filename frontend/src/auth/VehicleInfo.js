import React, { useState } from "react";
import { API_URL, authFetch } from "../apiConfig";

function VehicleInfo({ setShowRegister }) {
  const [vehicleData, setVehicleData] = useState({
    phone_number: "",
    car_type: "regular",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_color: "",
    vehicle_plate: "",
  });

  const [driverPhoto, setDriverPhoto] = useState(null);
  const [vehicleRegistration, setVehicleRegistration] = useState(null);
  const [insuranceDocument, setInsuranceDocument] = useState(null);

  const handleChange = (e) => {
    setVehicleData({
      ...vehicleData,
      [e.target.name]: e.target.value,
    });
  };

  const saveVehicleInfo = async (e) => {
    e.preventDefault();

    const formData = new FormData();

    formData.append("phone_number", vehicleData.phone_number);
    formData.append("car_type", vehicleData.car_type);
    formData.append("vehicle_make", vehicleData.vehicle_make);
    formData.append("vehicle_model", vehicleData.vehicle_model);
    formData.append("vehicle_color", vehicleData.vehicle_color);
    formData.append("vehicle_plate", vehicleData.vehicle_plate);

    if (driverPhoto) {
      formData.append("driver_photo", driverPhoto);
    }

    if (vehicleRegistration) {
      formData.append("vehicle_registration", vehicleRegistration);
    }

    if (insuranceDocument) {
      formData.append("insurance_document", insuranceDocument);
    }

    try {
      const token = localStorage.getItem("access");

      const response = await authFetch(`${API_URL}/drivers/profile/update/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        alert("Could not save vehicle information.");
        return;
      }

      alert(
        "Vehicle information submitted ✅\nYour driver account is pending admin approval."
      );

      setShowRegister(false);
    } catch (error) {
      console.error(error);
      alert("Server connection error.");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>🚘 Vehicle Information</h1>

        <form onSubmit={saveVehicleInfo}>
          <input
            name="phone_number"
            placeholder="Phone Number"
            value={vehicleData.phone_number}
            onChange={handleChange}
            style={input}
            required
          />

          <select
            name="car_type"
            value={vehicleData.car_type}
            onChange={handleChange}
            style={input}
          >
            <option value="regular">Regular</option>
            <option value="xl">XL</option>
            <option value="comfort">Comfort</option>
          </select>

          <input
            name="vehicle_make"
            placeholder="Vehicle Make e.g. Toyota"
            value={vehicleData.vehicle_make}
            onChange={handleChange}
            style={input}
            required
          />

          <input
            name="vehicle_model"
            placeholder="Vehicle Model e.g. Corolla"
            value={vehicleData.vehicle_model}
            onChange={handleChange}
            style={input}
            required
          />

          <input
            name="vehicle_color"
            placeholder="Vehicle Color"
            value={vehicleData.vehicle_color}
            onChange={handleChange}
            style={input}
            required
          />

          <input
            name="vehicle_plate"
            placeholder="Vehicle Plate Number"
            value={vehicleData.vehicle_plate}
            onChange={handleChange}
            style={input}
            required
          />

          <label style={label}>Driver Picture</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setDriverPhoto(e.target.files[0])}
            style={fileInput}
            required
          />

          <label style={label}>Vehicle Registration</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setVehicleRegistration(e.target.files[0])}
            style={fileInput}
            required
          />

          <label style={label}>Insurance Document</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setInsuranceDocument(e.target.files[0])}
            style={fileInput}
            required
          />

          <button type="submit" style={button}>
            Submit Vehicle Info
          </button>
        </form>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  background: "#0f172a",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "Arial, sans-serif",
  padding: "30px",
};

const card = {
  background: "white",
  padding: "40px",
  borderRadius: "24px",
  width: "460px",
};

const title = {
  textAlign: "center",
  marginTop: 0,
  marginBottom: "25px",
};

const input = {
  width: "100%",
  padding: "15px",
  marginBottom: "14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
};

const label = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "bold",
  color: "#111827",
};

const fileInput = {
  width: "100%",
  padding: "12px",
  marginBottom: "16px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
};

const button = {
  width: "100%",
  padding: "16px",
  border: "none",
  borderRadius: "14px",
  background: "#111827",
  color: "white",
  fontWeight: "bold",
  fontSize: "18px",
  cursor: "pointer",
};

export default VehicleInfo;
