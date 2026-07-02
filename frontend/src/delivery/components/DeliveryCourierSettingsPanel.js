import React from "react";

import LegalCenter from "../../legal/LegalCenter";

const SETTINGS = [
  {
    title: "Courier profile",
    description: "Update your delivery name, phone number, city, and photo.",
    path: "/delivery/profile/edit",
  },
  {
    title: "Delivery documents",
    description: "Manage courier documents required for your delivery type.",
    path: "/delivery/documents",
  },
  {
    title: "Wallet & payouts",
    description: "Add payout details and request delivery withdrawals.",
    path: "/delivery/wallet",
  },
  {
    title: "Help & support",
    description: "Contact Yala Delivery support for orders, safety, or lost items.",
    path: "/delivery/support",
  },
  {
    title: "Legal Center",
    description: "Courier agreement, delivery rules, and signed policies.",
    path: "/delivery/courier/sign",
  },
];

export default function DeliveryCourierSettingsPanel() {
  return (
    <div className="delivery-uber__earnings">
      <div className="delivery-uber-card">
        <h2>Yala Delivery settings</h2>
        <p>Manage only your Delivery courier account. Taxi Driver settings are separate.</p>
      </div>

      <div className="delivery-uber__history-list">
        {SETTINGS.map((item) => (
          <button
            key={item.path}
            type="button"
            className="delivery-uber__history-item"
            style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            onClick={() => {
              window.location.href = item.path;
            }}
          >
            <div>
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </div>
            <div className="delivery-uber__history-meta">
              <span>Open</span>
            </div>
          </button>
        ))}
      </div>

      <LegalCenter app="delivery" />
    </div>
  );
}
