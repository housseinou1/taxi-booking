import { loadWebsiteCityCatalog } from "../websitePublicCities";

describe("loadWebsiteCityCatalog", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("falls back to /locations/cities/ when operating-cities returns 404", async () => {
    global.fetch = jest.fn((url) => {
      const path = String(url);
      if (path.includes("/locations/operating-cities/")) {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (path.includes("/locations/cities/")) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 1, name: "Nouakchott", is_active: true },
            { id: 2, name: "Rosso", is_active: true },
          ],
        });
      }
      return Promise.reject(new Error("unexpected"));
    });

    const data = await loadWebsiteCityCatalog();
    expect(data.availabilityKnown).toBe(true);
    expect(data.apiError).toBeNull();
    expect(data.availabilitySource).toBe("locations/cities");
    const nouakchott = data.entries.find((e) => e.city === "Nouakchott");
    expect(nouakchott?.serviceStatus).toBe("live");
  });

  test("marks cities unknown when both endpoints fail", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) })
    );
    const data = await loadWebsiteCityCatalog();
    expect(data.availabilityKnown).toBe(false);
    expect(data.apiError).toBeTruthy();
    expect(data.entries.every((e) => e.serviceStatus === "unknown")).toBe(true);
  });
});
