import { render, screen } from "@testing-library/react";

import PrivacyPolicy from "./PrivacyPolicy";

/**
 * Google Play compliance guard for the published privacy policy.
 *
 * These assertions lock in the disclosures Play requires AND the two properties the
 * page must keep as a public document:
 *
 *  - it is readable with no account and no session at all;
 *  - it shows no application navigation (no Rider / Driver / Admin / Settings /
 *    Logout), because it is a standalone legal page.
 *
 * Background: the policy previously published at /privacy was an inline copy in
 * App.js that omitted the background-location disclosure for Yala Driver and Yala
 * Delivery, while both apps declare ACCESS_BACKGROUND_LOCATION. See App.test.js for
 * the routing half of this guard.
 */
describe("PrivacyPolicy", () => {
  let container;

  beforeEach(() => {
    ({ container } = render(<PrivacyPolicy />));
  });

  it("names all three Yala applications", () => {
    expect(
      screen.getByRole("heading", { level: 1, name: "Privacy Policy" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Yala Rider, Yala Driver, or Yala Delivery/)
    ).toBeInTheDocument();
  });

  it("discloses background location and how tracking is bounded", () => {
    expect(
      screen.getByRole("heading", { name: "Location and Background Location" })
    ).toBeInTheDocument();
    // Rider is foreground-only: the manifests strip FOREGROUND_SERVICE_LOCATION.
    expect(
      screen.getByText(/Yala Rider does not request background location/)
    ).toBeInTheDocument();
    // Driver/Delivery run the native location foreground service.
    expect(screen.getByText(/foreground service/)).toBeInTheDocument();
    expect(
      screen.getByText(/Tracking stops as soon as the trip or delivery is/)
    ).toBeInTheDocument();
  });

  it("documents retention, deletion, payment data and support contact", () => {
    expect(screen.getByText(/3 years/)).toBeInTheDocument();
    expect(screen.getByText(/deleted within 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/support@yalataxi\.live/)).toBeInTheDocument();
    expect(
      screen.getByText(/api\.yalataxi\.live\/yala-account-deletion/)
    ).toBeInTheDocument();
    // Payment data categories are disclosed (provider names + card/bank).
    expect(screen.getByText(/Payment method details/)).toBeInTheDocument();
  });

  it("does not claim platforms the apps are not published on", () => {
    expect(screen.queryByText(/iOS/i)).not.toBeInTheDocument();
  });

  it("renders no application navigation", () => {
    // A public legal document must not offer app chrome. The page renders only its
    // own brand header and legal footer, so there is no <nav>, no button, and none
    // of the Rider / Driver / Admin / Settings / Logout affordances.
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /log ?out/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Settings$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Admin$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Rider$/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^Driver$/ })).toBeNull();
  });

  it("keeps the official support address and the account-deletion path working", () => {
    expect(
      screen.getByRole("link", { name: "support@yalataxi.live" })
    ).toHaveAttribute("href", "mailto:support@yalataxi.live");

    // Account deletion must stay reachable from the policy itself, so the policy and
    // the account-deletion page cannot drift apart.
    const deletionLinks = screen.getAllByRole("link", { name: /account deletion/i });
    expect(deletionLinks.length).toBeGreaterThan(0);
    deletionLinks.forEach((link) => {
      expect(link).toHaveAttribute(
        "href",
        "https://api.yalataxi.live/yala-account-deletion/"
      );
    });
  });

  it("contains no internal development instructions", () => {
    const text = container.textContent;
    // Statements that belong in engineering docs, not in a published policy.
    expect(text).not.toMatch(/frontend code/i);
    expect(text).not.toMatch(/Android Keystore/i);
    expect(text).not.toMatch(/Admin access is limited/i);
    // The repository marks unresolved internal work as TODO / [CONFIRM] / "internal".
    // None of that may ever reach the public policy. (Lower-case "confirm" is ordinary
    // user-facing wording — "we confirm every request" — and must not trip this.)
    expect(text).not.toMatch(/\bTODO\b/);
    expect(text).not.toMatch(/\[CONFIRM\]/);
    expect(text).not.toMatch(/internal use only/i);
  });
});

