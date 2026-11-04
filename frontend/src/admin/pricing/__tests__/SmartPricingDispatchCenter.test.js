/**
 * SmartPricingDispatchCenter (/admin/smart-pricing) — Dispatch Management.
 *
 * REGRESSION GUARDS (why this file exists):
 *  - Every write handler was `async` with no catch, so a rejected PATCH produced
 *    an unhandled rejection and NO feedback: the control silently reverted.
 *  - The dispatch-weight inputs PATCHed on every keystroke, so typing "0.5"
 *    issued three writes ("0", "0.", "0.5").
 *  - The city filter was a native <select>, and the raw axios error string
 *    ("Request failed with status code 500") was rendered to the operator.
 *  - The surge max multiplier fabricated 2.5 when the API omitted it.
 *  - Pricing edits were silently pinned to ride_type "regular" with no control.
 *  - Changing the region must clear the chosen city, or the engine stays scoped
 *    to a city outside the region the operator selected.
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import SmartPricingDispatchCenter from "../SmartPricingDispatchCenter";
import * as api from "../smartPricingApi";

jest.mock("../smartPricingApi");

const DASHBOARD = {
  engine_flags: {
    enabled: true,
    smart_dispatch_enabled: true,
    dynamic_pricing_enabled: false,
    surge_pricing_enabled: false,
  },
  dispatch_rules: { weights: { distance: 0.3, eta: 0.25 } },
  pricing_rules: { base_fare: "200.00" },
  surge: { config: { enabled: false }, zones: [] },
  dispatch_analytics: {},
  dispatch_insights: { rides: [] },
  audit_trail: [],
  cities: [{ id: 1, name: "Nouakchott" }],
};

const TREE = [
  { id: 7, name: "Adrar", cities: [{ id: 11, name: "Aoujeft" }, { id: 12, name: "Atar" }] },
  { id: 8, name: "Dakhlet Nouadhibou", cities: [{ id: 30, name: "Nouadhibou" }] },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.fetchSmartEngineDashboard.mockResolvedValue(DASHBOARD);
  api.fetchCeoDashboard.mockResolvedValue({});
  api.fetchRegionCityTree.mockResolvedValue(TREE);
  api.updateEngineFlags.mockResolvedValue({});
  api.updateDispatchRules.mockResolvedValue({});
  api.updatePricingRules.mockResolvedValue({});
  api.updateSurgeConfig.mockResolvedValue({});
  api.runPricingSimulation.mockResolvedValue({ result: { customer_price: "250.00" } });
});

const renderCenter = async () => {
  const utils = render(<SmartPricingDispatchCenter />);
  await waitFor(() => expect(api.fetchSmartEngineDashboard).toHaveBeenCalled());
  await screen.findByText("Engine feature flags");
  return utils;
};

describe("SmartPricingDispatchCenter — controls", () => {
  test("renders the engine flags from the API", async () => {
    await renderCenter();
    expect(screen.getByText("Master engine")).toBeInTheDocument();
    expect(screen.getByText("Smart dispatch")).toBeInTheDocument();
    expect(screen.getByText("Dynamic pricing")).toBeInTheDocument();
  });

  test("no native <select> remains on the page", async () => {
    const { container } = await renderCenter();
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });
});


describe("SmartPricingDispatchCenter — write safety", () => {
  const goToDispatchTab = async () => {
    await renderCenter();
    fireEvent.click(screen.getByRole("button", { name: /intelligent dispatch/i }));
    await screen.findByText("Dispatch scoring weights");
  };

  test("REGRESSION: a dispatch weight writes on blur, not on every keystroke", async () => {
    await goToDispatchTab();
    const input = screen.getByDisplayValue("0.3");

    // Typing must not write. This previously issued one PATCH per character.
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "0." } });
    fireEvent.change(input, { target: { value: "0.5" } });
    expect(api.updateDispatchRules).not.toHaveBeenCalled();

    fireEvent.blur(input, { target: { value: "0.5" } });
    await waitFor(() => expect(api.updateDispatchRules).toHaveBeenCalledTimes(1));
    expect(api.updateDispatchRules).toHaveBeenCalledWith(
      { weights: expect.objectContaining({ distance: 0.5 }) },
      undefined
    );
  });

  test("REGRESSION: a rejected save surfaces an error instead of failing silently", async () => {
    await goToDispatchTab();
    api.updateDispatchRules.mockRejectedValue({
      response: { status: 500, data: { detail: "engine offline" } },
    });

    fireEvent.blur(screen.getByDisplayValue("0.3"), { target: { value: "0.4" } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/backend error/i);
    expect(alert).toHaveTextContent(/engine offline/i);
  });

  test("REGRESSION: a rejected flag toggle reports the failure", async () => {
    await renderCenter();
    api.updateEngineFlags.mockRejectedValue({ response: { status: 403 } });

    fireEvent.click(screen.getByLabelText(/master engine/i));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/access denied/i);
  });

  test("REGRESSION: a non-numeric weight is rejected without writing", async () => {
    await goToDispatchTab();
    fireEvent.blur(screen.getByDisplayValue("0.3"), { target: { value: "abc" } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/must be a number/i);
    expect(api.updateDispatchRules).not.toHaveBeenCalled();
  });

  test("REGRESSION: never renders a raw axios error string", async () => {
    api.fetchSmartEngineDashboard.mockRejectedValue({ response: { status: 500 } });
    render(<SmartPricingDispatchCenter />);

    await waitFor(() =>
      expect(screen.getByText(/backend failed while trying to load/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/Request failed with status code/i)).not.toBeInTheDocument();
  });

  test("an unreachable backend is reported as unreachable, not as missing data", async () => {
    api.fetchSmartEngineDashboard.mockRejectedValue(new Error("Network Error"));
    render(<SmartPricingDispatchCenter />);

    await waitFor(() =>
      expect(screen.getByText(/could not reach the yala backend/i)).toBeInTheDocument()
    );
  });
});

describe("SmartPricingDispatchCenter — honesty", () => {
  test("REGRESSION: surge max multiplier does not fabricate 2.5 when unset", async () => {
    await renderCenter();
    fireEvent.click(screen.getByRole("button", { name: /surge pricing/i }));
    await screen.findByText("Surge controls (CEO)");

    const input = screen.getByLabelText(/max multiplier/i);
    expect(input).toHaveValue(null);
    expect(input).not.toHaveValue(2.5);
  });

  test("pricing rules state which ride type they are scoped to", async () => {
    await renderCenter();
    fireEvent.click(screen.getByRole("button", { name: /dynamic pricing/i }));
    await screen.findByText(/dynamic pricing rules/i);

    // Previously hard-coded to "regular" with no indication in the UI.
    expect(screen.getByText(/dynamic pricing rules — regular/i)).toBeInTheDocument();
  });
});

describe("SmartPricingDispatchCenter — Region/Wilaya -> City dependent filters", () => {
  test("region and city are both searchable comboboxes, not native selects", async () => {
    const { container } = await renderCenter();
    await waitFor(() => expect(api.fetchRegionCityTree).toHaveBeenCalled());
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(screen.getByText("Region / Wilaya")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
  });

  test("a city-seat row that resolves to its parent wilaya is disambiguated", async () => {
    // The Region table holds true wilayas AND city-seat rows. "Atar" is the seat of
    // the Adrar wilaya, so resolveRegion maps it to "Adrar" — two rows would render
    // the identical label and the operator could not tell 4-city Adrar from
    // 1-city Atar. The raw name must appear for the seat row.
    api.fetchRegionCityTree.mockResolvedValue([
      { id: 7, name: "Adrar", cities: [{ id: 11, name: "Aoujeft" }] },
      { id: 3, name: "Atar", cities: [{ id: 12, name: "Atar" }] },
    ]);
    await renderCenter();
    await waitFor(() => expect(api.fetchRegionCityTree).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    const labels = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(labels.some((l) => /^Adrar/.test(l) && !/Atar/.test(l))).toBe(true);
    expect(labels.some((l) => /Atar/.test(l))).toBe(true);
  });

  test("city options are scoped to the chosen region (dependent dropdown)", async () => {
    await renderCenter();
    await waitFor(() => expect(api.fetchRegionCityTree).toHaveBeenCalled());

    // With no region chosen, every city is offered.
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    const all = (await screen.findAllByRole("option")).map((o) => o.textContent).join("|");
    expect(all).toMatch(/Aoujeft/);
    expect(all).toMatch(/Nouadhibou/);
    // Close by toggling the same trigger. A keydown on `document` does NOT reach
    // the component (it listens on its own root), which would leave the popup open
    // and swallow the next trigger click.
    fireEvent.click(screen.getAllByRole("combobox")[1]);

    // Choose a region; the city list must narrow to that region only.
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: /Adrar/ }));

    fireEvent.click(screen.getAllByRole("combobox")[1]);
    const scoped = (await screen.findAllByRole("option")).map((o) => o.textContent).join("|");
    expect(scoped).toMatch(/Aoujeft/);
    expect(scoped).not.toMatch(/Nouadhibou/);
  });

  test("REGRESSION: changing the region clears the previously selected city", async () => {
    await renderCenter();
    await waitFor(() => expect(api.fetchRegionCityTree).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: /Adrar/ }));
    fireEvent.click(screen.getAllByRole("combobox")[1]);
    fireEvent.click(await screen.findByRole("option", { name: /Aoujeft/ }));

    // The engine is now scoped to Aoujeft (city id 11).
    await waitFor(() =>
      expect(api.fetchSmartEngineDashboard).toHaveBeenCalledWith({ city_id: "11" })
    );

    // Switching region must drop that city, or the engine stays scoped to a city
    // that is not in the newly chosen region.
    fireEvent.click(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: /Nouadhibou/ }));
    await waitFor(() =>
      expect(api.fetchSmartEngineDashboard).toHaveBeenLastCalledWith({})
    );
  });

  test("a failed region load degrades to the engine's city list, and says so", async () => {
    api.fetchRegionCityTree.mockRejectedValue({ response: { status: 500 } });
    await renderCenter();

    await waitFor(() =>
      expect(screen.getByText(/region and city filters are limited/i)).toBeInTheDocument()
    );
    // The page itself still works.
    expect(screen.getByText("Engine feature flags")).toBeInTheDocument();
  });
});

