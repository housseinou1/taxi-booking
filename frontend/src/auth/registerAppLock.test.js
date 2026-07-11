/**
 * @jest-environment jsdom
 */
import { getAppType } from "../native/platform";

// Mirror Register.js locked mapping without mounting full form.
function getRegistrationAppContext() {
  const appType = getAppType();
  if (appType === "rider") return "rider";
  if (appType === "driver") return "driver";
  if (appType === "delivery") return "delivery";
  return "web";
}

function getLockedRegistrationUserType(context = getRegistrationAppContext()) {
  if (context === "rider") return "rider";
  if (context === "driver" || context === "delivery") return "driver";
  return "rider";
}

function getRegisterTitleKey(context = getRegistrationAppContext()) {
  if (context === "delivery") return "Create courier account";
  if (context === "rider") return "Create Yala Rider account";
  if (context === "driver") return "Create Yala Driver account";
  return "Create your mobility account.";
}

describe("registration account lock by app type", () => {
  beforeEach(() => {
    window.__YALA_APP_TYPE__ = undefined;
    localStorage.clear();
  });

  test("rider app title and user_type", () => {
    window.__YALA_APP_TYPE__ = "rider";
    localStorage.setItem("yala_delivery_courier", "1");
    expect(getRegistrationAppContext()).toBe("rider");
    expect(getLockedRegistrationUserType()).toBe("rider");
    expect(getRegisterTitleKey()).toBe("Create Yala Rider account");
  });

  test("driver app title and user_type", () => {
    window.__YALA_APP_TYPE__ = "driver";
    expect(getRegistrationAppContext()).toBe("driver");
    expect(getLockedRegistrationUserType()).toBe("driver");
    expect(getRegisterTitleKey()).toBe("Create Yala Driver account");
  });

  test("delivery app title and courier user_type backend role", () => {
    window.__YALA_APP_TYPE__ = "delivery";
    expect(getRegistrationAppContext()).toBe("delivery");
    expect(getLockedRegistrationUserType()).toBe("driver");
    expect(getRegisterTitleKey()).toBe("Create courier account");
  });
});
