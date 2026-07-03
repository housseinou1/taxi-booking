import React from "react";

export default function DeliveryCourierHomeIdle({ statusOnline, tab }) {
  if (tab === "active") {
    return (
      <div className="cce-home-idle cce-home-idle--calm">
        <span className="cce-home-idle__icon" aria-hidden>
          ✓
        </span>
        <strong>No active deliveries</strong>
        <p>Accepted jobs will appear here while you complete them.</p>
        <div className="cce-home-idle__chips">
          <span>Pickup PIN ready</span>
          <span>Proof photo</span>
          <span>Dropoff confirm</span>
        </div>
      </div>
    );
  }

  if (!statusOnline) {
    return (
      <div className="cce-home-idle cce-home-idle--offline">
        <span className="cce-home-idle__icon" aria-hidden>
          ⏻
        </span>
        <strong>You're offline</strong>
        <p>Switch Online at the top to receive delivery requests near you.</p>
        <ul className="cce-home-idle__tips">
          <li>Check your vehicle type below</li>
          <li>Keep documents up to date</li>
          <li>Stay in busy zones when online</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="cce-home-idle cce-home-idle--online">
      <span className="cce-home-idle__pulse" aria-hidden />
      <span className="cce-home-idle__icon cce-home-idle__icon--live" aria-hidden>
        📡
      </span>
      <strong>Waiting for delivery requests</strong>
      <p>You're online. New jobs will appear here and trigger a sound alert.</p>
      <ul className="cce-home-idle__tips">
        <li>Keep the app open in busy areas</li>
        <li>Accept quickly — offers expire</li>
        <li>Pull up this sheet anytime for today's stats</li>
      </ul>
    </div>
  );
}
