import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the Yala landing page", () => {
  render(<App />);
  const brandElements = screen.getAllByText(/yala/i);
  expect(brandElements.length).toBeGreaterThan(0);
});
