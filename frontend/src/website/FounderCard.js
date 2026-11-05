import React from "react";

/**
 * Founder / CEO card.
 *
 * Deliberately separate from the customer-support contacts: the CEO mailbox
 * (sakho@yalataxi.live) is not the support mailbox (support@yalataxi.live),
 * and the two must never be interchanged.
 */
export const CEO_CONTACT = {
  email: "sakho@yalataxi.live",
  site: "https://www.yalataxi.live",
  siteLabel: "www.yalataxi.live",
};

export default function FounderCard({ t, className = "" }) {
  return (
    <div className={`ys-founder ${className}`.trim()}>
      <span className="ys-founder-av" aria-hidden="true">HS</span>
      <div className="ys-founder-body">
        <span className="ys-founder-eyebrow">{t("fdEyebrow")}</span>
        <span className="ys-founder-name">{t("fdName")}</span>
        <span className="ys-founder-role">{t("fdRole")}</span>
        <span className="ys-founder-org">{t("fdOrg")}</span>
        <div className="ys-founder-links">
          <a
            className="ys-founder-link"
            href={`mailto:${CEO_CONTACT.email}`}
            aria-label={`Email the CEO, ${t("fdName")}`}
          >
            <span aria-hidden="true">✉️</span>
            <span className="ys-fl">{CEO_CONTACT.email}</span>
          </a>
          <a
            className="ys-founder-link"
            href={CEO_CONTACT.site}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="YALA Technologies website"
          >
            <span aria-hidden="true">🌐</span>
            <span className="ys-fl">{CEO_CONTACT.siteLabel}</span>
          </a>
        </div>
        <span className="ys-founder-tag">
          {t("fdOrg")}
          <span className="ys-sep" aria-hidden="true">|</span>
          {t("fdTagline")}
        </span>
      </div>
    </div>
  );
}
