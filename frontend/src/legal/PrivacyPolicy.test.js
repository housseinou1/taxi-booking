import { render, screen } from "@testing-library/react";

import PrivacyPolicy from "./PrivacyPolicy";

/**
 * Google Play compliance guard for the published privacy policy.
 *
 * These assertions lock in the disclosures Play requires. They exist because the
 * policy previously published at /privacy was an inline copy in App.js that
 * omitted the background-location disclosure for Yala Driver and Yala Delivery,
 * while both apps declare ACCESS_BACKGROUND_LOCATION. See App.test.js for the
 * routing half of this guard.
 */
describe("PrivacyPolicy", () => {
  beforeEach(() => {
    render(<PrivacyPolicy />);
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
});
