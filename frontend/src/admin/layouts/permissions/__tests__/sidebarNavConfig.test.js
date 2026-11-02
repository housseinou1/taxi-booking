/**
 * Phase 1 tests: professional Admin navigation + backend-aligned route access.
 *
 * These guard the Yala Admin information architecture: every sidebar item must
 * resolve to a path that the route guard maps to a known backend module, and
 * role visibility must be honoured.
 */
import {
  SIDEBAR_NAV_ITEMS,
  filterNavItems,
  flattenNavItems,
  resolveNavPath,
} from "../sidebarNavConfig";
import {
  PATH_MODULE_MAP,
  MODULE_LABELS,
  canAccessPath,
  getModuleForPath,
  resolveRegisteredAdminHome,
} from "../adminRouteAccess";

/**
 * The approved 12-group enterprise sidebar. Top-level entries are business
 * categories; the individual management pages live inside them.
 */
const REQUIRED_GROUPS = [
  "Home Dashboard",
  "Executive Command Center",
  "Operations",
  "Drivers & Fleet",
  "Riders",
  "Yala Delivery",
  "Employees & Human Resources",
  "Customer Support",
  "Finance",
  "Security & Compliance",
  "Growth & Analytics",
  "Platform Management",
];

/** Management pages that must stay reachable from inside those groups. */
const REQUIRED_PAGES = [
  "Ride Management",
  "Driver Management",
  "Rider Management",
  "Courier Management",
  "Merchant Management",
  "CEO Command Center",
  "Operations Overview",
  "Support Dashboard",
  "Payment Management",
  "Security Dashboard",
  "System Status",
];

/**
 * Mojibake signature: UTF-8 bytes decoded as Latin-1/Cp1252 (`🏠` → `ðŸ`). The
 * sidebar icons are emoji, so the guard targets the corruption rather than
 * rejecting every non-ASCII glyph.
 */
const MOJIBAKE = /[\uFFFD\u00C2\u00C3\u00B0\u00E2\u20AC]/;

describe("Yala Admin sidebar navigation", () => {
  it("exposes every required management section", () => {
    const groups = SIDEBAR_NAV_ITEMS.map((item) => item.label);
    REQUIRED_GROUPS.forEach((group) => {
      expect(groups).toContain(group);
    });

    // The management pages must still be reachable inside the groups.
    const pages = flattenNavItems(SIDEBAR_NAV_ITEMS).map((item) => item.label);
    REQUIRED_PAGES.forEach((page) => {
      expect(pages).toContain(page);
    });
  });

  it("uses the official application names and no corrupted icon glyphs", () => {
    const labels = SIDEBAR_NAV_ITEMS.map((item) => item.label).join(" ");
    expect(labels).toContain("Yala Delivery");

    const assertIcon = (icon) => {
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
      expect(MOJIBAKE.test(icon)).toBe(false);
    };

    SIDEBAR_NAV_ITEMS.forEach((item) => {
      assertIcon(item.icon);
      (item.children || []).forEach((child) => assertIcon(child.icon));
    });
  });

  it("gives every navigable item a path that the route guard knows", () => {
    const leaves = flattenNavItems(SIDEBAR_NAV_ITEMS);
    leaves.forEach((leaf) => {
      const path = leaf.getPath ? leaf.getPath({ home_route: "/admin/home/ops" }) : leaf.path;
      expect(typeof path).toBe("string");
      expect(PATH_MODULE_MAP[path]).toBeDefined();
      // The mapped module must match the nav item's declared module.
      expect(PATH_MODULE_MAP[path]).toBe(leaf.module);
    });
  });

  it("hides modules the role is not granted", () => {
    const permissions = {
      role: "ops",
      elevated: false,
      modules: ["home", "ops", "rides"],
      feature_flags: {},
    };
    const items = filterNavItems(permissions);
    const groups = items.map((item) => item.label);

    // Granted modules stay visible...
    expect(groups).toContain("Home Dashboard");
    expect(groups).toContain("Operations");

    // ...and every ungranted one is gone.
    expect(groups).not.toContain("Finance");
    expect(groups).not.toContain("Security & Compliance");
    expect(groups).not.toContain("Yala Delivery");
    expect(groups).not.toContain("Executive Command Center");
    expect(groups).not.toContain("Platform Management");
    expect(groups).not.toContain("Growth & Analytics");
    expect(groups).not.toContain("Employees & Human Resources");

    // No child may leak through from an ungranted module.
    const granted = new Set(permissions.modules);
    flattenNavItems(items).forEach((leaf) => {
      expect(granted.has(leaf.module)).toBe(true);
    });

    // The granted `rides` module remains reachable inside Operations.
    const ops = items.find((item) => item.id === "ops");
    expect(ops.children.map((child) => child.module)).toContain("rides");
  });

  it("shows every module to an elevated (CEO) administrator", () => {
    const permissions = { role: "ceo", elevated: true, modules: [], feature_flags: {} };
    const items = filterNavItems(permissions);
    const groups = items.map((item) => item.label);

    REQUIRED_GROUPS.forEach((group) => {
      expect(groups).toContain(group);
    });

    // An elevated administrator sees the complete tree — nothing is dropped.
    expect(groups.length).toBe(SIDEBAR_NAV_ITEMS.length);
    expect(flattenNavItems(items).length).toBe(flattenNavItems(SIDEBAR_NAV_ITEMS).length);
  });

  it("returns no items when permissions are not loaded", () => {
    expect(filterNavItems(null)).toEqual([]);
  });

  it("hides feature-flagged items when the flag is off", () => {
    const flatten = (items) => flattenNavItems(items).map((i) => i.label);

    // `multi_city` gates "Multi-City Operations" (module: ops).
    const opsBase = { role: "ops", elevated: false, modules: ["ops"] };
    expect(
      flatten(filterNavItems({ ...opsBase, feature_flags: { multi_city: true } }))
    ).toContain("Multi-City Operations");
    expect(
      flatten(filterNavItems({ ...opsBase, feature_flags: {} }))
    ).not.toContain("Multi-City Operations");

    // `fleet_center` gates "Fleet Management" (module: drivers).
    const driversBase = { role: "ops", elevated: false, modules: ["drivers"] };
    expect(
      flatten(filterNavItems({ ...driversBase, feature_flags: { fleet_center: true } }))
    ).toContain("Fleet Management");
    expect(
      flatten(filterNavItems({ ...driversBase, feature_flags: {} }))
    ).not.toContain("Fleet Management");
  });

  it("resolves the role home path to a registered admin route", () => {
    const home = SIDEBAR_NAV_ITEMS.find((item) => item.id === "home");
    expect(home).toBeDefined();

    // The backend advertises `/admin/home/<role>` (HOME_ROUTES in
    // operations/admin_permissions_service.py), but none of those paths are registered
    // in App.js — navigating to one renders the public landing page. The sidebar
    // therefore points at the registered admin home and never at an unregistered
    // `/admin/home/*` path. See the home-route audit before restoring the feature.
    const withBackendRoute = resolveNavPath(home, { home_route: "/admin/home/finance" });
    const withoutPermissions = resolveNavPath(home, null);
    expect(withBackendRoute).toBe("/admin");
    expect(withoutPermissions).toBe("/admin");

    // Whatever it resolves to must be a route the guard knows, mapped to `home`.
    [withBackendRoute, withoutPermissions].forEach((path) => {
      expect(PATH_MODULE_MAP[path]).toBeDefined();
      expect(PATH_MODULE_MAP[path]).toBe("home");
    });
  });
});

describe("Admin route access (backend-aligned)", () => {
  it("maps every Phase 1 route to a module with a label", () => {
    const phase1 = [
      "/admin/rides",
      "/admin/rides/live",
      "/admin/rides/reports",
      "/admin/drivers",
      "/admin/riders",
      "/admin/delivery",
      "/admin/delivery/couriers",
      "/admin/delivery/support",
      "/admin/merchants",
      "/admin/employees",
      "/admin/roles",
      "/admin/security",
      "/admin/security/audit",
      "/admin/security/fraud",
      "/admin/withdrawals",
      "/admin/finance-ops",
      "/admin/payments",
      "/admin/approvals",
    ];
    phase1.forEach((path) => {
      const module = getModuleForPath(path);
      expect(module).not.toBeNull();
      expect(MODULE_LABELS[module]).toBeTruthy();
    });
  });

  it("denies an unknown admin path by default", () => {
    const permissions = { role: "ops", elevated: false, modules: ["ops", "rides"], feature_flags: {} };
    expect(canAccessPath(permissions, "/admin/not-a-real-page")).toBe(false);
    expect(canAccessPath(permissions, "/admin/rides")).toBe(true);
    expect(canAccessPath(permissions, "/admin/withdrawals")).toBe(false);
  });

  it("allows an elevated administrator everywhere known", () => {
    const permissions = { role: "ceo", elevated: true, modules: [], feature_flags: {} };
    expect(canAccessPath(permissions, "/admin/withdrawals")).toBe(true);
    expect(canAccessPath(permissions, "/admin/security/audit")).toBe(true);
  });

  it("denies everything when permissions are missing", () => {
    expect(canAccessPath(null, "/admin/rides")).toBe(false);
  });

  it("resolves a backend home_route to a registered admin destination", () => {
    // Every role route the backend advertises must not be followed blindly: App.js
    // registers none of the `/admin/home/*` paths.
    [
      "/admin/home/ceo",
      "/admin/home/ops",
      "/admin/home/support",
      "/admin/home/finance",
      "/admin/home/drivers",
      "/admin/home/marketing",
      "/admin/home/analytics",
      "/admin/home/system",
    ].forEach((advertised) => {
      expect(resolveRegisteredAdminHome(advertised)).toBe("/admin");
    });

    // The registered `hr` home is preserved.
    expect(resolveRegisteredAdminHome("/admin/employees")).toBe("/admin/employees");

    // Defensive: a missing or malformed value falls back to the registered admin home.
    [null, undefined, "", 42, {}].forEach((value) => {
      expect(resolveRegisteredAdminHome(value)).toBe("/admin");
    });

    // Whatever is returned must be a path the route guard knows.
    expect(PATH_MODULE_MAP[resolveRegisteredAdminHome("/admin/home/ceo")]).toBe("home");
    expect(PATH_MODULE_MAP[resolveRegisteredAdminHome("/admin/employees")]).toBe("employees");
  });
});

/**
 * Driver Management dropdown (YALA Driver Documents & Performance phase).
 *
 * These guard the module wiring for the Driver Documents and Driver Performance
 * pages, because an unmapped path is default-denied by the route guard and
 * silently falls through to the landing page.
 *
 * Deliberately independent of the group's display label and of the wider
 * navigation taxonomy: PR #19 rewrites this config and renames sections, so these
 * assertions must survive that rewrite. They pin the group by `id`, the child
 * entries by `label`/`path`, and the route-guard mapping.
 */
const DRIVER_MANAGEMENT_ENTRIES = [
  { label: "Driver Overview", path: "/admin/drivers/dashboard", module: "drivers" },
  { label: "Driver Management", path: "/admin/drivers", module: "drivers" },
  { label: "Driver Applications", path: "/admin/approvals", module: "drivers" },
  { label: "Driver Documents", path: "/admin/driver-documents", module: "drivers" },
  { label: "Document Verification", path: "/admin/driver-verification", module: "drivers" },
  { label: "Driver Performance", path: "/admin/driver-performance", module: "drivers" },
  { label: "Driver Ratings", path: "/admin/driver-ratings", module: "drivers" },
  { label: "Driver Activity", path: "/admin/driver-activity", module: "drivers" },
  { label: "Driver Safety", path: "/admin/driver-safety", module: "trust_safety" },
];

describe("Driver Management dropdown", () => {
  const driversGroup = SIDEBAR_NAV_ITEMS.find((item) => item.id === "drivers-fleet");
  const children = driversGroup ? driversGroup.children : [];

  it("keeps the drivers & fleet section and its driver-management children", () => {
    expect(driversGroup).toBeDefined();
    expect(driversGroup.module).toBe("drivers");
    expect(children.length).toBeGreaterThan(0);
  });

  it.each(DRIVER_MANAGEMENT_ENTRIES)("exposes $label at $path", ({ label, path, module }) => {
    const entry = children.find((child) => child.label === label);
    expect(entry).toBeDefined();
    expect(entry.path).toBe(path);
    expect(entry.module).toBe(module);
    // The route guard must know the path, mapped to the same module, or the
    // navigation entry would be dead.
    expect(PATH_MODULE_MAP[path]).toBe(module);
  });

  it("maps the new driver routes to a module that has a label", () => {
    [
      "/admin/driver-documents",
      "/admin/driver-verification",
      "/admin/driver-performance",
      "/admin/driver-ratings",
      "/admin/driver-activity",
      "/admin/driver-safety",
    ].forEach((path) => {
      const module = getModuleForPath(path);
      expect(module).not.toBeNull();
      expect(MODULE_LABELS[module]).toBeTruthy();
    });
  });

  it("still denies an unmapped driver path by default", () => {
    const permissions = { role: "ops", elevated: false, modules: ["drivers"], feature_flags: {} };
    expect(canAccessPath(permissions, "/admin/driver-documents")).toBe(true);
    expect(canAccessPath(permissions, "/admin/driver-not-a-page")).toBe(false);
  });

  it("restricts the safety entry to trust_safety holders", () => {
    const driversOnly = { role: "ops", elevated: false, modules: ["drivers"], feature_flags: {} };
    expect(canAccessPath(driversOnly, "/admin/driver-safety")).toBe(false);
    const withSafety = {
      role: "ops",
      elevated: false,
      modules: ["drivers", "trust_safety"],
      feature_flags: {},
    };
    expect(canAccessPath(withSafety, "/admin/driver-safety")).toBe(true);
  });

  it("points every driver-management entry at a distinct path", () => {
    const paths = DRIVER_MANAGEMENT_ENTRIES.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

