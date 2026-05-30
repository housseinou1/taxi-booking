import React, { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { API_URL } from "../apiConfig";

const logoSrc = "/yala-logo.png";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const access = localStorage.getItem("access");
    if (isJwtUsable(access)) {
      window.location.replace(getRedirectPath(getStoredUser()));
    }
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

      window.location.replace(getRedirectPath(response.data));
    } catch (error) {
      setErrorMessage(error.response?.data?.error || t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-login-page" style={pageStyle}>
      <AuthLoginStyles />
      <section style={heroStyle}>
        <div style={brandBlockStyle}>
          <img src={logoSrc} alt="Yala" style={brandLogoStyle} />
          <div>
            <span style={eyebrowStyle}>{t("auth.secureAccess")}</span>
            <h1 style={heroTitleStyle}>{t("auth.welcome")}</h1>
            <p style={heroTextStyle}>{t("auth.loginSubtitle")}</p>
          </div>
        </div>
      </section>

      <form onSubmit={handleLogin} style={cardStyle}>
        <div style={cardHeaderStyle}>
          <span style={pillStyle}>{t("auth.jwt")}</span>
          <h2 style={titleStyle}>{t("auth.loginTitle")}</h2>
          <p style={subtitleStyle}>{t("auth.sessionHint")}</p>
        </div>

        {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

        <label style={labelStyle}>
          {t("auth.email")}
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
        </label>

        <label style={labelStyle}>
          {t("auth.password")}
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={inputStyle}
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? t("auth.signingIn") : t("auth.loginTitle")}
        </button>

        <button
          type="button"
          onClick={() => (window.location.href = "/register")}
          style={secondaryButtonStyle}
        >
          {t("auth.createAccount")}
        </button>
      </form>
    </main>
  );
}

function AuthLoginStyles() {
  return (
    <style>{`
      .auth-login-page * {
        box-sizing: border-box;
      }

      .auth-login-page input::placeholder {
        color: rgba(255, 255, 255, 0.48);
      }

      @media (max-width: 900px) {
        .auth-login-page {
          grid-template-columns: 1fr !important;
          padding: 18px !important;
        }

        .auth-login-page section {
          min-height: auto !important;
          padding-top: 18px;
        }
      }

      @media (max-width: 560px) {
        .auth-login-page {
          padding: 12px !important;
        }

        .auth-login-page form {
          padding: 20px !important;
          border-radius: 22px !important;
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

  if (redirect && redirect.startsWith("/") && redirect !== "/login" && redirect !== "/register") {
    return redirect;
  }

  if (user?.is_staff) return "/admin";
  if (user?.is_driver) return "/driver";
  return "/rider-dashboard";
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

const pageStyle = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 440px)",
  gap: "28px",
  alignItems: "center",
  padding: "28px",
  background:
    "radial-gradient(circle at 14% 16%, rgba(250,204,21,0.18), transparent 28%), radial-gradient(circle at 86% 18%, rgba(22,163,74,0.14), transparent 30%), #05070c",
  color: "white",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif',
};

const heroStyle = {
  minHeight: "calc(100vh - 56px)",
  display: "flex",
  alignItems: "center",
};

const brandBlockStyle = {
  maxWidth: "680px",
};

const brandLogoStyle = {
  width: "min(430px, 100%)",
  aspectRatio: "1.55 / 1",
  objectFit: "cover",
  borderRadius: "28px",
  marginBottom: "28px",
  boxShadow: "0 34px 80px rgba(0,0,0,0.42)",
};

const eyebrowStyle = {
  display: "inline-flex",
  marginBottom: "14px",
  padding: "8px 12px",
  borderRadius: "999px",
  background: "rgba(250,204,21,0.12)",
  color: "#facc15",
  fontSize: "12px",
  fontWeight: 900,
  textTransform: "uppercase",
};

const heroTitleStyle = {
  margin: 0,
  maxWidth: "620px",
  fontSize: "clamp(42px, 6vw, 76px)",
  lineHeight: 0.95,
  letterSpacing: 0,
};

const heroTextStyle = {
  maxWidth: "560px",
  margin: "20px 0 0",
  color: "rgba(255,255,255,0.72)",
  fontSize: "18px",
  lineHeight: 1.55,
};

const cardStyle = {
  width: "100%",
  padding: "26px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "28px",
  background: "rgba(255,255,255,0.09)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.32)",
  backdropFilter: "blur(18px)",
};

const cardHeaderStyle = {
  marginBottom: "20px",
};

const pillStyle = {
  display: "inline-flex",
  marginBottom: "12px",
  padding: "7px 10px",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.1)",
  color: "#f8fafc",
  fontSize: "12px",
  fontWeight: 850,
};

const titleStyle = {
  margin: 0,
  color: "#fff",
  fontSize: "34px",
};

const subtitleStyle = {
  margin: "8px 0 0",
  color: "rgba(255,255,255,0.66)",
  lineHeight: 1.5,
};

const errorStyle = {
  marginBottom: "14px",
  padding: "12px",
  border: "1px solid rgba(248,113,113,0.4)",
  borderRadius: "14px",
  background: "rgba(127,29,29,0.28)",
  color: "#fecaca",
  fontWeight: 800,
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  marginBottom: "14px",
  color: "rgba(255,255,255,0.82)",
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  minHeight: "52px",
  padding: "0 15px",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "16px",
  background: "rgba(255,255,255,0.1)",
  color: "white",
  fontSize: "16px",
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  minHeight: "54px",
  marginTop: "8px",
  border: "none",
  borderRadius: "999px",
  background: "linear-gradient(135deg, #facc15, #f59e0b)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  width: "100%",
  minHeight: "52px",
  marginTop: "12px",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
