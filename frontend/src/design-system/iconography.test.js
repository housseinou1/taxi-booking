import { iconNames } from "./components/Icon";

const ECOSYSTEM_ICONS = [
  "home",
  "earnings",
  "trips",
  "vehicle",
  "delivery",
  "wallet",
  "history",
  "support",
  "settings",
  "notifications",
  "profile",
  "navigation",
  "documents",
  "warning",
];

describe("YALA shared iconography", () => {
  it("exposes canonical ecosystem navigation icons", () => {
    for (const name of ECOSYSTEM_ICONS) {
      expect(iconNames).toContain(name);
    }
  });
});
