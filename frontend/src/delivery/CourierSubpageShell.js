import React from "react";

import CourierBottomNav from "./components/CourierBottomNav";
import "./delivery-courier-flow.css";

/**
 * DoorDash-style subpage shell with consistent bottom navigation.
 */
export default function CourierSubpageShell({ title, activeNav, children, headerRight = null }) {
  const navigate = (path) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="ccf-subpage">
      <header className="ccf-subpage__header">
        <button
          type="button"
          className="ccf-subpage__back"
          onClick={() => navigate("/delivery/courier")}
          aria-label="Back to home"
        >
          ←
        </button>
        <h1>{title}</h1>
        <div className="ccf-subpage__header-right">{headerRight}</div>
      </header>

      <main className="ccf-subpage__body">{children}</main>

      <CourierBottomNav
        activeNav={activeNav}
        navClassName="ccf-subpage__nav"
        buttonClassName=""
        ariaLabel="Courier navigation"
      />
    </div>
  );
}
