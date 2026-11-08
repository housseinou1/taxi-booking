import { applyWebsiteSeo } from "../websiteSeo";

describe("websiteSeo", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.title = "";
  });

  test("sets YALA Technologies branding on home (EN)", () => {
    applyWebsiteSeo("home", "en");
    expect(document.title).toMatch(/YALA Technologies/);
    expect(document.querySelector('link[rel="canonical"]')?.href).toBe(
      "https://www.yalataxi.live/"
    );
    expect(document.querySelector('meta[name="robots"]')?.content).toBe("index, follow");
    expect(document.getElementById("yala-jsonld-org")).toBeTruthy();
  });

  test("French home metadata", () => {
    applyWebsiteSeo("home", "fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(document.title).toMatch(/Mauritanie/);
  });

  test("rider page canonical is marketing path only", () => {
    applyWebsiteSeo("rider", "en");
    expect(document.querySelector('link[rel="canonical"]')?.href).toBe(
      "https://www.yalataxi.live/website/rider"
    );
  });
});
