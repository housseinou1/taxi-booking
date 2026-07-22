import { navigateInApp } from "./inAppNavigation";

describe("navigateInApp", () => {
  beforeEach(() => {
    window.history.pushState(null, "", "/driver");
  });

  it("updates the URL and dispatches popstate", () => {
    const handler = jest.fn();
    window.addEventListener("popstate", handler);

    navigateInApp("/driver/earnings");

    expect(window.location.pathname).toBe("/driver/earnings");
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener("popstate", handler);
  });

  it("does nothing when already on the target route", () => {
    window.history.pushState(null, "", "/driver/earnings");
    const handler = jest.fn();
    window.addEventListener("popstate", handler);

    navigateInApp("/driver/earnings");

    expect(handler).not.toHaveBeenCalled();

    window.removeEventListener("popstate", handler);
  });
});
