import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the Yala landing page", () => {
  render(<App />);
  const brandElements = screen.getAllByText(/yala/i);
  expect(brandElements.length).toBeGreaterThan(0);
});

/**
 * Google Play compliance guard for the published privacy policy route.
 *
 * Regression test: /privacy used to render an inline copy of the policy defined
 * inside App.js, which omitted the background-location disclosure. Yala Driver
 * and Yala Delivery both declare ACCESS_BACKGROUND_LOCATION, so the published
 * policy was not compliant. The route must now serve the dedicated
 * legal/PrivacyPolicy component, and it must do so with no account and no session.
 */
test("serves the compliant privacy policy at /privacy without authentication", async () => {
  window.history.pushState({}, "", "/privacy");
  render(<App />);

  expect(
    await screen.findByText(/Yala Rider does not request background location/)
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Location and Background Location" })
  ).toBeInTheDocument();
});

/**
 * The official public address is /privacy, but Google Play listings and printed
 * material still point at /privacy-policy. That legacy address must not fall
 * through to the marketing landing page (which is what used to happen because it
 * was never routed): it has to serve the policy and canonicalise to /privacy.
 */
test("redirects the legacy /privacy-policy address to /privacy", async () => {
  window.history.pushState({}, "", "/privacy-policy");
  render(<App />);

  expect(
    await screen.findByText(/Yala Rider does not request background location/)
  ).toBeInTheDocument();
  expect(window.location.pathname).toBe("/privacy");
});

/**
 * A public legal page must not carry application chrome. Both policy addresses must
 * render the standalone document — no Rider / Driver / Admin / Settings / Logout.
 */
test("privacy policy renders no application navigation", async () => {
  window.history.pushState({}, "", "/privacy");
  const { container } = render(<App />);

  await screen.findByText(/Yala Rider does not request background location/);
  expect(container.querySelector("nav")).toBeNull();
  expect(screen.queryByRole("button", { name: /log ?out/i })).toBeNull();
});

/**
 * The homepage footer must publish the official support address, not a personal one.
 */
test("homepage footer uses the official support email", async () => {
  window.history.pushState({}, "", "/");
  render(<App />);

  expect(await screen.findByText("support@yalataxi.live")).toBeInTheDocument();
  expect(screen.queryByText(/sakhohousseinou@gmail\.com/)).toBeNull();
});

afterEach(() => {
  // Restore the default route so the other tests see a clean location.
  window.history.pushState({}, "", "/");
});

