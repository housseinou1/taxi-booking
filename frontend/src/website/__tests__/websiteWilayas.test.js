import { WEBSITE_WILAYAS } from "../websiteWilayas";

describe("website wilaya catalog", () => {
  test("lists 13 regional capitals", () => {
    expect(WEBSITE_WILAYAS).toHaveLength(13);
    const regions = new Set(WEBSITE_WILAYAS.map((r) => r.region));
    expect(regions.size).toBe(13);
    expect(WEBSITE_WILAYAS.find((r) => r.city === "Nouakchott")).toBeTruthy();
    expect(WEBSITE_WILAYAS.find((r) => r.region === "Hodh El Gharbi")?.city).toMatch(/Ayoun/i);
  });
});
