import fs from "fs";
import path from "path";

function readSource(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

describe("YALA ecosystem design-system integration", () => {
  it.each([
    ["Rider", "rider/tokens.css"],
    ["Driver", "driver/driver-tokens.css"],
    ["Delivery", "delivery/delivery-uber.css"],
  ])("%s imports the shared token source", (_app, file) => {
    expect(readSource(file)).toMatch(/design-system\/tokens\/index\.css/);
  });

  it("loads the shared system and ThemeProvider at the application root", () => {
    const indexSource = readSource("index.js");
    expect(indexSource).toContain('import "./design-system"');
    expect(indexSource).toContain("YalaThemeProvider");
  });

  it("keeps app accents inside the shared token contract", () => {
    const tokens = readSource("design-system/tokens/index.css");
    expect(tokens).toContain('[data-yala-app="rider"]');
    expect(tokens).toContain('[data-yala-app="driver"]');
    expect(tokens).toContain('[data-yala-app="delivery"]');
    expect(tokens).toContain("--yds-btn-height-md");
    expect(tokens).toContain("--yds-input-height");
  });

  it("routes cross-app state components through the design system", () => {
    expect(readSource("components/YalaEmptyState.js")).toContain("design-system/components/EmptyState");
    expect(readSource("components/YalaLoadingState.js")).toContain("design-system/components/LoadingState");
    expect(readSource("components/YalaErrorState.js")).toContain("design-system/components/ErrorState");
  });
});
