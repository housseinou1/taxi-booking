import React, { useState } from "react";

function Register() {
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    gender: "Male",
    user_type: "rider",
    password: "",
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const registerUser = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("http://127.0.0.1:8000/auth/register/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Account created ✅ Please login.");
        window.location.href = "/login";
      } else {
        console.log("Register error:", data);
        alert(JSON.stringify(data));
      }
    } catch (err) {
      console.error(err);
      alert("Server error. Make sure Django is running.");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1>📝 Register</h1>

        <form onSubmit={registerUser}>
          <input
            name="first_name"
            placeholder="First Name"
            value={formData.first_name}
            onChange={handleChange}
            style={input}
          />

          <input
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

          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            style={input}
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          <select
            name="user_type"
            value={formData.user_type}
            onChange={handleChange}
            style={input}
          >
            <option value="rider">Rider</option>
            <option value="driver">Driver</option>
          </select>

          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            style={input}
          />

          <button type="submit" style={button}>
            Create Account
          </button>
        </form>
      </div>
    </div>
  );
}

const page = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "100vh",
  background: "#f4f7fb",
};

const card = {
  background: "white",
  padding: "40px",
  borderRadius: "20px",
  width: "400px",
  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
};

const input = {
  width: "100%",
  padding: "14px",
  marginBottom: "15px",
  borderRadius: "10px",
  border: "1px solid #ccc",
};

const button = {
  width: "100%",
  padding: "14px",
  border: "none",
  borderRadius: "10px",
  background: "black",
  color: "white",
  cursor: "pointer",
};

export default Register;