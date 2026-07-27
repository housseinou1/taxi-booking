import fs from "fs";
import path from "path";
import { YALA_SEMANTIC_COLORS } from "./tokens/semantic";
import { YALA_SPACING } from "./tokens/spacing";
import { YALA_TYPOGRAPHY } from "./tokens/typography";

const tokensDir = path.join(__dirname, "tokens");

function readTokenCss(name) {
  return fs.readFileSync(path.join(tokensDir, name), "utf8");
}

describe("YALA design system tokens (Mission 2)", () => {
  it("defines semantic color roles in CSS", () => {
    const semantic = readTokenCss("semantic.css");
    expect(semantic).toContain("--yds-color-primary");
    expect(semantic).toContain("--yds-color-primary-variant");
    expect(semantic).toContain("--yds-color-background");
    expect(semantic).toContain("--yds-color-online");
    expect(semantic).toContain("--yds-color-expired");
  });

  it("defines typography role classes", () => {
    const typography = readTokenCss("typography.css");
    expect(typography).toContain(".yds-type-display");
    expect(typography).toContain(".yds-type-headline");
    expect(typography).toContain(".yds-type-button");
  });

  it("defines breakpoints and component tokens", () => {
    expect(readTokenCss("breakpoints.css")).toContain("--yds-bp-md");
    const components = readTokenCss("component-tokens.css");
    expect(components).toContain("--yds-dialog-radius");
    expect(components).toContain("--yds-icon-md");
    expect(components).toContain("--yds-snackbar-radius");
  });

  it("uses 48px minimum touch target in foundation", () => {
    const index = readTokenCss("index.css");
    expect(index).toMatch(/--yds-touch:\s*48px/);
  });

  it("exports JS spacing scale on 8pt grid", () => {
    expect(YALA_SPACING[4]).toBe(16);
    expect(YALA_SPACING[12]).toBe(48);
  });

  it("exports semantic colors for programmatic use", () => {
    expect(YALA_SEMANTIC_COLORS.primary).toBe("#00a651");
    expect(YALA_SEMANTIC_COLORS.approved).toBe(YALA_SEMANTIC_COLORS.success);
  });

  it("documents typography roles in JS", () => {
    expect(YALA_TYPOGRAPHY.fontFamily).toContain("Plus Jakarta Sans");
    expect(YALA_TYPOGRAPHY.body.size).toBe("1rem");
  });
});
