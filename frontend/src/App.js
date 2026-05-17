import React, { useState } from "react";

import DriverApp from "./driver/DriverApp";
import RiderApp from "./rider/RiderApp";

function App() {
  const [screen, setScreen] = useState("home");

  if (screen === "driver") {
    return <DriverApp />;
  }

  if (screen === "rider") {
    return <RiderApp />;
  }

  return (
    <div style={page}>
      <div style={card}>
        <h1 style={title}>🚖 Sakho Express</h1>

        <button
          style={button}
          onClick={() => setScreen("driver")}
        >
          Driver Dashboard
        </button>

        <button
          style={button}
          onClick={() => setScreen("rider")}
        >
          Rider Dashboard
        </button>
      </div>
    </div>
  );
}

const page = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#f5f7fb",
};

const card = {
  background: "white",
  padding: "50px",
  borderRadius: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  width: "350px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
};

const title = {
  textAlign: "center",
  marginBottom: "20px",
  fontSize: "42px",
};

const button = {
  padding: "18px",
  borderRadius: "12px",
  border: "none",
  background: "#111827",
  color: "white",
  fontSize: "18px",
  cursor: "pointer",
};

export default App;