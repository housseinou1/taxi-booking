import React, { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { API_URL } from "../apiConfig";
import { getSafeRedirectPath } from "./roleRouting";
import { getAppType } from "../native/platform";

const logoSrc = "/yala-logo.png";
const riderLogoSrc = "/yala-rider-logo.png";
const driverLogoSrc = "/yala-driver-logo.png";

function getLogoForApp() {
  const appType = getAppType();
  if (appType === "rider") return riderLogoSrc;
  if (appType === "driver") return driverLogoSrc;
  return logoSrc;
}

function getAppLabel() {
  const appType = getAppType();
  if (appType === "rider") return "Yala Rider";
  if (appType === "driver") return "Yala Driver";
  return "Yala";
}

export default function Login({ onLogin }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Don't redirect here — let App.js handle routing for authenticated users
    // This prevents redirect loops in Capacitor WebView
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage(t("auth.enterCredentials"));
      return;
    }

    try {
      setLoading(true);

      const response = await axios.post(`${API_URL}/auth/login/`, {
        email: email.trim().toLowerCase(),
        password,
      });

      localStorage.setItem("access", response.data.access);
      localStorage.setItem("refresh", response.data.refresh);
      localStorage.setItem("user", JSON.stringify(response.data));

      if (onLogin) {
        onLogin(response.data);
      } else {
        window.location.href = getRedirectPath(response.data);
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.error || t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const navigateToRegister = () => {
    window.location.href = "/register";
  };

  return (
    <main className="yala-login">
      <LoginStyles />

      <div className="yala-login__logo-area">
        <img
          src={getLogoForApp()}
          alt={getAppLabel()}
          className="yala-login__logo"
        />
        <h1 className="yala-login__brand">{getAppLabel()}</h1>
        <p className="yala-login__tagline">{t("auth.loginSubtitle")}</p>
      </div>

      <form onSubmit={handleLogin} className="yala-login__form">
        {errorMessage && (
          <div className="yala-login__error">{errorMessage}</div>
        )}

        <label className="yala-login__label">
          {t("auth.email")}
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="yala-login__input"
            autoComplete="email"
          />
        </label>

        <label className="yala-login__label">
          {t("auth.password")}
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="yala-login__input"
            autoComplete="current-password"
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
          onClick={navigateToRegister}
          className="yala-login__btn-secondary"
        >
          {t("auth.createAccount")}
        </button>
      </form>
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
