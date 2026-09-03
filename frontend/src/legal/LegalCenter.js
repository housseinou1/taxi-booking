import React from "react";

import "./legal-compliance.css";

const LEGAL_LINKS = {
  rider: [
    { label: "Terms & Conditions", href: "/terms" },
    { label: "Privacy Policy", href: "https://www.yalataxi.live/privacy" },
    { label: "Refund Policy", href: "/terms#refunds" },
    { label: "Delete account", href: "https://api.yalataxi.live/yala-account-deletion/" },
  ],
  driver: [
    { label: "Driver Agreement", href: "/terms#driver" },
    { label: "Earnings Policy", href: "/terms#earnings" },
    { label: "Safety Policy", href: "/terms#safety" },
    { label: "Privacy Policy", href: "https://www.yalataxi.live/privacy" },
    { label: "Delete account", href: "https://api.yalataxi.live/yala-account-deletion/" },
  ],
  delivery: [
    { label: "Courier Agreement", href: "/delivery/courier/sign" },
    { label: "Delivery Rules", href: "/delivery/courier/terms" },
    { label: "Prohibited Items Policy", href: "/delivery/courier/terms#prohibited" },
    { label: "Customer Terms", href: "/delivery/customer/terms" },
    { label: "Privacy Policy", href: "https://www.yalataxi.live/privacy" },
    { label: "Delete account", href: "https://api.yalataxi.live/yala-account-deletion/" },
  ],
  admin: [
    { label: "Legal center", href: "/delivery-admin?tab=legal" },
    { label: "Compliance logs", href: "/delivery-admin?tab=legal" },
    { label: "Signed agreements", href: "/delivery-admin?tab=legal" },
  ],
};

export default function LegalCenter({ app = "delivery" }) {
  const links = LEGAL_LINKS[app] || LEGAL_LINKS.delivery;

  return (
    <div className="yala-legal-center">
      <div className="yala-legal-center__card">
        <h3>Legal Center</h3>
        <p style={{ margin: "0 0 12px", color: "#6b7280", fontSize: 14 }}>
          Review Yala policies and signed agreements.
        </p>
        <div className="yala-legal-center__links">
          {links.map((item) => (
            <a
              key={item.label}
              href={item.href}
              {...(item.href.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {item.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
