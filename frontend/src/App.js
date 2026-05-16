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
    <div style={pageStyle}>
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
  );
}

const pageStyle = {
  height: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "20px",
  background: "#f4f6f9",
};

const title = {
  fontSize: "48px",
  marginBottom: "20px",
};

const button = {
  padding: "18px 40px",
  borderRadius: "14px",
  border: "none",
  background: "#111827",
  color: "white",
  fontSize: "18px",
  cursor: "pointer",
};

export default App;