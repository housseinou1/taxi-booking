import React, { useState } from "react";

function DriverSignup() {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone_number: "",
    car_type: "regular",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_plate: "",
  });

  const [profilePicture, setProfilePicture] = useState(null);
  const [licenseFile, setLicenseFile] = useState(null);
  const [insuranceFile, setInsuranceFile] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      alert("Email and password are required.");
      return;
    }

    const data = new FormData();

    data.append("first_name", formData.first_name);
    data.append("last_name", formData.last_name);
    data.append("email", formData.email);
    data.append("password", formData.password);
    data.append("phone_number", formData.phone_number);
    data.append("car_type", formData.car_type);
    data.append("vehicle_make", formData.vehicle_make);
    data.append("vehicle_model", formData.vehicle_model);
    data.append("vehicle_plate", formData.vehicle_plate);

    if (profilePicture) {
      data.append("profile_picture", profilePicture);
    }

    if (licenseFile) {
      data.append("license_file", licenseFile);
    }

    if (insuranceFile) {
      data.append("insurance_file", insuranceFile);
    }

    try {
      const res = await fetch("http://127.0.0.1:8000/drivers/register/", {
        method: "POST",
        body: data,
      });

      const result = await res.json();

      if (res.ok) {
        alert("Driver application submitted ✅ Please wait for admin approval.");

        setFormData({
          first_name: "",
          last_name: "",
          email: "",
          password: "",
          phone_number: "",
          car_type: "regular",
          vehicle_make: "",
          vehicle_model: "",
          vehicle_plate: "",
        });

        setProfilePicture(null);
        setLicenseFile(null);
        setInsuranceFile(null);

        window.location.href = "/login";
      } else {
        console.log("Driver signup error:", result);
        alert(result.error || JSON.stringify(result));
      }
    } catch (err) {
      console.error(err);
      alert("Server error. Make sure Django is running.");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1>🚕 Driver Registration</h1>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="first_name"
            placeholder="First Name"
            value={formData.first_name}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="last_name"
            placeholder="Last Name"
            value={formData.last_name}
            onChange={handleChange}
            style={input}
          />

          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            style={input}
          />

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="phone_number"
            placeholder="Phone Number"
            value={formData.phone_number}
            onChange={handleChange}
            style={input}
          />

          <select
            name="car_type"
            value={formData.car_type}
            onChange={handleChange}
            style={input}
          >
            <option value="regular">Regular</option>
            <option value="comfort">Comfort</option>
            <option value="xl">XL</option>
          </select>

          <input
            type="text"
            name="vehicle_make"
            placeholder="Vehicle Make"
            value={formData.vehicle_make}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="vehicle_model"
            placeholder="Vehicle Model"
            value={formData.vehicle_model}
            onChange={handleChange}
            style={input}
          />

          <input
            type="text"
            name="vehicle_plate"
            placeholder="Vehicle Plate"
            value={formData.vehicle_plate}
            onChange={handleChange}
            style={input}
          />

          <div style={uploadBox}>
            <label>👤 Upload Driver Picture</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfilePicture(e.target.files[0])}
            />
          </div>

          <div style={uploadBox}>
            <label>📄 Upload Driver License</label>
            <input
              type="file"
              onChange={(e) => setLicenseFile(e.target.files[0])}
            />
          </div>

          <div style={uploadBox}>
            <label>🛡️ Upload Insurance</label>
            <input
              type="file"
              onChange={(e) => setInsuranceFile(e.target.files[0])}
            />
          </div>

          <button type="submit" style={button}>
            Submit Application
          </button>
        </form>
      </div>
    </div>
  );
}

const page = {
  display: "flex",
  justifyContent: "center",
  padding: "40px",
  background: "#f4f7fb",
  minHeight: "100vh",
};

const card = {
  background: "white",
  padding: "30px",
  borderRadius: "20px",
  width: "420px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
};

const input = {
  width: "100%",
  padding: "12px",
  marginBottom: "15px",
  borderRadius: "8px",
  border: "1px solid #ccc",
};

const uploadBox = {
  marginBottom: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const button = {
  width: "100%",
  padding: "12px",
  background: "#111",
  color: "white",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
};

export default DriverSignup;