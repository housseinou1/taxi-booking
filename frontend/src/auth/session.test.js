import {
  clearAuthSession,
  getRequiredRoleForApp,
  hasStoredAuthCredentials,
  hasValidAccessToken,
  isDriverAccount,
  isJwtUsable,
} from "./session";

describe("auth session helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("treats missing tokens as unauthenticated storage", () => {
    expect(hasStoredAuthCredentials()).toBe(false);
    expect(hasValidAccessToken()).toBe(false);
  });

  test("detects expired JWT access tokens", () => {
    const header = window.btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = window.btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }));
    const token = `${header}.${payload}.signature`;

    expect(isJwtUsable(token)).toBe(false);
    expect(hasValidAccessToken()).toBe(false);

    localStorage.setItem("access", token);
    expect(hasValidAccessToken()).toBe(false);
    expect(hasStoredAuthCredentials()).toBe(false);
  });

  test("keeps refresh-only storage as restorable credentials", () => {
    localStorage.setItem("refresh", "refresh-token");
    expect(hasStoredAuthCredentials()).toBe(true);
    expect(hasValidAccessToken()).toBe(false);
  });

  test("identifies driver accounts", () => {
    expect(isDriverAccount({ user_type: "driver", is_driver: true })).toBe(true);
    expect(isDriverAccount({ user_type: "rider", is_driver: false })).toBe(false);
  });

  test("requires driver role for driver app installs", () => {
    expect(getRequiredRoleForApp("driver")).toBe("driver");
    expect(getRequiredRoleForApp("delivery")).toBe("driver");
    expect(getRequiredRoleForApp("rider")).toBe("rider");
    expect(getRequiredRoleForApp("web")).toBe(null);
  });

  test("clearAuthSession removes stored credentials", () => {
    localStorage.setItem("access", "token");
    localStorage.setItem("refresh", "refresh");
    localStorage.setItem("user", "{}");

    clearAuthSession();

    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
  });
});
