import React, { useState } from "react";

import AuthPage from "./auth/AuthPage";
import DriverApp from "./driver/DriverApp";
import RiderApp from "./rider/RiderApp";

function App() {
  const savedUserType = localStorage.getItem("userType");
  const savedToken = localStorage.getItem("access");

  const [screen, setScreen] = useState(
    savedToken && savedUserType ? savedUserType : "auth"
  );

  const handleLogin = (userType) => {
    setScreen(userType);
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("userType");
    localStorage.removeItem("currentRideId");
    localStorage.removeItem("activeRideId");

    setScreen("auth");
  };

  if (screen === "auth") {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <div>
      <button style={logoutBtn} onClick={logout}>
        Logout
      </button>

      {screen === "driver" && <DriverApp />}
      {screen === "rider" && <RiderApp />}
    </div>
  );
}

const logoutBtn = {
  position: "fixed",
  top: "15px",
  right: "15px",
  zIndex: 9999,
  padding: "10px 18px",
  border: "none",
  borderRadius: "10px",
  background: "#dc2626",
  color: "white",
  cursor: "pointer",
};

export default App;