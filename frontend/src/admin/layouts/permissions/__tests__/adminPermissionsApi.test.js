/**
 * Tests for fetchAdminPermissions resilience.
 *
 * Root cause this guards against: localStorage (the version key) survives a
 * browser/tab restart but sessionStorage (the cached body) does not. After a
 * restart the client could send a stale `If-None-Match`, get a 304, and have no
 * cached body to serve — leaving admin permissions null, which makes
 * AdminActionGuard default-deny and render every Approve/Reject/Suspend button
 * disabled. The fix forces a fresh (unconditional) refetch whenever a 304 yields
 * no usable cached body. These tests lock that in without weakening RBAC.
 */

jest.mock("../../../../apiConfig", () => ({ API_URL: "http://localhost:8000" }));

const mockGet = jest.fn();
jest.mock("../../../../auth/authenticatedApi", () => ({
  __esModule: true,
  default: { get: (...args) => mockGet(...args) },
}));

import { fetchAdminPermissions, clearAdminPermissionsCache } from "../adminPermissionsApi";

const PAYLOAD = {
  role: "ceo",
  elevated: true,
  permissions_version: "v-new",
  actions: { "drivers.edit": true },
  modules: ["drivers"],
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

test("normal 200 returns the payload and caches it", async () => {
  mockGet.mockResolvedValueOnce({ data: PAYLOAD, status: 200, headers: {} });
  const result = await fetchAdminPermissions({ force: true });
  expect(result).toEqual(PAYLOAD);
  expect(mockGet).toHaveBeenCalledTimes(1);
});

test("304 WITH a cached body serves the cache (no refetch)", async () => {
  // Prime the cache with a successful fetch first.
  mockGet.mockResolvedValueOnce({ data: PAYLOAD, status: 200, headers: {} });
  await fetchAdminPermissions({ force: true });

  // Now a forced refetch that the server answers 304 — cached body is served.
  mockGet.mockResolvedValueOnce({ data: null, status: 304, headers: {} });
  const result = await fetchAdminPermissions({ force: true });
  expect(result).toEqual(PAYLOAD);
});

test("stale version but NO cached body (fresh session) requests UNCONDITIONALLY and gets 200", async () => {
  // Simulate a browser restart: localStorage version survived, sessionStorage body did not.
  localStorage.setItem("yala_admin_permissions_version", "v-old");
  // sessionStorage intentionally empty.

  mockGet.mockResolvedValueOnce({ data: PAYLOAD, status: 200, headers: {} });

  const result = await fetchAdminPermissions({ force: true });

  expect(result).toEqual(PAYLOAD);
  // Root-cause fix: with no cached body, we must NOT send If-None-Match at all,
  // so the server returns a full 200 on the FIRST request (no 304 round-trip).
  expect(mockGet).toHaveBeenCalledTimes(1);
  const firstHeaders = mockGet.mock.calls[0][1]?.headers || {};
  expect(firstHeaders["If-None-Match"]).toBeUndefined();
});

test("304 with no cache still recovers via a forced fresh 200 (belt-and-suspenders)", async () => {
  // Defensive: even if a 304 somehow arrives with no cached body, recover.
  localStorage.setItem("yala_admin_permissions_version", "v-old");
  mockGet
    .mockResolvedValueOnce({ data: null, status: 304, headers: {} })
    .mockResolvedValueOnce({ data: PAYLOAD, status: 200, headers: {} });

  const result = await fetchAdminPermissions({ force: true });
  expect(result).toEqual(PAYLOAD);
  const lastHeaders = mockGet.mock.calls[mockGet.mock.calls.length - 1][1]?.headers || {};
  expect(lastHeaders["If-None-Match"]).toBeUndefined();
});

test("axios '304-as-error' path with no cache also forces a fresh 200", async () => {
  localStorage.setItem("yala_admin_permissions_version", "v-old");
  mockGet
    .mockRejectedValueOnce({ response: { status: 304 } }) // axios throws on 304
    .mockResolvedValueOnce({ data: PAYLOAD, status: 200, headers: {} });

  const result = await fetchAdminPermissions({ force: true });
  expect(result).toEqual(PAYLOAD);
  expect(mockGet).toHaveBeenCalledTimes(2);
});

afterAll(() => clearAdminPermissionsCache());
