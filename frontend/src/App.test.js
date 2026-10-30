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
 * legal/PrivacyPolicy component.
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

afterEach(() => {
  // Restore the default route so the other tests see a clean location.
  window.history.pushState({}, "", "/");
});
