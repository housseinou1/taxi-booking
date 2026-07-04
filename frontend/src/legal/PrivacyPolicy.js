import React, { useEffect } from "react";
import { MARKET } from "../marketConfig";

/**
 * Standalone Privacy Policy page for Yala.
 * Covers data collection, usage, sharing, retention, and user rights.
 * Used both in-app and as a publicly accessible page for app store compliance.
 */
function PrivacyPolicy() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("return") || "";
    if (next.startsWith("/delivery")) {
      try {
        sessionStorage.setItem("yala_delivery_customer_privacy_read", "1");
      } catch {
        // ignore
      }
    }
  }, []);

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <span style={brandPillStyle}>{MARKET.brandName}</span>
        <h1 style={titleStyle}>Privacy Policy</h1>
        <p style={subtitleStyle}>
          This privacy policy explains how Yala collects, uses, shares, and
          protects your personal information when you use our ride-hailing
          platform in {MARKET.country}.
        </p>

        <div style={sectionGridStyle}>
          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Data We Collect</h2>
            <ul style={listStyle}>
              <li>
                <strong>Personal information:</strong> Name, phone number,
                email address, National ID (drivers), profile photo
              </li>
              <li>
                <strong>Location data:</strong> GPS coordinates during rides
                (pickup, route, drop-off), background location for online
                drivers
              </li>
              <li>
                <strong>Ride history:</strong> Pickup and drop-off locations,
                timestamps, fare amounts, ride type, driver/rider pairings
              </li>
              <li>
                <strong>Payment information:</strong> Payment method details
                (Bankily, Masravi, Seddad, card, bank account), transaction
                records
              </li>
              <li>
                <strong>Device information:</strong> Device type, operating
                system, push notification tokens, app version
              </li>
              <li>
                <strong>Driver documents:</strong> License, vehicle
                registration, insurance, inspection certificates
              </li>
            </ul>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>How We Use Your Data</h2>
            <ul style={listStyle}>
              <li>
                <strong>Ride matching:</strong> Connecting riders with nearby
                available drivers based on location
              </li>
              <li>
                <strong>Payments:</strong> Processing ride fares, driver
                earnings, commission calculations, and withdrawals
              </li>
              <li>
                <strong>Safety:</strong> Emergency support, ride tracking,
                driver verification, and incident investigation
              </li>
              <li>
                <strong>Service improvement:</strong> Analytics on ride
                patterns, wait times, and service quality
              </li>
              <li>
                <strong>Communications:</strong> Push notifications for ride
                updates, promotions, and account alerts
              </li>
              <li>
                <strong>Legal compliance:</strong> Responding to legal
                requests and enforcing our terms of service
              </li>
            </ul>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Data Sharing</h2>
            <ul style={listStyle}>
              <li>
                <strong>Riders see:</strong> Driver name, photo, vehicle
                details, rating, and real-time location during a ride
              </li>
              <li>
                <strong>Drivers see:</strong> Rider first name, pickup
                location, and destination after accepting a ride
              </li>
              <li>
                <strong>Payment providers:</strong> Transaction details shared
                with Bankily, Masravi, Seddad, or bank partners to process
                payments
              </li>
              <li>
                <strong>We do not sell</strong> your personal data to third
                parties for advertising or marketing purposes
              </li>
            </ul>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Data Retention</h2>
            <p style={textStyle}>
              We retain your account data for as long as your account is
              active. Ride history and payment records are kept for 3 years
              for accounting and dispute resolution. After account deletion,
              we may retain anonymized data for analytics. Driver documents
              are deleted within 30 days of account closure.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Your Rights</h2>
            <ul style={listStyle}>
              <li>
                <strong>Access:</strong> Request a copy of all personal data
                we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Update inaccurate account,
                vehicle, or payment information
              </li>
              <li>
                <strong>Deletion:</strong> Request account deletion and
                removal of personal data (subject to legal retention
                requirements)
              </li>
              <li>
                <strong>Portability:</strong> Export your ride history and
                account data
              </li>
              <li>
                <strong>Withdraw consent:</strong> Disable location sharing or
                push notifications at any time through device settings
              </li>
            </ul>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Security</h2>
            <p style={textStyle}>
              We use HTTPS encryption, secure token storage (Keychain on iOS,
              Keystore on Android), and access controls to protect your data.
              Payment credentials are never stored in frontend code. Admin
              access is limited to authorized staff.
            </p>
          </article>

          <article style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Contact Us</h2>
            <p style={textStyle}>
              For privacy questions, data requests, or concerns, contact us
              at:
            </p>
            <ul style={listStyle}>
              <li>Email: support@yalataxi.live</li>
              <li>Support: https://yalataxi.live</li>
              <li>Account deletion: https://yalataxi.live/account-deletion</li>
              <li>Phone: {MARKET.phonePrefix}45000001</li>
            </ul>
          </article>
        </div>

        <p style={footerStyle}>
          Last updated: June 2026. This policy applies to Yala Rider and
          Yala Driver apps available on iOS and Android.
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

const listStyle = {
  margin: 0,
  paddingLeft: 20,
  lineHeight: 1.8,
  color: "#333",
  fontSize: 14,
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

export default PrivacyPolicy;
