import React from "react";
import "./RiderShell.css";

/**
 * Lyft-style page shell for rider secondary screens:
 * back arrow, single title, scrollable white content — no button grid.
 */
export default function RiderShell({
  title,
  children,
  backTo = "/rider-dashboard",
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
    <div className="rider-shell">
      <header className="rider-shell__header">
        <button
          type="button"
          className="rider-shell__back"
          onClick={handleBack}
          aria-label="Go back"
        >
          <span aria-hidden="true" />
        </button>
        <h1 className="rider-shell__title">{title}</h1>
        <div className="rider-shell__right">{rightAction}</div>
      </header>
      <main className="rider-shell__content">{children}</main>
    </div>
  );
}
