import React, { useState } from "react";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginUser = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch("http://127.0.0.1:8000/auth/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("access", data.access);
        localStorage.setItem("refresh", data.refresh);

        alert("Login successful ✅");
        window.location.href = "/rider";
      } else {
        console.log("Login error:", data);
        alert(data.detail || "Invalid email or password");
      }
    } catch (error) {
      console.error("Server error:", error);
      alert("Server error. Make sure Django is running.");
    }
  };

  return (
    <div style={page}>
      <div style={card}>
        <h1>🔐 Login</h1>

        <form onSubmit={loginUser}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={input}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />

          <button type="submit" style={button}>
            Login
          </button>
        </form>

        <p style={{ marginTop: "15px" }}>
          No account? <a href="/register">Register here</a>
        </p>
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

export default Login;