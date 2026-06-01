import React from "react";
import { MARKET } from "../marketConfig";

/**
 * Standalone Terms of Service page for Yala.
 * Covers account rules, rider terms, driver agreement, payments, and disputes.
 * Used both in-app and as a publicly accessible page for app store compliance.
 */
function TermsOfService() {
  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <span style={brandPillStyle}>{MARKET.brandName}</span>
        <h1 style={titleStyle}>Terms of Service</h1>
        <p style={subtitleStyle}>
          By using Yala Rider or Yala Driver, you agree to these terms. These
          terms govern your use of the Yala ride-hailing platform in{" "}
          {MARKET.country}.
        </p>

        <div style={sectionGridStyle}>
          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>1. Account Responsibility</h2>
            <p style={textStyle}>
              Users must provide accurate names, phone numbers, National ID
              information, and payment or payout details. You are responsible
              for keeping your account information current. Accounts may be
              suspended or terminated for unsafe behavior, fraud, false
              information, expired driver documents, non-payment, or misuse of
              the platform.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>2. Rider Terms</h2>
            <p style={textStyle}>
              Riders must request trips honestly, choose accurate pickup and
              drop-off locations, respect drivers and vehicles, pay the agreed
              fare, and use rating, support, and emergency tools responsibly.
              Riders can tip drivers after drop-off. Repeated cancellations,
              false requests, harassment, abuse, or refusal to pay may lead to
              account suspension.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>3. Driver Agreement</h2>
            <p style={textStyle}>
              Drivers agree to operate safely, follow local transport laws,
              keep their vehicle clean and roadworthy, respect riders, and
              complete trips only through the app. Drivers must maintain
              current license, registration, insurance, vehicle inspection,
              and National ID documents. Expired documents will automatically
              suspend the driver profile until updated documents are submitted
              and approved.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>4. Payments and Commission</h2>
            <p style={textStyle}>
              The platform commission is {MARKET.ownerCommissionPercent}% of
              the ride fare. Driver earnings, rider tips, and withdrawal
              requests are tracked in the app. Supported payment methods
              include Bankily, Masravi, Seddad, cash, card, and bank account.
              All fares are in {MARKET.currency}.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>5. Ride Types</h2>
            <p style={textStyle}>
              Yala offers Regular, Share, Comfort, and XL ride types. Share
              rides allow multiple riders heading in the same direction to
              split costs (up to 50% savings). Riders and drivers agree to the
              fare shown at booking time. Surge pricing may apply during high
              demand periods.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>6. Safety and Conduct</h2>
            <p style={textStyle}>
              Drivers must not misuse rider personal information, drive while
              impaired, overcharge riders, or allow unauthorized persons to
              use their account. Riders must not harass drivers, damage
              vehicles, or make false safety reports. Both parties should use
              the emergency button only for genuine emergencies.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>7. Ratings and Disputes</h2>
            <p style={textStyle}>
              Riders and drivers can rate each other after trips. Ratings
              affect driver levels (Bronze, Silver, Gold, Platinum, Elite).
              Disputes are investigated by platform administrators using
              ratings, payment records, GPS data, and support reports. Users
              should report issues promptly through the in-app support center.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>8. Limitation of Liability</h2>
            <p style={textStyle}>
              Yala is a technology platform connecting riders and drivers. We
              are not a transportation company. Drivers are independent
              operators responsible for their own vehicles, insurance, and
              compliance with local laws. Yala is not liable for accidents,
              injuries, or property damage during rides beyond what is
              required by applicable law.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>9. Modifications</h2>
            <p style={textStyle}>
              We may update these terms from time to time. Continued use of
              the app after changes constitutes acceptance. Material changes
              will be communicated via push notification or in-app notice at
              least 7 days before taking effect.
            </p>
          </article>
        </div>

        <p style={footerStyle}>
          Last updated: January 2025. These terms apply to Yala Rider and
          Yala Driver apps in {MARKET.country}.
        </p>
      </section>
    </main>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#f3f6fa",
  padding: "40px 16px",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const cardStyle = {
  maxWidth: 800,
  margin: "0 auto",
  background: "#fff",
  borderRadius: 16,
  padding: "40px 32px",
  boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
};

const brandPillStyle = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 20,
  background: "#00A651",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 16,
};

const titleStyle = {
  fontSize: 28,
  fontWeight: 800,
  color: "#0B1220",
  margin: "0 0 8px",
};

const subtitleStyle = {
  fontSize: 15,
  color: "#555",
  margin: "0 0 32px",
  lineHeight: 1.6,
};

const sectionGridStyle = {
  display: "grid",
  gap: 24,
};

const sectionStyle = {
  padding: "20px 24px",
  background: "#f8fafc",
  borderRadius: 12,
  border: "1px solid #e8ecf0",
};

const sectionTitleStyle = {
  fontSize: 18,
  fontWeight: 700,
  color: "#0B1220",
  margin: "0 0 12px",
};

const textStyle = {
  margin: 0,
  lineHeight: 1.7,
  color: "#333",
  fontSize: 14,
};

const footerStyle = {
  marginTop: 32,
  fontSize: 13,
  color: "#888",
  textAlign: "center",
};

export default TermsOfService;
