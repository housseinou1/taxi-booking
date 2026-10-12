/**
 * Regression tests for the Yala native session-restore fix.
 *
 * Root cause being guarded: on native Android the WebView can evict
 * localStorage between launches while the Keychain/Keystore (secure storage)
 * copy survives. The app previously checked localStorage only and then called
 * clearAuthSession() — which ALSO wiped the secure copy — forcing a re-login
 * on every reopen. The fix hydrates secure storage BEFORE deciding the session
 * is missing (hasRestorableAuthCredentials / restoreAuthSession).
 */

// ── Mock the secure storage layer (Keychain/Keystore) ────────────────────────
// Prefixed with `mock` so Jest allows referencing it inside the hoisted factory.
const mockSecureStore = new Map();
jest.mock("../native/storage", () => ({
  __esModule: true,
  getToken: jest.fn((key) =>
    Promise.resolve(mockSecureStore.has(key) ? mockSecureStore.get(key) : null)
  ),
  setToken: jest.fn((key, value) => {
    mockSecureStore.set(key, value);
    return Promise.resolve();
  }),
  removeToken: jest.fn((key) => {
    mockSecureStore.delete(key);
    return Promise.resolve();
  }),
}));

// ── Mock the API fallback (token refresh / /auth/me) ─────────────────────────
const mockAxiosFallback = jest.fn();
jest.mock("../apiFallback", () => ({
  __esModule: true,
  axiosWithApiFallback: (...args) => mockAxiosFallback(...args),
}));

jest.mock("../native/platform", () => ({
  __esModule: true,
  getAppType: () => "driver",
}));

import {
  clearAuthSession,
  hasRestorableAuthCredentials,
  hasStoredAuthCredentials,
  hydrateTokensFromSecureStorage,
  restoreAuthSession,
} from "./session";
import { getToken } from "../native/storage";

// Build a JWT whose exp is `secondsFromNow` seconds away.
function makeJwt(secondsFromNow) {
  const header = window.btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = window.btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow })
  );
  return `${header}.${payload}.sig`;
}

const VALID_ACCESS = makeJwt(3600);   // valid 1h
const EXPIRED_ACCESS = makeJwt(-60);  // expired

beforeEach(() => {
  localStorage.clear();
  mockSecureStore.clear();
  mockAxiosFallback.mockReset();
  getToken.mockClear();
});

describe("hasRestorableAuthCredentials — secure-storage recovery", () => {
  // Scenario 1: localStorage empty + valid secure tokens → restorable
  test("recovers a valid session when localStorage is empty but secure storage has tokens", async () => {
    mockSecureStore.set("access", VALID_ACCESS);
    mockSecureStore.set("refresh", "secure-refresh");

    expect(hasStoredAuthCredentials()).toBe(false); // localStorage-only view: looks logged out

    const restorable = await hasRestorableAuthCredentials();

    expect(restorable).toBe(true);                   // but secure storage restores it
    expect(localStorage.getItem("access")).toBe(VALID_ACCESS); // hydrated back
    expect(localStorage.getItem("refresh")).toBe("secure-refresh");
  });

  // Scenario 2: both storage locations empty → not restorable
  test("reports no credentials when both localStorage and secure storage are empty", async () => {
    const restorable = await hasRestorableAuthCredentials();
    expect(restorable).toBe(false);
    expect(localStorage.getItem("access")).toBeNull();
  });

  // Scenario: refresh-only in secure storage still restorable (access can be refreshed)
  test("treats a refresh-only secure session as restorable", async () => {
    mockSecureStore.set("refresh", "secure-refresh-only");
    const restorable = await hasRestorableAuthCredentials();
    expect(restorable).toBe(true);
    expect(localStorage.getItem("refresh")).toBe("secure-refresh-only");
  });

  // Scenario 6: secure-storage read failure must not throw
  test("does not throw when secure storage read fails", async () => {
    getToken.mockImplementationOnce(() => Promise.reject(new Error("keystore unavailable")));
    await expect(hasRestorableAuthCredentials()).resolves.toBe(false);
  });

  // localStorage already valid → short-circuits without needing secure storage
  test("returns true immediately when localStorage already has a valid token", async () => {
    localStorage.setItem("access", VALID_ACCESS);
    const restorable = await hasRestorableAuthCredentials();
    expect(restorable).toBe(true);
  });
});

describe("hydrateTokensFromSecureStorage", () => {
  test("does not overwrite existing localStorage tokens", async () => {
    localStorage.setItem("access", VALID_ACCESS);
    mockSecureStore.set("access", "a-different-secure-token");
    await hydrateTokensFromSecureStorage();
    expect(localStorage.getItem("access")).toBe(VALID_ACCESS); // kept, not overwritten
  });
});

describe("restoreAuthSession — reopen scenarios", () => {
  // Scenario 7 + 1: driver reopens; localStorage evicted; secure tokens valid → session restored
  test("restores a driver session after reopen when only secure storage survived", async () => {
    mockSecureStore.set("access", VALID_ACCESS);
    mockSecureStore.set("refresh", "secure-refresh");
    // /auth/me returns the driver user
    mockAxiosFallback.mockResolvedValueOnce({
      data: { user_type: "driver", is_driver: true, first_name: "Yala", last_name: "Driver" },
    });

    const result = await restoreAuthSession({ requiredRole: "driver" });

    expect(result.authenticated).toBe(true);
    expect(result.user?.user_type).toBe("driver");
    // Secure tokens must NOT have been cleared
    expect(mockSecureStore.get("access")).toBe(VALID_ACCESS);
  });

  // Scenario 4: expired access + valid refresh → refresh succeeds, session restored
  test("refreshes an expired access token using the refresh token", async () => {
    localStorage.setItem("access", EXPIRED_ACCESS);
    localStorage.setItem("refresh", "good-refresh");
    mockAxiosFallback
      // token refresh call
      .mockResolvedValueOnce({ data: { access: VALID_ACCESS, refresh: "rotated-refresh" } })
      // /auth/me call
      .mockResolvedValueOnce({ data: { user_type: "driver", is_driver: true } });

    const result = await restoreAuthSession({ requiredRole: "driver" });

    expect(result.authenticated).toBe(true);
    expect(localStorage.getItem("access")).toBe(VALID_ACCESS);
  });

  // Scenario 5: invalid/expired refresh token → session not restored, cleared
  test("fails cleanly when the refresh token is invalid/expired", async () => {
    localStorage.setItem("access", EXPIRED_ACCESS);
    localStorage.setItem("refresh", "bad-refresh");
    mockAxiosFallback.mockRejectedValueOnce({ response: { status: 401 } }); // refresh rejected

    const result = await restoreAuthSession({ requiredRole: "driver" });

    expect(result.authenticated).toBe(false);
    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
  });

  // Scenario 2: both empty → unauthenticated
  test("returns unauthenticated when there are no credentials anywhere", async () => {
    const result = await restoreAuthSession({ requiredRole: "driver" });
    expect(result.authenticated).toBe(false);
  });
});

describe("explicit logout (Scenario 3) remains unchanged", () => {
  test("clearAuthSession removes both localStorage and secure-storage tokens", () => {
    localStorage.setItem("access", VALID_ACCESS);
    localStorage.setItem("refresh", "r");
    localStorage.setItem("user", "{}");
    mockSecureStore.set("access", VALID_ACCESS);
    mockSecureStore.set("refresh", "r");

    clearAuthSession();

    // localStorage cleared synchronously
    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    // and after logout a restore must NOT bring the session back
    return hasRestorableAuthCredentials().then((restorable) => {
      expect(restorable).toBe(false);
    });
  });
});
