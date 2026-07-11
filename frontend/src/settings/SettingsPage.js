import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { languageOptions, normalizeLanguageCode } from "../i18n";
import { MARKET } from "../marketConfig";
import LegalCenter from "../legal/LegalCenter";
import TrustedContactsSection from "../safety/TrustedContactsSection";

const LOGO_SRC = "/yala-logo.png";

function SettingsPage({ onLogout, riderMode = false }) {
  const { t, i18n } = useTranslation();
  const user = useMemo(() => getStoredUser(), []);
  const [language, setLanguage] = useState(normalizeLanguageCode(i18n.language));
  const [theme, setTheme] = useState(
    () => localStorage.getItem("sx_theme") || (riderMode ? "Light" : "Dark"),
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem("sx_notifications") !== "off"
  );

  const saveLanguage = (value) => {
    const code = normalizeLanguageCode(value);
    setLanguage(code);
    i18n.changeLanguage(code);
  };

  const saveTheme = (value) => {
    setTheme(value);
    localStorage.setItem("sx_theme", value);
  };

  const toggleNotifications = () => {
    const nextValue = !notificationsEnabled;
    setNotificationsEnabled(nextValue);
    localStorage.setItem("sx_notifications", nextValue ? "on" : "off");
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");

    if (typeof onLogout === "function") {
      onLogout();
      return;
    }

    window.location.href = "/login";
  };

  const settingsSections = [
    {
      title: t("settings.profile"),
      description: t("settings.profileDescription"),
      value: user?.email || user?.phone || t("settings.account"),
      action: () => (window.location.href = "/rider-dashboard"),
    },
    {
      title: t("settings.safetyEmergency"),
      description: t("settings.safetyDescription"),
      value: "Police 117",
      action: () => (window.location.href = "/support"),
    },
    {
      title: t("settings.paymentMethods"),
      description: t("settings.paymentDescription"),
      value: t("settings.openWallet"),
      action: () => (window.location.href = "/rider-payments"),
    },
    {
      title: t("settings.privacy"),
      description: t("settings.privacyDescription"),
      value: t("settings.viewPolicy"),
      action: () => { window.location.href = "/privacy"; },
    },
    {
      title: "Delete account",
      description: "Request deletion of your Yala account and associated personal data.",
      value: "Deletion request",
      action: () => window.open("https://yalataxi.live/account-deletion", "_blank", "noopener,noreferrer"),
    },
    {
      title: t("settings.helpSupport"),
      description: t("settings.helpDescription"),
      value: t("settings.contactSupport"),
      action: () => (window.location.href = "/support"),
    },
  ];

  return (
    <main className={`settings-page settings-${theme.toLowerCase()} ${riderMode ? "settings-page--rider settings-page--lyft" : ""}`}>
      <SettingsPageStyles />

      {!riderMode && (
      <header className="settings-topbar">
        <button className="settings-brand" onClick={() => (window.location.href = "/")}>
          <img src={LOGO_SRC} alt={`${MARKET.brandName} logo`} />
          <span>{t("common.brand")}</span>
        </button>

        <nav>
          <button onClick={() => (window.location.href = "/rider-dashboard")}>{t("common.rider")}</button>
          <button onClick={() => (window.location.href = "/driver")}>{t("common.driver")}</button>
          <button onClick={() => (window.location.href = "/admin")}>{t("common.admin")}</button>
        </nav>
      </header>
      )}

      {!riderMode && (
      <section className="settings-hero">
        <div>
          <span className="settings-kicker">{t("settings.accountCenter")}</span>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.hero")}</p>
        </div>

        <aside className="settings-profile-card">
          <img src={LOGO_SRC} alt={`${MARKET.brandName} account`} />
          <div>
            <strong>{user?.first_name || user?.name || t("common.brand")}</strong>
            <span>{user?.email || t("settings.mobilityAccount")}</span>
          </div>
        </aside>
      </section>
      )}

      <section className="settings-grid">
        <article className="settings-panel settings-preferences">
          <div className="settings-panel-heading">
            <span>{t("settings.preferences")}</span>
            <h2>{t("settings.appExperience")}</h2>
          </div>

          <SettingControl
            title={t("settings.language")}
            description={t("settings.languageDescription")}
            control={
              <LanguageSelector
                value={language}
                options={languageOptions}
                onChange={saveLanguage}
                t={t}
              />
            }
          />

          {!riderMode && (
          <SettingControl
            title={t("settings.theme")}
            description={t("settings.themeDescription")}
            control={
              <SegmentedControl
                value={theme}
                options={[
                  { value: "Light", label: t("settings.light") },
                  { value: "Dark", label: t("settings.dark") },
                ]}
                onChange={saveTheme}
                compact
              />
            }
          />
          )}

          <SettingControl
            title={t("settings.notifications")}
            description={t("settings.notificationsDescription")}
            control={
              <button
                className={`settings-toggle ${notificationsEnabled ? "on" : ""}`}
                onClick={toggleNotifications}
                aria-label="Toggle notifications"
              >
                <span />
              </button>
            }
          />
        </article>

        <article className="settings-panel settings-options">
          <div className="settings-panel-heading">
            <span>{t("settings.manage")}</span>
            <h2>{t("settings.accountSettings")}</h2>
          </div>

          {settingsSections.map((item) => (
            <button key={item.title} className="settings-option" onClick={item.action}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </div>
              <em>{item.value}</em>
            </button>
          ))}

          {riderMode ? (
            <div style={{ marginTop: 16 }}>
              <TrustedContactsSection compact />
            </div>
          ) : null}

          {riderMode ? (
            <div style={{ marginTop: 16 }}>
              <LegalCenter app="rider" />
            </div>
          ) : null}
        </article>
      </section>

      <section className="settings-emergency-panel">
        <div>
          <span className="settings-kicker">{t("settings.emergency")}</span>
          <h2>{t("settings.safetyNumbers")}</h2>
          <p>{t("settings.safetyNumbersDescription")}</p>
        </div>

        <div className="settings-emergency-grid">
          {MARKET.emergencyNumbers.map((contact) => (
            <a key={contact.number} href={`tel:${contact.number}`}>
              <strong>{contact.label}</strong>
              <span>{contact.number}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="settings-logout-panel">
        <div>
          <span className="settings-kicker">{t("settings.session")}</span>
          <strong>{t("settings.logout")}</strong>
          <p>{t("settings.logoutDescription")}</p>
        </div>
        <button onClick={logout}>{t("common.logout")}</button>
      </section>
    </main>
  );
}

function SettingControl({ title, description, control }) {
  return (
    <div className="settings-control">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {control}
    </div>
  );
}

function SegmentedControl({ value, options, onChange, compact = false }) {
  return (
    <div className={`settings-segmented ${compact ? "compact" : ""}`}>
      {options.map((option) => (
        <button
          key={option.value || option}
          className={value === (option.value || option) ? "active" : ""}
          onClick={() => onChange(option.value || option)}
        >
          {option.label || option}
        </button>
      ))}
    </div>
  );
}

function LanguageSelector({ value, options, onChange, t }) {
  return (
    <div className="settings-language-selector">
      {options.map((option) => (
        <button
          key={option.code}
          className={value === option.code ? "active" : ""}
          onClick={() => onChange(option.code)}
        >
          <span>{option.nativeName}</span>
          <small>{t(option.labelKey)}</small>
        </button>
      ))}
    </div>
  );
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch (error) {
    return {};
  }
}

function SettingsPageStyles() {
  return (
    <style>{`
      .settings-page {
        min-height: 100vh;
        padding: 18px;
        background:
          radial-gradient(circle at 12% 8%, rgba(245, 158, 11, 0.2), transparent 28%),
          radial-gradient(circle at 84% 10%, rgba(16, 185, 129, 0.16), transparent 30%),
          #05070d;
        color: #f8fafc;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .settings-page * {
        box-sizing: border-box;
      }

      .settings-light {
        background:
          radial-gradient(circle at 12% 8%, rgba(245, 158, 11, 0.18), transparent 28%),
          #eef2f6;
        color: #0f172a;
      }

      .settings-topbar,
      .settings-hero,
      .settings-panel,
      .settings-emergency-panel,
      .settings-logout-panel {
        width: min(1180px, 100%);
        margin: 0 auto;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.86);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(18px);
      }

      .settings-light .settings-topbar,
      .settings-light .settings-hero,
      .settings-light .settings-panel,
      .settings-light .settings-emergency-panel,
      .settings-light .settings-logout-panel {
        border-color: rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.9);
        box-shadow: 0 20px 55px rgba(15, 23, 42, 0.12);
      }

      .settings-topbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        min-height: 68px;
        padding: 10px 12px;
        position: sticky;
        top: 12px;
        z-index: 20;
      }

      .settings-brand,
      .settings-topbar nav button,
      .settings-option,
      .settings-segmented button,
      .settings-toggle,
      .settings-logout-panel button {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .settings-brand {
        display: inline-flex;
        align-items: center;
        gap: 11px;
        min-width: 0;
        background: transparent;
        color: inherit;
        font-weight: 950;
      }

      .settings-brand img,
      .settings-profile-card img {
        width: 46px;
        height: 46px;
        border-radius: 8px;
        object-fit: cover;
      }

      .settings-topbar nav {
        display: flex;
        gap: 8px;
      }

      .settings-topbar nav button {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 850;
      }

      .settings-light .settings-topbar nav button {
        background: #f1f5f9;
      }

      .settings-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 320px;
        gap: 20px;
        align-items: center;
        margin-top: 18px;
        padding: 34px;
      }

      .settings-kicker,
      .settings-panel-heading span {
        display: block;
        color: #fbbf24;
        font-size: 12px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 8px;
      }

      .settings-hero h1 {
        margin: 0;
        font-size: clamp(38px, 6vw, 72px);
        line-height: 0.96;
        letter-spacing: 0;
      }

      .settings-hero p,
      .settings-control span,
      .settings-option span,
      .settings-logout-panel p,
      .settings-emergency-panel p {
        color: #cbd5e1;
        line-height: 1.65;
      }

      .settings-light .settings-hero p,
      .settings-light .settings-control span,
      .settings-light .settings-option span,
      .settings-light .settings-logout-panel p,
      .settings-light .settings-emergency-panel p {
        color: #64748b;
      }

      .settings-profile-card {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.07);
      }

      .settings-light .settings-profile-card {
        background: #f8fafc;
        border-color: #e2e8f0;
      }

      .settings-profile-card div {
        display: grid;
        gap: 4px;
        min-width: 0;
      }

      .settings-profile-card span {
        color: #94a3b8;
        overflow-wrap: anywhere;
      }

      .settings-grid {
        width: min(1180px, 100%);
        margin: 18px auto;
        display: grid;
        grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
        gap: 18px;
      }

      .settings-panel,
      .settings-emergency-panel,
      .settings-logout-panel {
        padding: 22px;
      }

      .settings-panel-heading {
        margin-bottom: 16px;
      }

      .settings-panel-heading h2,
      .settings-emergency-panel h2 {
        margin: 0;
        font-size: 28px;
        letter-spacing: 0;
      }

      .settings-control,
      .settings-option {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        padding: 16px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .settings-light .settings-control,
      .settings-light .settings-option {
        border-top-color: #e2e8f0;
      }

      .settings-control div,
      .settings-option div {
        display: grid;
        gap: 4px;
        text-align: left;
      }

      .settings-option {
        background: transparent;
        color: inherit;
      }

      .settings-option em {
        color: #fbbf24;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }

      .settings-segmented {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 5px;
        width: min(330px, 100%);
        padding: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .settings-segmented.compact {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        width: min(220px, 100%);
      }

      .settings-light .settings-segmented {
        background: #e2e8f0;
      }

      .settings-segmented button {
        min-height: 38px;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font-weight: 900;
      }

      .settings-segmented button.active {
        background: #fff;
        color: #020617;
      }

      .settings-language-selector {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        width: min(420px, 100%);
      }

      .settings-language-selector button {
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        min-height: 72px;
        padding: 10px;
        display: grid;
        gap: 4px;
        align-content: center;
        text-align: center;
        font: inherit;
        cursor: pointer;
      }

      .settings-light .settings-language-selector button {
        border-color: #e2e8f0;
        background: #f8fafc;
      }

      .settings-language-selector button.active {
        background: #fff;
        color: #020617;
        border-color: #fbbf24;
        box-shadow: 0 14px 30px rgba(251, 191, 36, 0.18);
      }

      .settings-language-selector span {
        font-weight: 950;
      }

      .settings-language-selector small {
        color: #94a3b8;
        font-weight: 850;
      }

      .settings-toggle {
        width: 62px;
        height: 34px;
        border-radius: 999px;
        padding: 4px;
        background: #334155;
      }

      .settings-toggle span {
        display: block;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background: #fff;
        transition: transform 180ms ease;
      }

      .settings-toggle.on {
        background: #16a34a;
      }

      .settings-toggle.on span {
        transform: translateX(28px);
      }

      .settings-emergency-panel,
      .settings-logout-panel {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        margin-top: 18px;
      }

      .settings-emergency-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(90px, 1fr));
        gap: 10px;
      }

      .settings-emergency-grid a {
        display: grid;
        gap: 5px;
        min-width: 112px;
        padding: 13px;
        border-radius: 8px;
        background: #ef4444;
        color: #fff;
        text-decoration: none;
        font-weight: 900;
      }

      .settings-logout-panel button {
        min-height: 48px;
        padding: 0 20px;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        font-weight: 950;
      }

      @media (max-width: 880px) {
        .settings-hero,
        .settings-grid,
        .settings-emergency-panel,
        .settings-logout-panel {
          grid-template-columns: 1fr;
        }

        .settings-topbar {
          position: static;
          flex-wrap: wrap;
        }

        .settings-control,
        .settings-option {
          align-items: stretch;
          flex-direction: column;
        }

        .settings-segmented,
        .settings-segmented.compact,
        .settings-language-selector {
          width: 100%;
        }
      }

      @media (max-width: 520px) {
        .settings-page {
          padding: 10px;
        }

        .settings-topbar nav {
          width: 100%;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
        }

        .settings-brand span {
          max-width: 170px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .settings-hero,
        .settings-panel,
        .settings-emergency-panel,
        .settings-logout-panel {
          padding: 18px;
        }

        .settings-emergency-grid {
          grid-template-columns: 1fr;
        }

        .settings-language-selector {
          grid-template-columns: 1fr;
        }
      }

      .settings-page--rider {
        min-height: auto;
        padding: 0 16px 24px;
        background: #ffffff;
        color: #111827;
      }

      .settings-page--rider .settings-grid {
        margin-top: 8px;
      }

      .settings-page--rider .settings-panel,
      .settings-page--rider .settings-emergency-panel,
      .settings-page--rider .settings-logout-panel {
        border: 1px solid #e5e7eb;
        background: #ffffff;
        box-shadow: none;
      }

      .settings-page--rider .settings-option {
        border-color: #e5e7eb;
        background: #f9fafb;
      }
    `}</style>
  );
}

export default SettingsPage;
