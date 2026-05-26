import React from "react";

function AuthHome({ setSelectedRole }) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>🚖 Sakho Express</h1>

        <p style={subtitleStyle}>
          Continue as Rider or Driver
        </p>

        <button
          style={riderButtonStyle}
          onClick={() => setSelectedRole("rider")}
        >
          🚕 Rider Login
        </button>

        <button
          style={driverButtonStyle}
          onClick={() => setSelectedRole("driver")}
        >
          🚖 Driver Login
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
  padding: "40px",
  borderRadius: "24px",
  width: "400px",
  textAlign: "center",
};

const titleStyle = {
  fontSize: "36px",
  marginTop: 0,
  color: "#111827",
};

const subtitleStyle = {
  color: "#6b7280",
  marginBottom: "30px",
};

const riderButtonStyle = {
  width: "100%",
  padding: "18px",
  borderRadius: "16px",
  border: "none",
  background: "#facc15",
  color: "#111827",
  fontWeight: "bold",
  fontSize: "18px",
  marginBottom: "15px",
  cursor: "pointer",
};

const driverButtonStyle = {
  width: "100%",
  padding: "18px",
  borderRadius: "16px",
  border: "none",
  background: "#111827",
  color: "white",
  fontWeight: "bold",
  fontSize: "18px",
  cursor: "pointer",
};

export default AuthHome;