import React, { useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";

const logoSrc = "/sakho-brand-logo.jpeg";

export default function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {

    try {

      setLoading(true);

      const response = await axios.post(
        `${API_URL}/auth/login/`,
        {
          email: email.trim().toLowerCase(),
          password: password,
        }
      );

      console.log(response.data);

      localStorage.setItem(
        "access",
        response.data.access
      );

      localStorage.setItem(
        "refresh",
        response.data.refresh
      );

      localStorage.setItem(
        "user",
        JSON.stringify(response.data)
      );

      if (response.data.is_staff) {

        window.location.href = "/admin-dashboard";

      } else if (response.data.is_driver) {

        window.location.href = "/driver";

      } else {

        window.location.href = "/rider-dashboard";
      }

    } catch (error) {

      console.log(error.response?.data);

      alert(
        error.response?.data?.error ||
        "Login failed"
      );

    } finally {

      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: "#020617",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >

      <div
        style={{
          width: "320px",
          background: "#ffffff",
          padding: "24px",
          borderRadius: "20px",
          textAlign: "center",
          boxShadow: "0 24px 54px rgba(0, 0, 0, 0.35)",
        }}
      >

        <img
          src={logoSrc}
          alt="Sakho Express"
          style={{
            width: "100%",
            aspectRatio: "1.35 / 1",
            objectFit: "cover",
            borderRadius: "16px",
            marginBottom: "20px",
            display: "block",
          }}
        />

        <h1
          style={{
            fontSize: "28px",
            margin: "0 0 22px",
            color: "#0f172a",
            letterSpacing: 0,
          }}
        >
          Login
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "15px",
            marginBottom: "20px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
          }}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "15px",
            background: "green",
            color: "white",
            border: "none",
            borderRadius: "10px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          {loading ? "Logging in..." : "Login"}
        </button>

      </div>

    </div>
  );
}
