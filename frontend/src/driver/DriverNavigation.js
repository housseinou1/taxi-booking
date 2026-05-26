import React from "react";

function DriverNavigation({ activeTab, setActiveTab }) {
  const tabs = [
    { key: "dashboard", label: "Dashboard", icon: "🏠" },
    { key: "rides", label: "Rides", icon: "🚖" },
    { key: "earnings", label: "Earnings", icon: "💰" },
    { key: "map", label: "Map", icon: "🗺️" },
  ];

  return (
    <div style={navStyle}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          style={{
            ...tabStyle,
            background: activeTab === tab.key ? "#22c55e" : "transparent",
            color: activeTab === tab.key ? "white" : "#d1d5db",
          }}
        >
          <span>{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}

const navStyle = {
  display: "flex",
  gap: "10px",
  background: "#1f2937",
  padding: "12px",
  borderRadius: "18px",
  marginBottom: "25px",
  flexWrap: "wrap",
};

const tabStyle = {
  border: "none",
  padding: "12px 16px",
  borderRadius: "12px",
  cursor: "pointer",
  fontWeight: "bold",
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

export default DriverNavigation;