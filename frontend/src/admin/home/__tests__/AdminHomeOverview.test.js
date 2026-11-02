import { SIDEBAR_NAV_ITEMS, flattenNavItems } from "../../layouts/permissions/sidebarNavConfig";
import { PATH_MODULE_MAP } from "../../layouts/permissions/adminRouteAccess";
import { hasAdminIcon } from "../../layouts/icons/AdminIcon";
import {
  MANAGEMENT_MODULES,
  QUICK_ACCESS_ITEMS,
  activityStatus,
  periodChange,
  relativeTime,
  rideStatusSlices,
} from "../AdminHomeOverview";

function allNavNodes(items) {
  return items.flatMap((item) => [item, ...(item.children ? allNavNodes(item.children) : [])]);
}

describe("YALA admin redesign", () => {
  it("maps every sidebar title and submenu title to an SVG icon", () => {
    const nodes = allNavNodes(SIDEBAR_NAV_ITEMS);
    expect(nodes.length).toBeGreaterThan(0);
    nodes.forEach((node) => {
      expect(hasAdminIcon(node.icon)).toBe(true);
    });
  });

  it("links every Quick Access card to a registered admin route", () => {
    QUICK_ACCESS_ITEMS.forEach((item) => {
      expect(PATH_MODULE_MAP[item.path]).toBeDefined();
      expect(hasAdminIcon(item.icon)).toBe(true);
    });
    expect(flattenNavItems(SIDEBAR_NAV_ITEMS).length).toBeGreaterThan(QUICK_ACCESS_ITEMS.length);
  });

  it("links every Management Module card to a registered admin route", () => {
    MANAGEMENT_MODULES.forEach((item) => {
      expect(PATH_MODULE_MAP[item.path]).toBeDefined();
      expect(hasAdminIcon(item.icon)).toBe(true);
    });
  });

  it("computes the revenue period change only when both periods have data", () => {
    const series = [1, 1, 1, 2, 2, 2].map((value) => ({ value }));
    expect(periodChange(series, 3)).toBe(100);
    expect(periodChange(series.slice(0, 4), 3)).toBeNull();
    expect(periodChange([0, 0, 5, 5].map((value) => ({ value })), 2)).toBeNull();
  });

  it("builds ride status slices from API counts without inventing statuses", () => {
    expect(rideStatusSlices(null)).toEqual([]);
    const slices = rideStatusSlices({ total_rides: 10, completed_rides: 7, active_rides: 1, cancelled_rides: 2 });
    expect(slices.map((s) => s.key)).toEqual(["completed", "active", "cancelled"]);
    const withOther = rideStatusSlices({ total_rides: 12, completed_rides: 7, active_rides: 1, cancelled_rides: 2 });
    expect(withOther.find((s) => s.key === "other").value).toBe(2);
  });

  it("formats activity times relative to now", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    expect(relativeTime("2026-10-30T11:58:00Z", now)).toBe("2 min ago");
    expect(relativeTime("2026-10-30T09:00:00Z", now)).toBe("3 h ago");
    expect(relativeTime("not a date", now)).toBe("—");
  });

  it("derives activity status tones from recorded audit text only", () => {
    expect(activityStatus({ action: "status_change", summary: "Driver application approved" }).tone).toBe("success");
    expect(activityStatus({ action: "admin_action", summary: "Document rejected" }).tone).toBe("danger");
    expect(activityStatus({ action: "payment_change", summary: "Withdrawal request pending" }).tone).toBe("warning");
    expect(activityStatus({ high_risk: true, summary: "anything" }).label).toBe("High risk");
    expect(activityStatus({ action: "login" }).tone).toBe("neutral");
  });
});
