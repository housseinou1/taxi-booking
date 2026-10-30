/**
 * Focused tests for getApiCandidates ordering.
 *
 * Root cause of the Yala Admin login 401: on the production web host the login
 * tried cross-origin www/api candidates first, which the browser blocked with
 * CORS, stranding the flow. The fix makes getApiCandidates return the page's
 * OWN origin first on a production web host, so login is same-origin (no CORS).
 *
 * These tests lock in: same-origin-first on production hosts, de-duplication of
 * the remaining production bases, and unchanged behavior off the production host.
 */

import { getApiCandidates } from "./apiConfig";

const realLocation = window.location;

function setLocation(href) {
  const url = new URL(href);
  delete window.location;
  // Minimal stub: getApiCandidates reads hostname + origin.
  window.location = {
    href: url.href,
    origin: url.origin,
    hostname: url.hostname,
    protocol: url.protocol,
    host: url.host,
  };
}

afterEach(() => {
  delete window.location;
  window.location = realLocation;
});

describe("getApiCandidates — same-origin-first on production web host", () => {
  test("apex host leads with its own origin", () => {
    setLocation("https://yalataxi.live/login?next=/admin");
    const candidates = getApiCandidates("/auth/login/");
    expect(candidates[0]).toBe("https://yalataxi.live/auth/login/");
    // No cross-origin candidate precedes the same-origin one.
    expect(candidates.indexOf("https://www.yalataxi.live/auth/login/")).not.toBe(0);
  });

  test("www host leads with its own origin", () => {
    setLocation("https://www.yalataxi.live/login");
    const candidates = getApiCandidates("/auth/login/");
    expect(candidates[0]).toBe("https://www.yalataxi.live/auth/login/");
  });

  test("same-origin candidate is not duplicated in the fallback list", () => {
    setLocation("https://yalataxi.live/login");
    const candidates = getApiCandidates("/auth/login/");
    const sameOrigin = "https://yalataxi.live/auth/login/";
    const occurrences = candidates.filter((u) => u === sameOrigin).length;
    expect(occurrences).toBe(1);
  });

  test("path is normalized with a leading slash", () => {
    setLocation("https://yalataxi.live/login");
    const candidates = getApiCandidates("auth/login/");
    expect(candidates[0]).toBe("https://yalataxi.live/auth/login/");
  });

  test("works for non-auth paths too (operations endpoint)", () => {
    setLocation("https://yalataxi.live/admin/employees");
    const candidates = getApiCandidates("/operations/admin/me/permissions/");
    expect(candidates[0]).toBe(
      "https://yalataxi.live/operations/admin/me/permissions/",
    );
  });
});

describe("getApiCandidates — non-production hosts unchanged", () => {
  test("localhost does not force same-origin production branch", () => {
    setLocation("http://localhost:3000/login");
    const candidates = getApiCandidates("/auth/login/");
    // Must NOT start with a yalataxi.live origin; dev uses API_URL/local fallback.
    expect(candidates[0]).not.toMatch(/yalataxi\.live/);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
  });

  test("a non-yala production-looking host is not treated as same-origin-first", () => {
    setLocation("https://staging.example.com/login");
    const candidates = getApiCandidates("/auth/login/");
    expect(candidates[0]).not.toBe("https://staging.example.com/auth/login/");
  });
});
