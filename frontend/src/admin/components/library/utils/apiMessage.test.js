import { humanizeApiMessage } from "./apiMessage";

describe("humanizeApiMessage", () => {
  test("maps the raw axios 404 string to an actionable deployment message", () => {
    const out = humanizeApiMessage("Request failed with status code 404");
    expect(out).toMatch(/HTTP 404/);
    expect(out).toMatch(/not available on the backend/i);
    expect(out).not.toMatch(/Request failed with status code/i);
  });

  test("maps 5xx to a server-side explanation, never 'missing data'", () => {
    const out = humanizeApiMessage("Request failed with status code 500");
    expect(out).toMatch(/HTTP 500/);
    expect(out).toMatch(/server-side problem, not missing data/i);
  });

  test("maps 401 and 403 to session/permission guidance", () => {
    expect(humanizeApiMessage("Request failed with status code 401")).toMatch(
      /session has expired/i
    );
    expect(humanizeApiMessage("Request failed with status code 403")).toMatch(
      /access denied/i
    );
  });

  test("maps 429 and an unmapped 4xx sensibly", () => {
    expect(humanizeApiMessage("Request failed with status code 429")).toMatch(/too many/i);
    expect(humanizeApiMessage("Request failed with status code 418")).toMatch(/HTTP 418/);
  });

  test("maps network and timeout failures", () => {
    expect(humanizeApiMessage("Network Error")).toMatch(/could not reach the yala backend/i);
    expect(humanizeApiMessage("timeout of 15000ms exceeded")).toMatch(/did not respond in time/i);
  });

  test("leaves a genuine server-supplied detail untouched", () => {
    expect(humanizeApiMessage("Ride not found.")).toBe("Ride not found.");
    expect(humanizeApiMessage("Invalid date_from; expected YYYY-MM-DD.")).toBe(
      "Invalid date_from; expected YYYY-MM-DD."
    );
    expect(humanizeApiMessage("No rides match these filters.")).toBe(
      "No rides match these filters."
    );
  });

  test("passes through non-strings and empty values unchanged", () => {
    expect(humanizeApiMessage(undefined)).toBeUndefined();
    expect(humanizeApiMessage(null)).toBeNull();
    expect(humanizeApiMessage("")).toBe("");
    expect(humanizeApiMessage(42)).toBe(42);
  });
});
