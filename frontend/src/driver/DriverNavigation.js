import React from "react";
import { Icon } from "../design-system";
import { navigateInApp } from "../navigation/inAppNavigation";

const TABS = [
  { key: "dashboard", label: "Home", path: "/driver", icon: "home" },
  { key: "earnings", label: "Earnings", path: "/driver/earnings", icon: "earnings" },
  { key: "history", label: "History", path: "/driver/history", icon: "history" },
  { key: "profile", label: "Profile", path: "/driver/profile", icon: "profile" },
];

function getActiveTab(pathname) {
  if (pathname === "/driver" || pathname === "/driver/") return "dashboard";
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

  return (
    <nav className="yds-bottom-nav driver-nav" aria-label="Driver navigation">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            className="yds-bottom-nav__item"
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
            onClick={() => {
              if (currentPath !== tab.path) navigateInApp(tab.path);
            }}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
