import { renderHook, act } from "@testing-library/react";

import { clearAuthSession } from "../../auth/session";
import { useWebsiteAuth } from "../useWebsiteAuth";
import { WEBSITE_AUTH_CHANGED } from "../websiteAuthEvents";

jest.mock("../../auth/session", () => ({
  ...jest.requireActual("../../auth/session"),
  clearAuthSession: jest.fn(() => Promise.resolve()),
}));

describe("useWebsiteAuth logout", () => {
  beforeEach(() => {
    localStorage.setItem("access", "test-token");
    localStorage.setItem("user", JSON.stringify({ email: "u@test.local", role: "rider" }));
    delete window.location;
    window.location = { href: "" };
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test("logout clears session, notifies listeners, and navigates home", async () => {
    const listener = jest.fn();
    window.addEventListener(WEBSITE_AUTH_CHANGED, listener);

    const { result } = renderHook(() => useWebsiteAuth());
    expect(result.current.authed).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(clearAuthSession).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    expect(window.location.href).toBe("/");
  });
});
