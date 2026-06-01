import React from "react";

/**
 * DriverNavigation - Bottom navigation bar for the premium driver app.
 *
 * Fixed bottom bar with dark navy background, green active indicator,
 * 56px height, and mobile-friendly touch targets.
 * Highlights active tab based on window.location.pathname.
 * Uses window.location.href for navigation (matching existing pattern).
 */

const TABS = [
  {
    key: "dashboard",
    label: "Dashboard",
    path: "/driver",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#00A651" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: "earnings",
    label: "Earnings",
    path: "/driver/earnings",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#00A651" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "History",
    path: "/driver/history",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#00A651" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    path: "/driver/profile",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={active ? "#00A651" : "rgba(255,255,255,0.5)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

function getActiveTab(pathname) {
  // Exact match for dashboard (root /driver)
  if (pathname === "/driver" || pathname === "/driver/") return "dashboard";
  // Match other paths
  for (const tab of TABS) {
    if (tab.path !== "/driver" && pathname.startsWith(tab.path)) {
      return tab.key;
    }
  }
  return "dashboard";
}

export default function DriverNavigation() {
  const currentPath = window.location.pathname;
  const activeTab = getActiveTab(currentPath);

  const handleNavigate = (path) => {
    if (currentPath !== path) {
      window.location.href = path;
    }
  };

  return (
    <nav style={navContainerStyle} aria-label="Driver navigation">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => handleNavigate(tab.path)}
            style={{
              ...tabButtonStyle,
              ...(isActive ? activeTabStyle : {}),
            }}
            aria-label={tab.label}
            aria-current={isActive ? "page" : undefined}
          >
            {/* Active indicator dot */}
            {isActive && <span style={activeIndicatorStyle} />}
            <span style={iconWrapperStyle}>{tab.icon(isActive)}</span>
            <span
              style={{
                ...tabLabelStyle,
                color: isActive ? "#00A651" : "rgba(255,255,255,0.5)",
                fontWeight: isActive ? 800 : 600,
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const navContainerStyle = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-around",
  height: "56px",
  backgroundColor: "#0B1220",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  padding: "0 8px",
  boxShadow: "0 -4px 20px rgba(0,0,0,0.3)",
};

const tabButtonStyle = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2px",
  flex: 1,
  height: "56px",
  minWidth: "64px",
  padding: "6px 12px",
  border: "none",
  background: "transparent",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
};

const activeTabStyle = {};

const activeIndicatorStyle = {
  position: "absolute",
  top: "0",
  left: "50%",
  transform: "translateX(-50%)",
  width: "24px",
  height: "3px",
  borderRadius: "0 0 3px 3px",
  backgroundColor: "#00A651",
};

const iconWrapperStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
};

const tabLabelStyle = {
  fontSize: "10px",
  lineHeight: 1,
  letterSpacing: "0.2px",
  transition: "color 0.2s ease",
};
