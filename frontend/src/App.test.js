import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the Sakho Express landing page", () => {
  render(<App />);
  // The landing page always shows the brand name
  const brandElements = screen.getAllByText(/sakho express/i);
  expect(brandElements.length).toBeGreaterThan(0);
});
