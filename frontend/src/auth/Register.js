import React, { useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

function Register() {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    gender: "Male",
    phone_number: "",
    national_id_number: "",
    password: "",
    user_type: "rider",
  });

  const [loading, setLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const registerUser = async () => {
    try {
      setLoading(true);

      if (formData.user_type === "rider" && !profilePicture) {
        alert("Rider profile photo is required.");
        return;
      }

      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        payload.append(key, value);
      });

      if (profilePicture) {
        payload.append("profile_picture", profilePicture);
      }

      const response = await axios.post(
        `${API_URL}/auth/register/`,
        payload,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      alert("Account created successfully ✅");

      if (response.data?.access) {
        localStorage.setItem("access", response.data.access);
      }

      if (response.data?.refresh) {
        localStorage.setItem("refresh", response.data.refresh);
      }

      if (formData.user_type === "rider") {
  localStorage.setItem("needs_payment_setup", "true");
  localStorage.removeItem("needs_vehicle_setup");

  setTimeout(() => {
   window.location.replace("/payment-setup");
  }, 500);

  return;
}

if (formData.user_type === "driver") {
  localStorage.setItem("needs_vehicle_setup", "true");
  localStorage.removeItem("needs_payment_setup");

  setTimeout(() => {
    window.location.replace("/driver-vehicle-setup");
  }, 500);

  return;
}

      window.location.href = "/";
    } catch (error) {
      console.log("Registration error:", error.response?.data || error);

      const errorMessage =
        error.response?.data?.email?.[0] ||
        error.response?.data?.gender?.[0] ||
        error.response?.data?.national_id_number?.[0] ||
        error.response?.data?.password?.[0] ||
        error.response?.data?.user_type?.[0] ||
        error.response?.data?.detail ||
        "Registration failed";

      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>
          🚕 {formData.user_type === "rider" ? "Rider" : "Driver"} Sign Up
        </h1>

        <input
          name="first_name"
          placeholder="First Name"
          value={formData.first_name}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          name="last_name"
          placeholder="Last Name"
          value={formData.last_name}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          name="email"
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          style={inputStyle}
        />

        <select
          name="gender"
          value={formData.gender}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <input
          name="national_id_number"
          placeholder="National ID Number"
          value={formData.national_id_number}
          onChange={handleChange}
          style={inputStyle}
        />

        <input
          name="phone_number"
          type="tel"
          placeholder="+222 Phone Number"
          value={formData.phone_number}
          onChange={handleChange}
          style={inputStyle}
        />

        {formData.user_type === "rider" && (
          <label style={fileLabelStyle}>
            Rider profile photo required
            <input
              type="file"
              accept="image/*"
              required
              onChange={(event) => setProfilePicture(event.target.files?.[0] || null)}
              style={fileInputStyle}
            />
          </label>
        )}

        <input
          name="password"
          type="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          style={inputStyle}
        />

        <select
          name="user_type"
          value={formData.user_type}
          onChange={(event) => {
            handleChange(event);
            if (event.target.value !== "rider") {
              setProfilePicture(null);
            }
          }}
          style={inputStyle}
        >
          <option value="rider">Rider</option>
          <option value="driver">Driver</option>
        </select>

        <button
          onClick={registerUser}
          disabled={loading}
          style={buttonStyle}
        >
          {loading ? "Creating..." : "Create Account"}
        </button>

        <button
          onClick={() => (window.location.href = "/")}
          style={secondaryButtonStyle}
        >
          Back to Home
        </button>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#0f172a",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "Arial, sans-serif",
};

const cardStyle = {
  background: "white",
  padding: "30px",
  borderRadius: "20px",
  width: "100%",
  maxWidth: "420px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
};

const titleStyle = {
  textAlign: "center",
  marginBottom: "24px",
  color: "#111827",
};

const inputStyle = {
  width: "100%",
  padding: "14px",
  marginBottom: "14px",
  borderRadius: "12px",
  border: "1px solid #d1d5db",
};

const fileLabelStyle = {
  display: "grid",
  gap: "8px",
  width: "100%",
  padding: "12px",
  marginBottom: "14px",
  borderRadius: "12px",
  border: "1px dashed #9ca3af",
  background: "#f9fafb",
  color: "#111827",
  fontWeight: "bold",
  boxSizing: "border-box",
};

const fileInputStyle = {
  width: "100%",
  color: "#374151",
  fontWeight: "normal",
};

const buttonStyle = {
  width: "100%",
  padding: "14px",
  background: "#f59e0b",
  color: "#111827",
  border: "none",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "8px",
};

const secondaryButtonStyle = {
  width: "100%",
  padding: "14px",
  background: "#f3f4f6",
  color: "#111827",
  border: "none",
  borderRadius: "12px",
  fontWeight: "bold",
  cursor: "pointer",
  marginTop: "12px",
};

export default Register;
