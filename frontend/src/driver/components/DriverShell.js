import React from "react";
import "./DriverShell.css";

export default function DriverShell({
  title,
  children,
  backTo = "/driver",
  onBack,
  rightAction = null,
}) {
  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }
    window.location.href = backTo;
  };

  return (
    <div className="driver-shell">
      <header className="driver-shell__header">
        <button
          type="button"
          className="driver-shell__back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <span aria-hidden="true" />
        </button>
        <h1 className="driver-shell__title">{title}</h1>
        <div className="driver-shell__right">{rightAction}</div>
      </header>
      <main className="driver-shell__content">{children}</main>
    </div>
  );
}
