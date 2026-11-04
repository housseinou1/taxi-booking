/**
 * executiveApi — request shape.
 *
 * REGRESSION GUARD: the Executive Overview dashboard request omitted the trailing
 * slash while the backend registers the route as `executive/dashboard/`. Django
 * does not APPEND_SLASH a querystring-carrying GET through the SPA, so the call
 * 404'd and the dashboard never loaded.
 */
import authenticatedApi from "../../../auth/authenticatedApi";
import { fetchExecutiveDashboard } from "../executiveApi";

jest.mock("../../../auth/authenticatedApi");

beforeEach(() => {
  jest.clearAllMocks();
  authenticatedApi.get.mockResolvedValue({ data: { ok: true } });
});

describe("fetchExecutiveDashboard", () => {
  test("REGRESSION: requests the route with its trailing slash", async () => {
    await fetchExecutiveDashboard();
    const url = authenticatedApi.get.mock.calls[0][0];
    expect(url).toMatch(/\/operations\/executive\/dashboard\/$/);
    expect(url).not.toMatch(/dashboard$/);
  });

  test("appends query params after the trailing slash", async () => {
    await fetchExecutiveDashboard({ period: "weekly" });
    expect(authenticatedApi.get.mock.calls[0][0]).toMatch(
      /\/operations\/executive\/dashboard\/\?period=weekly$/
    );
  });

  test("returns the response payload", async () => {
    await expect(fetchExecutiveDashboard()).resolves.toEqual({ ok: true });
  });
});
