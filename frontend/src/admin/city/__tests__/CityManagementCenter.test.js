/**
 * City Management (/admin/cities) regression tests.
 *
 * Pins the defect classes found during the City Management review:
 *  1. `Number(city.latitude).toFixed(4)` rendered "NaN" for a city with no coordinates;
 *  2. the duplicate review panel reported only a count, so an administrator could not tell
 *     which cities collided or how to identify them safely;
 *  3. raw axios error strings were shown instead of an actionable message;
 *  4. the registry had no sorting.
 */
import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import CityManagementCenter from "../CityManagementCenter";
import {
  fetchCities,
  fetchCity,
  fetchCityAudit,
  fetchCityPeople,
  fetchCityPerformance,
  fetchDuplicateCities,
} from "../cityManagementApi";

jest.mock("../cityManagementApi", () => ({
  fetchCities: jest.fn(),
  fetchCity: jest.fn(),
  fetchCityPerformance: jest.fn(),
  fetchCityPeople: jest.fn(),
  fetchCityAudit: jest.fn(),
  fetchDuplicateCities: jest.fn(),
  createCity: jest.fn(),
  updateCity: jest.fn(),
  activateCity: jest.fn(),
  deactivateCity: jest.fn(),
  setCityLive: jest.fn(),
  setCityService: jest.fn(),
  updateCityPricing: jest.fn(),
  saveCityServiceArea: jest.fn(),
  SERVICE_LABELS: { rider: "YALA RIDER", driver: "YALA DRIVER", delivery: "YALA DELIVERY" },
  SERVICE_CATALOG: { rider: [], driver: [], delivery: [] },
  STATUS_LABELS: { inactive: "Inactive", registered: "Registered — not live", live: "Live" },
}));

jest.mock("../../layouts/AdminShell", () => ({
  AdminShellPage: ({ children }) => children,
}));

const CITIES = [
  { id: 1, name: "Zouerate", name_fr: "Zouérat", name_ar: "", region: "Tiris Zemmour", latitude: 22.7, longitude: -12.5, operational_status: "registered", is_active: true, is_live: false, code: "ZOU", iso_country_code: "MR" },
  { id: 2, name: "Atar", name_fr: "Atar", name_ar: "أطار", region: "Adrar", latitude: null, longitude: null, operational_status: "registered", is_active: true, is_live: false, code: "ATR", iso_country_code: "MR" },
  { id: 3, name: "Aleg", name_fr: "Aleg", name_ar: "", region: "Brakna", latitude: 17.05, longitude: -13.9, operational_status: "live", is_active: true, is_live: true, code: "", iso_country_code: "MR" },
];

beforeEach(() => {
  jest.clearAllMocks();
  fetchCities.mockResolvedValue({
    data: { cities: CITIES, regions: [{ id: 1, name: "Adrar" }], capabilities: { can_manage: true, can_ceo_actions: true, city_management_ready: true } },
  });
  fetchCity.mockResolvedValue({
    data: { city: { ...CITIES[0], services: { services: {} } }, pricing: { values: {} } },
  });
  fetchCityPerformance.mockResolvedValue({ data: { performance: {} } });
  fetchCityPeople.mockResolvedValue({ data: { drivers: [], couriers: [] } });
  fetchCityAudit.mockResolvedValue({ data: { entries: [] } });
});

// "Atar" is both the name and the French name, so text queries match twice.
// Address rows by their first-column <strong> instead.
const waitForTable = () =>
  waitFor(() => expect(document.querySelector(".cmc-table tbody tr")).not.toBeNull());

const rowFor = (name) => {
  const strongs = Array.from(document.querySelectorAll(".cmc-table tbody tr td:first-child strong"));
  const el = strongs.find((s) => s.textContent.trim() === name);
  return el ? el.closest("tr") : null;
};

test("never renders NaN for a city registered without coordinates", async () => {
  render(<CityManagementCenter />);
  await waitForTable();

  const atar = rowFor("Atar");
  expect(atar).not.toBeNull();
  expect(atar.textContent).not.toContain("NaN");
  expect(atar.textContent).toContain("—");

  // Coordinates now live in the detail panel, where a real value still renders.
  fireEvent.click(within(rowFor("Zouerate")).getByRole("button", { name: "Manage" }));
  await waitFor(() =>
    expect(document.body.textContent).toContain("22.7000, -12.5000")
  );
});

test("the registry shows the YALA region and city identification codes", async () => {
  render(<CityManagementCenter />);
  await waitForTable();

  // Zouerate carries ZOU from the server; its wilaya is Tiris Zemmour (TZM).
  const zou = rowFor("Zouerate");
  expect(zou.textContent).toContain("TZM");
  expect(zou.textContent).toContain("ZOU");
  expect(zou.textContent).toContain("MR-TZM-ZOU");

  // Atar is the Adrar wilaya seat, so its code comes from the scheme (ATR).
  const atar = rowFor("Atar");
  expect(atar.textContent).toContain("ADR");
  expect(atar.textContent).toContain("ATR");
  expect(atar.textContent).toContain("MR-ADR-ATR");
});

test("the registry can be sorted by name, toggling direction", async () => {
  render(<CityManagementCenter />);
  await waitForTable();

  const names = () =>
    Array.from(document.querySelectorAll(".cmc-table tbody tr td:first-child strong")).map((el) =>
      el.textContent.trim()
    );

  expect(names()).toEqual(["Aleg", "Atar", "Zouerate"]); // default ascending

  fireEvent.click(screen.getByRole("button", { name: /^City/ }));
  await waitFor(() => expect(names()).toEqual(["Zouerate", "Atar", "Aleg"])); // descending
});


test("the duplicate panel lists the colliding rows, not just a count", async () => {
  fetchDuplicateCities.mockResolvedValue({
    data: {
      count: 1,
      groups: {
        atar: [
          { id: 2, name: "Atar", name_fr: "Atar", region: "Adrar", latitude: 20.5, longitude: -13.0, operational_status: "registered" },
          { id: 41, name: "Atar", name_fr: "Atar ", region: "Adrar", latitude: 20.51, longitude: -13.05, operational_status: "registered" },
        ],
      },
      message: "Duplicate rows are reported only.",
    },
  });

  render(<CityManagementCenter />);
  await waitForTable();
  fireEvent.click(screen.getByRole("button", { name: /review duplicates/i }));

  await waitFor(() => expect(screen.getByText(/1 group/i)).toBeInTheDocument());

  // Both record IDs must be visible so an administrator can identify them safely.
  const panel = document.querySelector(".cmc-duplicates");
  expect(panel).not.toBeNull();
  expect(panel.textContent).toContain("2");
  expect(panel.textContent).toContain("41");
  expect(panel.textContent).toMatch(/read-only/i);
  // Nothing in the panel may offer a destructive control.
  expect(within(panel).queryByRole("button", { name: /delete|merge|remove/i })).not.toBeInTheDocument();
});

test("flags two registry rows that share one YALA identification", async () => {
  fetchCities.mockResolvedValue({
    data: {
      cities: [
        { id: 8, name: "Atar", name_fr: "Atar", name_ar: "", region: "Adrar", latitude: 20.51, longitude: -13.04, operational_status: "registered", is_active: true, is_live: false, code: "ATR", iso_country_code: "MR" },
        { id: 3, name: "Atar", name_fr: "Atar", name_ar: "", region: "Atar", latitude: 20.51, longitude: -13.04, operational_status: "registered", is_active: true, is_live: false, code: "", iso_country_code: "MR" },
      ],
      regions: [],
      capabilities: { can_manage: true, can_ceo_actions: true, city_management_ready: true },
    },
  });

  render(<CityManagementCenter />);
  await waitForTable();

  // Both rows resolve to MR-ADR-ATR, which is what exposes the duplication.
  const flagged = document.querySelectorAll(".cmc-flag--dup");
  expect(flagged.length).toBe(2);
  expect(document.body.textContent).toMatch(/duplicate identifications/i);
});

test("a unique city is never flagged as a duplicate identification", async () => {
  render(<CityManagementCenter />);
  await waitForTable();

  expect(rowFor("Zouerate").textContent).not.toMatch(/duplicate id/i);
  expect(rowFor("Aleg").textContent).not.toMatch(/duplicate id/i);
});

test("a 404 names a deployment problem rather than the raw axios string", async () => {
  fetchCities.mockRejectedValue({ response: { status: 404, data: "<html>Not Found</html>" } });

  render(<CityManagementCenter />);

  await waitFor(() => expect(screen.getByText(/not found on this backend/i)).toBeInTheDocument());
  expect(document.body.textContent).not.toMatch(/Request failed with status code/i);
});

test("live operations stay disabled for a role without CEO authority", async () => {
  fetchCities.mockResolvedValue({
    data: {
      cities: CITIES,
      regions: [],
      capabilities: { can_manage: true, can_ceo_actions: false, city_management_ready: true },
    },
  });

  render(<CityManagementCenter />);
  await waitForTable();
  // Atar is registered (not live), so its button reads "Open Live Operations".
  // The row order is sorted by name, so address it by name rather than index.
  fireEvent.click(within(rowFor("Atar")).getByRole("button", { name: "Manage" }));

  const liveBtn = await screen.findByRole("button", { name: /open live operations/i });
  expect(liveBtn).toBeDisabled();
  expect(liveBtn).toHaveAttribute("title", "Only the Founder/CEO can open live operations.");
});

