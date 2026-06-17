import {
  canAccessPage,
  getDashboardPath,
  getSafeRedirectPath,
  getUserRole,
} from "./roleRouting";

const admin = { user_type: "rider", is_staff: true, is_superuser: true };
const driver = { user_type: "driver", is_driver: true, is_staff: false };
const rider = { user_type: "rider", is_driver: false, is_staff: false };

test("identifies Admin, Driver, and Rider roles", () => {
  expect(getUserRole(admin)).toBe("admin");
  expect(getUserRole(driver)).toBe("driver");
  expect(getUserRole(rider)).toBe("rider");
  expect(getUserRole({ user: { user_type: "driver", is_driver: "true" } })).toBe("driver");
  expect(getUserRole({ user: { user_type: "rider", is_driver: "false" } })).toBe("rider");
});

test("returns the correct dashboard for every role", () => {
  expect(getDashboardPath(admin)).toBe("/admin");
  expect(getDashboardPath(driver)).toBe("/driver");
  expect(getDashboardPath(rider)).toBe("/rider-dashboard");
});

test("rejects stale redirects into another role dashboard", () => {
  expect(getSafeRedirectPath(admin, "/driver")).toBe("/admin");
  expect(getSafeRedirectPath(rider, "/driver")).toBe("/rider-dashboard");
  expect(getSafeRedirectPath(driver, "/admin")).toBe("/driver");
});

test("allows only the correct role to access protected dashboards", () => {
  expect(canAccessPage(admin, "admin")).toBe(true);
  expect(canAccessPage(driver, "admin")).toBe(false);
  expect(canAccessPage(rider, "driver")).toBe(false);
  expect(canAccessPage(driver, "driver")).toBe(true);
  expect(canAccessPage(admin, "driver")).toBe(false);
  expect(canAccessPage(rider, "rider-dashboard")).toBe(true);
  expect(canAccessPage(rider, "driver-documents")).toBe(false);
  expect(canAccessPage(rider, "driver-code")).toBe(false);
  expect(canAccessPage(driver, "driver-documents")).toBe(true);
  expect(canAccessPage(driver, "driver-code")).toBe(true);
  expect(canAccessPage(driver, "rider-dashboard")).toBe(false);
});
