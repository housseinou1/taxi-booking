import React, { useEffect } from "react";

import { MARKET } from "../marketConfig";
import "./privacyPolicy.css";

/**
 * Public Privacy Policy for Yala Technologies.
 *
 * Published at https://yalataxi.live/privacy — the official address. The legacy
 * address /privacy-policy redirects here (see App.js), because older Google Play
 * listings and printed material still point at it.
 *
 * Two properties matter and are guarded by tests:
 *
 *  1. It must be readable with NO account and NO login. It renders its own brand
 *     header and legal footer and is never wrapped in the application TopBar, so a
 *     public legal document shows no Rider / Driver / Admin / Settings / Logout
 *     navigation.
 *  2. It must keep the disclosures Google Play requires for Yala Rider, Yala
 *     Driver and Yala Delivery — background location, personal information,
 *     payments, data sharing, retention and account deletion.
 *
 * It is also the single source of truth for the policy: App.js delegates here
 * rather than keeping a second inline copy that can drift out of date.
 */

const SUPPORT_EMAIL = "support@yalataxi.live";
const SUPPORT_SITE = "https://yalataxi.live";
const ACCOUNT_DELETION_URL = "https://api.yalataxi.live/yala-account-deletion/";
const POLICY_UPDATED = "October 2026";

export default function PrivacyPolicy() {
  useEffect(() => {
    // The delivery customer flow opens this page with ?return=/delivery... and uses
    // the flag to decide whether the customer still has to accept the policy.
    const params = new URLSearchParams(window.location.search);
    const next = params.get("return") || "";
    if (next.startsWith("/delivery")) {
      try {
        sessionStorage.setItem("yala_delivery_customer_privacy_read", "1");
      } catch {
        // sessionStorage can be unavailable (private browsing). Best effort only.
      }
    }

    const previousTitle = document.title;
    document.title = "Privacy Policy | Yala Technologies";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="yala-privacy">
      <header className="yala-privacy__header">
        <div className="yala-privacy__header-inner">
          <a className="yala-privacy__brand" href="/">
            <img
              className="yala-privacy__logo"
              src="/yala-nav-logo.png"
              alt="Yala Technologies"
            />
            <span className="yala-privacy__brand-text">
              <span className="yala-privacy__brand-name">Yala Technologies</span>
              <span className="yala-privacy__brand-sub">
                Ride-hailing and delivery platform for {MARKET.country}
              </span>
            </span>
          </a>
        </div>
      </header>

      <main className="yala-privacy__main">
        <article className="yala-privacy__card">
          <p className="yala-privacy__eyebrow">Public legal document</p>
          <h1 className="yala-privacy__title">Privacy Policy</h1>
          <p className="yala-privacy__meta">
            Effective date: {POLICY_UPDATED} · Applies to the Yala Rider, Yala
            Driver, and Yala Delivery applications for Android
          </p>

          <p className="yala-privacy__lead">
            This privacy policy explains how Yala collects, uses, shares, and
            protects your personal information when you use the Yala Rider, Yala
            Driver, or Yala Delivery app in {MARKET.country}. It applies to riders,
            drivers, delivery couriers, and delivery customers. You can read it at
            any time without creating an account or signing in.
          </p>

          <div className="yala-privacy__sections">
            <section className="yala-privacy__section">
              <h2>Information We Collect</h2>
              <ul>
                <li>
                  <strong>Personal information:</strong> Name, phone number, email
                  address, National ID (drivers and couriers), and profile photo
                </li>
                <li>
                  <strong>Location data:</strong> GPS coordinates during rides and
                  deliveries (pickup, route, drop-off), and background location for
                  drivers and couriers who are online
                </li>
                <li>
                  <strong>Ride and delivery history:</strong> Pickup and drop-off
                  locations, timestamps, fare and delivery amounts, service type,
                  and driver/rider or courier/customer pairings
                </li>
                <li>
                  <strong>Payment information:</strong> Payment method details
                  (Bankily, Masravi, Seddad, card, bank account), transaction
                  records, and payout details for drivers and couriers
                </li>
                <li>
                  <strong>Device information:</strong> Device type, operating
                  system, push notification tokens, and app version
                </li>
                <li>
                  <strong>Driver and courier documents:</strong> License, vehicle
                  registration, insurance, and vehicle inspection certificates
                </li>
              </ul>
            </section>

            <section className="yala-privacy__section">
              <h2>How We Use Your Information</h2>
              <ul>
                <li>
                  <strong>Ride matching:</strong> Connecting riders with nearby
                  available drivers based on location
                </li>
                <li>
                  <strong>Payments:</strong> Processing ride and delivery fares,
                  driver and courier earnings, commission calculations, and
                  withdrawals
                </li>
                <li>
                  <strong>Safety:</strong> Emergency support, live trip tracking,
                  driver and courier verification, and incident investigation
                </li>
                <li>
                  <strong>Service improvement:</strong> Analytics on ride patterns,
                  wait times, and service quality
                </li>
                <li>
                  <strong>Communications:</strong> Push notifications for ride and
                  delivery updates, promotions, and account alerts
                </li>
                <li>
                  <strong>Legal compliance:</strong> Responding to legal requests
                  and enforcing our terms of service
                </li>
              </ul>
            </section>

            <section className="yala-privacy__section yala-privacy__section--wide">
              <h2>Location and Background Location</h2>
              <p>
                Yala Rider uses your location only while the app is open, to show
                nearby drivers, set your pickup point, and follow your trip. Yala
                Rider does not request background location.
              </p>
              <p>
                Yala Driver and Yala Delivery use location while a trip or delivery
                is active, including when the app is minimised or the screen is
                locked, so riders and delivery customers can follow the trip or
                delivery in real time. On Android this runs as a location
                foreground service and shows a permanent notification ("Yala Driver
                is tracking your location" or "Yala Delivery is tracking your
                location"). Tracking stops as soon as the trip or delivery is
                completed or cancelled, or when the user signs out. Background
                location is never used for advertising or for any purpose unrelated
                to an active trip or delivery.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Data Sharing</h2>
              <ul>
                <li>
                  <strong>Riders see:</strong> Driver name, photo, vehicle details,
                  rating, and real-time location during a ride
                </li>
                <li>
                  <strong>Drivers see:</strong> Rider first name, pickup location,
                  and destination after accepting a ride
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
            </section>

            <section className="yala-privacy__section">
              <h2>Data Retention</h2>
              <p>
                We retain your account data for as long as your account is active.
                Ride history and payment records are kept for 3 years for
                accounting and dispute resolution. After account deletion, we may
                retain anonymized data for analytics. Driver documents are deleted
                within 30 days of account closure.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Your Rights</h2>
              <ul>
                <li>
                  <strong>Access:</strong> Request a copy of all personal data we
                  hold about you
                </li>
                <li>
                  <strong>Correction:</strong> Update inaccurate account, vehicle,
                  or payment information
                </li>
                <li>
                  <strong>Deletion:</strong> Request account deletion and removal of
                  personal data (subject to legal retention requirements)
                </li>
                <li>
                  <strong>Portability:</strong> Export your ride history and account
                  data
                </li>
                <li>
                  <strong>Withdraw consent:</strong> Disable location sharing or
                  push notifications at any time through device settings
                </li>
              </ul>
            </section>

            <section className="yala-privacy__section">
              <h2>Account Deletion</h2>
              <p>
                You can request deletion of your Yala account at any time by
                visiting{" "}
                <a href={ACCOUNT_DELETION_URL} target="_blank" rel="noopener noreferrer">
                  {ACCOUNT_DELETION_URL}
                </a>
                . We confirm every request and complete verified deletions within
                30 days.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Security</h2>
              <p>
                We protect your information with encryption in transit, secure
                storage of access credentials on your device, and role-based access
                controls for the staff who operate the platform. Access to personal
                data is limited to authorized personnel who need it to run the
                service, and payment details are handled by our payment partners
                rather than being stored by us in full.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Children</h2>
              <p>
                The Yala applications are intended for adults. We do not knowingly
                collect personal information from children, and accounts found to
                belong to a child are closed on request.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Changes to This Privacy Policy</h2>
              <p>
                We may update this policy as the service evolves or as the law
                requires. Material changes are announced in the applications, and
                the effective date above is updated whenever this page changes.
              </p>
            </section>

            <section className="yala-privacy__section">
              <h2>Contact Us</h2>
              <p>
                For privacy questions, data requests, or concerns, contact us at:
              </p>
              <ul>
                <li>
                  Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
                </li>
                <li>Support: {SUPPORT_SITE}</li>
                <li>
                  Account deletion:{" "}
                  <a href={ACCOUNT_DELETION_URL}>Request account deletion</a>
                </li>
                <li>Phone: {MARKET.phonePrefix}45000001</li>
              </ul>
            </section>
          </div>

          <p className="yala-privacy__updated">
            Last updated: {POLICY_UPDATED}. This policy applies to the Yala Rider,
            Yala Driver, and Yala Delivery apps available on Android.
          </p>
        </article>
      </main>

      <footer className="yala-privacy__footer">
        <p>© 2026 Yala Technologies. All rights reserved.</p>
        <p>
          <a href="/terms">Terms &amp; Conditions</a>
          <span className="yala-privacy__footer-sep">·</span>
          <a href={ACCOUNT_DELETION_URL} target="_blank" rel="noopener noreferrer">
            Account Deletion
          </a>
          <span className="yala-privacy__footer-sep">·</span>
          <a href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
        </p>
      </footer>
    </div>
  );
}

// Styling lives in ./privacyPolicy.css (imported at the top of this file) so the
// public policy stays one responsive document instead of a set of inline style
// objects, and so the desktop/mobile breakpoints are declared in one place.
