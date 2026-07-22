import React, { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { API_URL, getApiCandidates } from "../apiConfig";
import { getSafeRedirectPath, getUserRole } from "./roleRouting";
import { persistAuthTokens } from "./session";
import { getAppType, isDeliveryCourierPath, isNative } from "../native/platform";
import { getDeviceName, getStableDeviceId } from "../native/deviceId";
import { submitIntegrityToken } from "../native/playIntegrity";
import { postWithNativeFallback } from "../nativeHttp";
import "../delivery/delivery-uber.css";

const logoSrc = "/yala-logo.png";
const riderLogoSrc = "/yala-rider-logo.png";
const driverLogoSrc = "/yala-driver-logo.png";
const adminLogoSrc = "/yala-admin-logo.png";
const deliveryLogoSrc = "/yala-delivery-logo.png";

function getLoginApiCandidates() {
  return getApiCandidates("/auth/login/");
}

function getAuthApiCandidates(path) {
  return getApiCandidates(path);
}

async function postLoginRequest(endpoint, payload, headers = {}, timeoutMs = 15000) {
  if (isNative()) {
    const path = endpoint.replace(/^https?:\/\/[^/]+/i, "");
    return postWithNativeFallback(path || "/auth/login/", payload, headers, timeoutMs);
  }

  return axios.post(endpoint, payload, { timeout: timeoutMs, headers });
}

function getApiErrorMessage(error, fallback, context = "web") {
  if (error?.response?.data) {
    const data = error.response.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data.error) return data.error;
    if (data.detail) return data.detail;
    if (data.message) return data.message;
    if (error.response.status) {
      return `${fallback} (HTTP ${error.response.status})`;
    }
  }
  if (error?.request) {
    const apiTarget = API_URL || window.location.origin || "the API server";
    if (context === "admin") {
      return `Cannot reach Yala Admin API at ${apiTarget}. Check your internet, then hard-refresh (Ctrl+Shift+R).`;
    }
    return `Cannot reach ${apiTarget}. Check your internet connection and try again.`;
  }
  return fallback;
}

function getLoginErrorMessage(error, t, context = "web") {
  if (error?.response) {
    const data = error.response.data;
    if (typeof data === "string" && data.trim()) {
      return data.trim();
    }
    if (data?.error) {
      return data.error;
    }
    if (data?.detail) {
      return data.detail;
    }
    if (error.response.status === 401) {
      return "Invalid email or password. If the database was reset, create a new account from Register.";
    }
    if (error.response.status === 403) {
      return "This account has been blocked. Please contact support.";
    }
    if (error.response.status === 429) {
      return "Too many login attempts. Please wait and try again.";
    }
    return `${t("auth.loginFailed")} (HTTP ${error.response.status})`;
  }

  if (error?.request) {
    const apiTarget = API_URL || process.env.REACT_APP_API_URL || "the API server";
    const code = String(error?.code || "");
    if (code === "ECONNABORTED") {
      return `Request timed out reaching ${apiTarget}. Check your connection and try again.`;
    }
    if (context === "admin") {
      return `Cannot reach Yala Admin API at ${apiTarget}. Confirm you are on https://yalataxi.live/admin or run npm run start:admin, then retry. If antivirus or firewall blocks HTTPS, allow api.yalataxi.live.`;
    }
    if (context === "delivery") {
      if (apiTarget.includes("api.yalataxi.live")) {
        return "Cannot reach the Yala Delivery server. Check your internet connection and try again.";
      }
      return "Cannot reach the Yala Delivery server. Connect your phone to the same Wi-Fi as this PC, keep the backend running, then retry login.";
    }
    return `Cannot reach ${apiTarget}. Check your internet connection and try again.`;
  }

  if (error?.message) {
    return error.message;
  }

  return t("auth.loginFailed");
}

function normalizeContextRoute(value) {
  if (!value) return "";
  const raw = String(value).trim();

  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return new URL(decoded).pathname.toLowerCase();
    }
    return decoded.toLowerCase();
  } catch (error) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      try {
        return new URL(raw).pathname.toLowerCase();
      } catch (urlError) {
        return raw.toLowerCase();
      }
    }
    return raw.toLowerCase();
  }
}

function getNextRouteFromSearch() {
  const search = window.location.search || "";
  const params = new URLSearchParams(search);
  const directNext = params.get("next");
  if (directNext) return directNext;

  // Handle malformed links like ?next%3D%2Fadmin (encoded "next=/admin" as key).
  if (search.includes("next%3D")) {
    const decoded = decodeURIComponent(search.replace(/^\?/, ""));
    const match = decoded.match(/(?:^|&)next=([^&]+)/i);
    if (match?.[1]) return match[1];
  }

  return "";
}

function getLoginContext() {
  const builtAppType = getAppType();
  if (builtAppType === "rider" || builtAppType === "driver" || builtAppType === "delivery" || builtAppType === "admin") {
    return builtAppType;
  }

  const path = window.location.pathname || "";
  const next = getNextRouteFromSearch();
  const storedNext = localStorage.getItem("sx_login_redirect") || "";
  // Prefer explicit ?next= or the current path over a stale stored redirect.
  const route = normalizeContextRoute(
    next ||
      (path && path !== "/" && path !== "/login" && path !== "/register" ? path : "") ||
      storedNext ||
      path
  );

  if (
    route === "/admin" ||
    route === "/admin-dashboard" ||
    route.startsWith("/admin/")
  ) {
    return "admin";
  }

  if (isDeliveryCourierPath(route)) {
    return "delivery";
  }

  if (
    route === "/driver" ||
    route === "/driver-profile" ||
    route.startsWith("/driver/")
  ) {
    return "driver";
  }

  if (
    route === "/rider" ||
    route === "/rider-dashboard" ||
    route.startsWith("/rider-") ||
    route.startsWith("/ride/") ||
    route === "/history" ||
    route === "/saved-places" ||
    route === "/delivery" ||
    route === "/payment-setup"
  ) {
    return "rider";
  }

  return "web";
}

function getLogoForApp() {
  const context = getLoginContext();
  if (context === "admin") return adminLogoSrc;
  if (context === "rider") return riderLogoSrc;
  if (context === "driver") return driverLogoSrc;
  if (context === "delivery") return deliveryLogoSrc;
  return logoSrc;
}

function getAppLabel() {
  const context = getLoginContext();
  if (context === "admin") return "Yala Admin";
  if (context === "rider") return "Yala Rider";
  if (context === "driver") return "Yala Driver";
  if (context === "delivery") return "Yala Delivery";
  return "Yala";
}

function getAppHint() {
  const context = getLoginContext();
  if (context === "admin") return "This is Admin app";
  if (context === "rider") return "This is Rider app";
  if (context === "driver") return "This is Driver app";
  if (context === "delivery") return "Yala Delivery — courier app";
  return "This is Yala app";
}

function getLoginSubtitle() {
  const context = getLoginContext();
  if (context === "admin") {
    return "Sign in to manage drivers, riders, deliveries, and payments.";
  }
  if (context === "delivery") {
    return "Sign in to continue as a Yala Delivery courier.";
  }
  return null;
}

export default function Login({ onLogin }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [resetStep, setResetStep] = useState("login");
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [pending2FA, setPending2FA] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [newDeviceNotice, setNewDeviceNotice] = useState("");

  useEffect(() => {
    // Don't redirect here — let App.js handle routing for authenticated users
    // This prevents redirect loops in Capacitor WebView
  }, []);

  const completeAuthenticatedLogin = async (data) => {
    persistAuthTokens({
      access: data.access,
      refresh: data.refresh,
      user: data,
    });

    if (data?.is_new_device) {
      setNewDeviceNotice(
        "New device sign-in detected. A security email was sent if alerts are configured.",
      );
    }

    if (data?.access) {
      submitIntegrityToken(data.access).catch(() => {});
    }

    if (onLogin) {
      onLogin(data);
    } else {
      window.location.href = getRedirectPath(data);
    }
  };

  const handleVerify2FA = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    if (!pending2FA?.pending_token) {
      setErrorMessage("2FA session expired. Please sign in again.");
      setPending2FA(null);
      return;
    }
    if (!/^\d{6}$/.test(String(totpCode || "").trim())) {
      setErrorMessage("Enter the 6-digit authenticator code.");
      return;
    }

    try {
      setLoading(true);
      let response = null;
      let lastError = null;
      for (const endpoint of getAuthApiCandidates("/auth/2fa/verify/")) {
        try {
          response = await axios.post(
            endpoint,
            {
              pending_token: pending2FA.pending_token,
              code: String(totpCode).trim(),
            },
            { timeout: 15000 },
          );
          break;
        } catch (error) {
          lastError = error;
          if (error?.response) break;
        }
      }
      if (!response) throw lastError || new Error("2FA verification failed");
      setPending2FA(null);
      setTotpCode("");
      await completeAuthenticatedLogin(response.data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Invalid authentication code."));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setNewDeviceNotice("");

    if (!email.trim() || !password) {
      setErrorMessage(t("auth.enterCredentials"));
      return;
    }

    try {
      setLoading(true);

      let response = null;
      let lastError = null;
      const deviceId = await getStableDeviceId();
      const deviceName = getDeviceName();
      const loginPayload = {
        email: email.trim().toLowerCase(),
        password,
        device_id: deviceId,
        device_name: deviceName,
      };
      const loginHeaders = deviceId ? { "X-Device-Id": deviceId } : undefined;
      const loginTimeout = isNative() ? 12000 : 15000;

      if (isNative()) {
        response = await postWithNativeFallback(
          "/auth/login/",
          loginPayload,
          loginHeaders,
          loginTimeout,
        );
      } else {
        for (const endpoint of getLoginApiCandidates()) {
          try {
            response = await postLoginRequest(
              endpoint,
              loginPayload,
              loginHeaders,
              loginTimeout,
            );
            break;
          } catch (error) {
            lastError = error;
            if (error?.response) {
              break;
            }
          }
        }
      }

      if (!response) {
        throw lastError || new Error("Login request failed");
      }

      if (response.data?.is_2fa_required && response.data?.pending_token) {
        setPending2FA({
          pending_token: response.data.pending_token,
          email: response.data.email || email.trim().toLowerCase(),
        });
        setTotpCode("");
        return;
      }

      const loginContext = getLoginContext();
      const appType = getAppType();
      const userRole = getUserRole(response.data);
      const expectedAppRole =
        loginContext === "admin"
          ? "admin"
          : loginContext === "driver" || loginContext === "rider" || loginContext === "delivery"
          ? loginContext === "delivery"
            ? "driver"
            : loginContext
          : appType === "delivery"
            ? "driver"
            : appType;
      const riderAppMismatch =
        expectedAppRole === "rider" && userRole !== "rider";
      const driverAppMismatch =
        expectedAppRole === "driver" && userRole !== "driver";
      const adminAppMismatch =
        expectedAppRole === "admin" && userRole !== "admin";

      if (riderAppMismatch || driverAppMismatch || adminAppMismatch) {
        const expected =
          expectedAppRole === "admin"
            ? "Admin"
            : appType === "delivery" || loginContext === "delivery"
            ? "Yala Delivery courier"
            : appType === "driver" || loginContext === "driver"
              ? "Driver"
              : "Rider";
        setErrorMessage(
          `This account is not a ${expected} account. Please sign in with an authorized ${expected} account.`
        );
        return;
      }

      await completeAuthenticatedLogin(response.data);
    } catch (error) {
      setErrorMessage(getLoginErrorMessage(error, t, getLoginContext()));
    } finally {
      setLoading(false);
    }
  };

  const navigateToRegister = () => {
    const context = getLoginContext();
    if (context === "admin") {
      window.location.href = "/register?role=admin";
      return;
    }
    if (context === "driver") {
      window.location.href = "/register?role=driver";
      return;
    }
    if (context === "delivery") {
      window.location.href = "/register?role=driver&next=/delivery/profile-setup";
      return;
    }
    if (context === "rider") {
      window.location.href = "/register?role=rider";
      return;
    }
    window.location.href = "/register";
  };

  const buildResetPayload = () => {
    const value = resetIdentifier.trim();
    if (value.includes("@")) {
      return { email: value.toLowerCase() };
    }
    return { phone: value };
  };

  const postToFirstAuthEndpoint = async (path, payload) => {
    let response = null;
    let lastError = null;

    for (const endpoint of getAuthApiCandidates(path)) {
      try {
        response = await axios.post(endpoint, payload);
        break;
      } catch (error) {
        lastError = error;
        if (error?.response) break;
      }
    }

    if (!response) {
      throw lastError || new Error("Request failed");
    }
    return response;
  };

  const startReset = () => {
    setErrorMessage("");
    setResetMessage("");
    setResetCode("");
    setResetNewPassword("");
    setResetConfirmPassword("");
    setResetStep("request");
  };

  const backToLogin = () => {
    setErrorMessage("");
    setResetMessage("");
    setResetStep("login");
  };

  const requestResetCode = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResetMessage("");

    if (!resetIdentifier.trim()) {
      setErrorMessage("Enter your phone number or email.");
      return;
    }

    try {
      setResetLoading(true);
      const response = await postToFirstAuthEndpoint("/auth/forgot-password/", buildResetPayload());
      setResetMessage(response.data?.message || "Reset code sent.");
      setResetStep("verify");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Could not request password reset."));
    } finally {
      setResetLoading(false);
    }
  };

  const verifyResetCode = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResetMessage("");

    if (resetCode.trim().length !== 6) {
      setErrorMessage("Enter the six-digit reset code.");
      return;
    }

    try {
      setResetLoading(true);
      await postToFirstAuthEndpoint("/auth/verify-reset-code/", {
        ...buildResetPayload(),
        code: resetCode.trim(),
      });
      setResetMessage("Code verified. Choose a new password.");
      setResetStep("reset");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Could not verify reset code."));
    } finally {
      setResetLoading(false);
    }
  };

  const submitNewPassword = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    setResetMessage("");

    if (!resetNewPassword || resetNewPassword !== resetConfirmPassword) {
      setErrorMessage("New password and confirmation must match.");
      return;
    }

    try {
      setResetLoading(true);
      const response = await postToFirstAuthEndpoint("/auth/reset-password/", {
        ...buildResetPayload(),
        code: resetCode.trim(),
        new_password: resetNewPassword,
      });
      setPassword("");
      setResetMessage(response.data?.message || "Password reset successfully. You can now log in.");
      setResetStep("login");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Could not reset password."));
    } finally {
      setResetLoading(false);
    }
  };

  const loginContext = getLoginContext();
  const isAdminLogin = loginContext === "admin";
  const isDeliveryLogin = loginContext === "delivery" || getAppType() === "delivery";
  const useSharedLyftLogin = ["rider", "driver"].includes(loginContext);
  const [blockAutofill, setBlockAutofill] = useState(isDeliveryLogin);

  useEffect(() => {
    if (!isDeliveryLogin) return undefined;
    setEmail("");
    setPassword("");
    const timer = window.setTimeout(() => setBlockAutofill(false), 150);
    return () => window.clearTimeout(timer);
  }, [isDeliveryLogin]);

  return (
    <main
      className={`yala-login ${useSharedLyftLogin ? "yala-login--lyft" : ""}${
        isDeliveryLogin ? " yala-login--delivery-uber" : ""
      }${isAdminLogin ? " yala-login--admin" : ""}`}
    >
      <LoginStyles />

      <div className="yala-login__logo-area">
        <img
          src={getLogoForApp()}
          alt={getAppLabel()}
          className="yala-login__logo"
        />
        <h1 className="yala-login__brand">{getAppLabel()}</h1>
        <span className="yala-login__app-hint">{getAppHint()}</span>
        <p className="yala-login__tagline">{getLoginSubtitle() || t("auth.loginSubtitle")}</p>
      </div>

      <form
        onSubmit={
          pending2FA
            ? handleVerify2FA
            : resetStep === "request"
            ? requestResetCode
            : resetStep === "verify"
              ? verifyResetCode
              : resetStep === "reset"
                ? submitNewPassword
                : handleLogin
        }
        className="yala-login__form"
        autoComplete={isDeliveryLogin ? "off" : "on"}
      >
        {errorMessage && (
          <div className="yala-login__error">{errorMessage}</div>
        )}

        {resetMessage && (
          <div className="yala-login__success">{resetMessage}</div>
        )}

        {newDeviceNotice && (
          <div className="yala-login__success">{newDeviceNotice}</div>
        )}

        {pending2FA ? (
          <>
            <p className="yala-login__tagline">
              Enter the 6-digit code from your authenticator app for {pending2FA.email}.
            </p>
            <label className="yala-login__label">
              Authentication code
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="yala-login__input"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </label>
            <button type="submit" disabled={loading} className="yala-login__btn-primary">
              {loading ? "Verifying..." : "Verify 2FA"}
            </button>
            <button
              type="button"
              className="yala-login__link-btn"
              onClick={() => {
                setPending2FA(null);
                setTotpCode("");
                setErrorMessage("");
              }}
            >
              Back to login
            </button>
          </>
        ) : resetStep === "login" ? (
          <>
            <label className="yala-login__label">
              {t("auth.email")}
              <input
                type="email"
                name={isDeliveryLogin ? "delivery-courier-email" : "email"}
                placeholder={isDeliveryLogin ? "Enter your email" : "you@example.com"}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="yala-login__input"
                autoComplete={isDeliveryLogin ? "off" : "email"}
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                readOnly={blockAutofill}
                onFocus={(event) => {
                  if (blockAutofill) {
                    setBlockAutofill(false);
                    event.target.readOnly = false;
                  }
                }}
              />
            </label>

            <label className="yala-login__label">
              {t("auth.password")}
              <input
                type="password"
                name={isDeliveryLogin ? "delivery-courier-password" : "password"}
                placeholder={isDeliveryLogin ? "Enter your password" : "••••••••"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="yala-login__input"
                autoComplete={isDeliveryLogin ? "new-password" : "current-password"}
                readOnly={blockAutofill}
                onFocus={(event) => {
                  if (blockAutofill) {
                    setBlockAutofill(false);
                    event.target.readOnly = false;
                  }
                }}
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="yala-login__btn-primary"
            >
              {loading ? t("auth.signingIn") : t("auth.loginTitle")}
            </button>

            <button
              type="button"
              onClick={startReset}
              className="yala-login__forgot-link"
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={navigateToRegister}
              className="yala-login__btn-secondary"
            >
              {t("auth.createAccount")}
            </button>
          </>
        ) : (
          <>
            <h2 className="yala-login__reset-title">Reset password</h2>
            {resetStep === "request" && (
              <>
                <p className="yala-login__reset-copy">
                  Enter your Mauritania phone number or email. We will send a six-digit code.
                </p>
                <label className="yala-login__label">
                  Phone or email
                  <input
                    type="text"
                    name="reset-identifier"
                    placeholder="+22236123456 or you@example.com"
                    value={resetIdentifier}
                    onChange={(event) => setResetIdentifier(event.target.value)}
                    className="yala-login__input"
                    autoComplete="username"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </label>
              </>
            )}
            {resetStep === "verify" && (
              <label className="yala-login__label">
                Six-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength="6"
                  name="reset-code"
                  placeholder="123456"
                  value={resetCode}
                  onChange={(event) => setResetCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="yala-login__input"
                  autoComplete="one-time-code"
                />
              </label>
            )}
            {resetStep === "reset" && (
              <>
                <label className="yala-login__label">
                  New password
                  <input
                    type="password"
                    name="new-password"
                    value={resetNewPassword}
                    onChange={(event) => setResetNewPassword(event.target.value)}
                    className="yala-login__input"
                    autoComplete="new-password"
                  />
                </label>
                <label className="yala-login__label">
                  Confirm password
                  <input
                    type="password"
                    name="confirm-password"
                    value={resetConfirmPassword}
                    onChange={(event) => setResetConfirmPassword(event.target.value)}
                    className="yala-login__input"
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}
            <button
              type="submit"
              disabled={resetLoading}
              className="yala-login__btn-primary"
            >
              {resetLoading
                ? "Please wait..."
                : resetStep === "request"
                  ? "Send code"
                  : resetStep === "verify"
                    ? "Verify code"
                    : "Reset password"}
            </button>
            <button
              type="button"
              onClick={backToLogin}
              className="yala-login__btn-secondary"
            >
              Back to login
            </button>
          </>
        )}
      </form>

      {!isDeliveryLogin && !isAdminLogin && (
        <button
          type="button"
          onClick={navigateToRegister}
          className="yala-login__footer-link"
        >
          {t("auth.createAccount")}
        </button>
      )}

      {isDeliveryLogin ? (
        <nav className="yala-login__legal-footer" aria-label="Legal">
          <button type="button" onClick={() => { window.location.href = "/delivery/courier/terms"; }}>
            Terms & Conditions
          </button>
        </nav>
      ) : null}
    </main>
  );
}

function LoginStyles() {
  return (
    <style>{`
      .yala-login {
        min-height: 100vh;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px 16px;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        background: linear-gradient(180deg, #0B1220 0%, #0f1d2e 100%);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
      }

      .yala-login * {
        box-sizing: border-box;
      }

      .yala-login__logo-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 32px;
        flex-shrink: 0;
      }

      .yala-login__logo {
        width: 88px;
        height: 88px;
        border-radius: 22px;
        object-fit: cover;
        margin-bottom: 16px;
        box-shadow: 0 8px 32px rgba(0, 166, 81, 0.2);
      }

      .yala-login__brand {
        margin: 0;
        font-size: 28px;
        font-weight: 800;
        color: #fff;
        letter-spacing: -0.5px;
      }

      .yala-login__tagline {
        margin: 8px 0 0;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        line-height: 1.4;
        max-width: 280px;
      }

      .yala-login__app-hint {
        display: inline-flex;
        margin-top: 10px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(0, 166, 81, 0.35);
        background: rgba(0, 166, 81, 0.14);
        color: #86efac;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .yala-login__form {
        width: 100%;
        max-width: 380px;
        padding: 24px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(12px);
      }

      .yala-login__error {
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.4;
      }

      .yala-login__success {
        margin-bottom: 16px;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(34, 197, 94, 0.16);
        border: 1px solid rgba(34, 197, 94, 0.35);
        color: #86efac;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
      }

      .yala-login__reset-title {
        margin: 0 0 8px;
        color: #fff;
        font-size: 22px;
        font-weight: 800;
      }

      .yala-login__reset-copy {
        margin: 0 0 18px;
        color: rgba(255, 255, 255, 0.65);
        font-size: 14px;
        line-height: 1.45;
      }

      .yala-login__label {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
        color: rgba(255, 255, 255, 0.8);
        font-size: 13px;
        font-weight: 600;
      }

      .yala-login__input {
        width: 100%;
        min-height: 48px;
        padding: 0 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 16px;
        outline: none;
        transition: border-color 150ms ease;
        margin: 0;
      }

      .yala-login__input:focus {
        border-color: #00A651;
        box-shadow: 0 0 0 3px rgba(0, 166, 81, 0.15);
      }

      .yala-login__input::placeholder {
        color: rgba(255, 255, 255, 0.35);
      }

      .yala-login__btn-primary {
        width: 100%;
        min-height: 50px;
        margin-top: 8px;
        border: none;
        border-radius: 12px;
        background: #00A651;
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: background 150ms ease, transform 100ms ease;
        -webkit-tap-highlight-color: transparent;
      }

      .yala-login__btn-primary:active {
        transform: scale(0.97);
        background: #008f45;
      }

      .yala-login__btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }

      .yala-login__forgot-link {
        width: 100%;
        margin: 12px 0 2px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.75);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 4px;
      }

      .yala-login__btn-secondary {
        width: 100%;
        min-height: 50px;
        margin-top: 12px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 12px;
        background: transparent;
        color: #fff;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: background 150ms ease, transform 100ms ease;
        -webkit-tap-highlight-color: transparent;
      }

      .yala-login__btn-secondary:active {
        transform: scale(0.97);
        background: rgba(255, 255, 255, 0.08);
      }

      .yala-login__footer-link {
        margin-top: 20px;
        border: none;
        background: transparent;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      @media (min-width: 900px) {
        .yala-login--admin {
          padding: 40px 24px;
        }

        .yala-login--admin .yala-login__form {
          max-width: 440px;
          padding: 32px 36px;
        }

        .yala-login--admin .yala-login__brand {
          font-size: 32px;
        }

        .yala-login--admin .yala-login__tagline {
          max-width: 420px;
          font-size: 15px;
        }
      }

      @media (max-width: 480px) {
        .yala-login {
          justify-content: flex-start;
          padding-top: 60px;
        }

        .yala-login__form {
          padding: 20px;
          border-radius: 16px;
        }
      }

      @media (min-height: 700px) and (max-width: 480px) {
        .yala-login {
          justify-content: center;
          padding-top: 24px;
        }
      }

    `}</style>
  );
}

function getRedirectPath(user) {
  const next = new URLSearchParams(window.location.search).get("next");
  const storedNext = localStorage.getItem("sx_login_redirect");
  const redirect = next || storedNext;

  localStorage.removeItem("sx_login_redirect");

  return getSafeRedirectPath(user, redirect);
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (error) {
    return {};
  }
}

function isJwtUsable(token) {
  if (!token) return false;

  try {
    const [, payload] = token.split(".");
    if (!payload) return true;

    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (!decoded.exp) return true;

    return decoded.exp * 1000 > Date.now() + 30000;
  } catch (error) {
    return Boolean(token);
  }
}
