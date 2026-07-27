import React from "react";
import { navigateInApp } from "../../navigation/inAppNavigation";
import "./DriverShell.css";
import "../driver-screens.css";
import DriverNavigation from "../DriverNavigation";

export default function DriverShell({
  title,
  children,
  backTo = "/driver",
  onBack,
  rightAction = null,
  showNav = true,
}) {
  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }
    navigateInApp(backTo);
  };

  return (
    <div className="driver-shell yala-driver-surface yds-root" data-yala-app="driver">
      <header className="driver-shell__header yds-app-bar">
        <button
          type="button"
          className="driver-shell__back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <span aria-hidden="true" />
        </button>
        <h1 className="driver-shell__title yds-app-bar__title">{title}</h1>
        <div className="driver-shell__right">{rightAction}</div>
      </header>
      <main className="driver-shell__content">{children}</main>
      {showNav ? <DriverNavigation /> : null}
    </div>
  );
}
