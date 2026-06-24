import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import { API_URL } from "../apiConfig";
import { languageOptions, normalizeLanguageCode } from "../i18n";
import { useDriverContext } from "./context/DriverContext";
import { getDriverColors, isDriverLyftUI } from "./lyftColors";
import {
  getRideAlertSoundStyle,
  setRideAlertSoundStyle,
  RIDE_ALERT_SOUND_STYLE_STANDARD,
  RIDE_ALERT_SOUND_STYLE_LYFT,
  playRideRequestAlert,
} from "../native/sound";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
  errorRed: "#EF4444",
};

const GPS_OPTIONS = [
  { value: "high", label: "High Accuracy", icon: "📡" },
  { value: "battery_saver", label: "Battery Saver", icon: "🔋" },
];

const NOTIFICATION_SOUND_OPTIONS = [
  {
    value: RIDE_ALERT_SOUND_STYLE_STANDARD,
    label: "Standard",
    description: "Classic notification chime",
  },
  {
    value: RIDE_ALERT_SOUND_STYLE_LYFT,
    label: "Lyft",
    description: "Clean premium alert sound",
  },
];

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriverSettings() {
  const lyftUI = isDriverLyftUI();
  const themeColors = getDriverColors();
  const token = localStorage.getItem("access");
  const { t, i18n } = useTranslation();
  const { state } = useDriverContext();

  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [notificationSoundStyle, setNotificationSoundStyleState] = useState(
    RIDE_ALERT_SOUND_STYLE_LYFT
  );

  // PIN lock state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  // ─── Fetch Settings ─────────────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`${API_URL}/drivers/me/settings/`, authHeaders);
      setSettings(res.data);
    } catch (err) {
      setError("Failed to load settings. Please try again.");
      console.error("Settings fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    setNotificationSoundStyleState(getRideAlertSoundStyle());
  }, []);

  // ─── Show Toast ─────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ─── Save Setting ───────────────────────────────────────────────────────
  const saveSetting = useCallback(
    async (field, value) => {
      if (!token || saving) return;
      setSaving(true);

      try {
        const res = await axios.patch(
          `${API_URL}/drivers/me/settings/`,
          { [field]: value },
          authHeaders
        );
        setSettings(res.data);
        showToast("Setting saved");
      } catch (err) {
        console.error("Settings save error:", err);
        const detail =
          err.response?.data?.pin_lock?.[0] ||
          err.response?.data?.detail ||
          "Failed to save setting.";
        showToast(detail, "error");
      } finally {
        setSaving(false);
      }
    },
    [authHeaders, token, saving, showToast]
  );

  // ─── Language Change ────────────────────────────────────────────────────
  const handleLanguageChange = useCallback(
    (code) => {
      const normalized = normalizeLanguageCode(code);
      i18n.changeLanguage(normalized);
      saveSetting("language", normalized);
    },
    [i18n, saveSetting]
  );

  // ─── Toggle Handlers ───────────────────────────────────────────────────
  const handleToggle = useCallback(
    (field) => {
      if (!settings) return;
      const newValue = !settings[field];
      setSettings((prev) => ({ ...prev, [field]: newValue }));
      saveSetting(field, newValue);
    },
    [settings, saveSetting]
  );

  // ─── GPS Accuracy Change ───────────────────────────────────────────────
  const handleGpsChange = useCallback(
    (value) => {
      setSettings((prev) => ({ ...prev, gps_accuracy: value }));
      saveSetting("gps_accuracy", value);
    },
    [saveSetting]
  );

  const handleNotificationSoundStyleChange = useCallback(
    async (style) => {
      const normalized = setRideAlertSoundStyle(style);
      setNotificationSoundStyleState(normalized);
      await playRideRequestAlert({ force: true });
      showToast(`Notification sound: ${normalized === "lyft" ? "Lyft" : "Standard"}`);
    },
    [showToast]
  );

  // ─── PIN Lock ──────────────────────────────────────────────────────────
  const handlePinSave = useCallback(() => {
    if (pinInput === "") {
      // Clear PIN
      saveSetting("pin_lock", "");
      setShowPinModal(false);
      setPinInput("");
      setPinError("");
      return;
    }

    if (!pinInput.match(/^\d{4,6}$/)) {
      setPinError("PIN must be 4 to 6 numeric digits.");
      return;
    }

    saveSetting("pin_lock", pinInput);
    setShowPinModal(false);
    setPinInput("");
    setPinError("");
  }, [pinInput, saveSetting]);

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...containerStyle, ...(lyftUI ? { backgroundColor: themeColors.darkNavy, minHeight: "auto", paddingTop: 12 } : null) }} className={lyftUI ? "driver-page--lyft" : undefined}>
        <div style={loadingStyle}>
          <span style={loadingSpinnerStyle}>⏳</span>
          <p style={loadingTextStyle}>Loading settings...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ ...containerStyle, ...(lyftUI ? { backgroundColor: themeColors.darkNavy, minHeight: "auto", paddingTop: 12 } : null) }} className={lyftUI ? "driver-page--lyft" : undefined}>
        <div style={errorCardStyle}>
          <p style={errorTextStyle}>{error}</p>
          <button style={retryButtonStyle} onClick={fetchSettings}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentLanguage = normalizeLanguageCode(
    settings?.language || i18n.language
  );

  return (
    <div
      className={lyftUI ? "driver-page--lyft" : undefined}
      style={{
        ...containerStyle,
        ...(lyftUI ? { backgroundColor: themeColors.darkNavy, minHeight: "auto", paddingTop: 12, paddingBottom: 24 } : null),
      }}
    >
      {/* Mauritania accent bar */}
      {!lyftUI && <div style={mauritaniaAccentBarStyle} aria-hidden="true" />}

      {/* Header */}
      {!lyftUI && (
      <div style={headerStyle}>
        <h1 style={titleStyle}>⚙️ Settings</h1>
        <p style={subtitleStyle}>Customize your app experience</p>
      </div>
      )}

      {/* Language Section */}
      <SettingsSection title="🌐 Language" description="Choose your preferred language">
        <div style={languageGridStyle}>
          {languageOptions.map((option) => (
            <button
              key={option.code}
              style={{
                ...languageButtonStyle,
                ...(currentLanguage === option.code
                  ? languageButtonActiveStyle
                  : {}),
              }}
              onClick={() => handleLanguageChange(option.code)}
              aria-pressed={currentLanguage === option.code}
              aria-label={`Select ${option.nativeName}`}
            >
              <span style={languageNativeStyle}>{option.nativeName}</span>
              <span style={languageLabelStyle}>
                {option.code === "en"
                  ? "English"
                  : option.code === "fr"
                  ? "Français"
                  : "العربية"}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Notifications Section */}
      <SettingsSection
        title="🔔 Notifications"
        description="Manage your notification preferences"
      >
        <ToggleRow
          label="Ride Requests"
          description="New ride request alerts"
          checked={settings?.notifications_rides ?? true}
          onChange={() => handleToggle("notifications_rides")}
        />
        <ToggleRow
          label="Promotions"
          description="Bonus and incentive offers"
          checked={settings?.notifications_promotions ?? true}
          onChange={() => handleToggle("notifications_promotions")}
        />
        <ToggleRow
          label="System Alerts"
          description="App updates and announcements"
          checked={settings?.notifications_system ?? true}
          onChange={() => handleToggle("notifications_system")}
        />
      </SettingsSection>

      <SettingsSection
        title="🎵 Notification Sound"
        description="Choose ride request alert style for this device"
      >
        <div style={soundStyleGridStyle}>
          {NOTIFICATION_SOUND_OPTIONS.map((option) => (
            <button
              key={option.value}
              style={{
                ...soundStyleButtonStyle,
                ...(notificationSoundStyle === option.value
                  ? soundStyleButtonActiveStyle
                  : {}),
              }}
              onClick={() => handleNotificationSoundStyleChange(option.value)}
              aria-pressed={notificationSoundStyle === option.value}
              aria-label={`Use ${option.label} notification sound`}
            >
              <span style={soundStyleLabelStyle}>{option.label}</span>
              <span style={soundStyleDescStyle}>{option.description}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* GPS Accuracy Section */}
      <SettingsSection
        title="📍 GPS Accuracy"
        description="Balance accuracy and battery life"
      >
        <div style={gpsGridStyle}>
          {GPS_OPTIONS.map((option) => (
            <button
              key={option.value}
              style={{
                ...gpsButtonStyle,
                ...(settings?.gps_accuracy === option.value
                  ? gpsButtonActiveStyle
                  : {}),
              }}
              onClick={() => handleGpsChange(option.value)}
              aria-pressed={settings?.gps_accuracy === option.value}
            >
              <span style={gpsIconStyle}>{option.icon}</span>
              <span style={gpsLabelStyle}>{option.label}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Dark Mode Section */}
      {!lyftUI && (
      <SettingsSection title="🌙 Appearance" description="Toggle dark mode">
        <ToggleRow
          label="Dark Mode"
          description="Use dark theme for the app"
          checked={settings?.dark_mode ?? false}
          onChange={() => handleToggle("dark_mode")}
        />
      </SettingsSection>
      )}

      {/* Security Section */}
      <SettingsSection
        title="🔒 Security"
        description="Protect your account access"
      >
        <div style={securityRowStyle}>
          <div style={securityInfoStyle}>
            <span style={securityLabelStyle}>PIN Lock</span>
            <span style={securityDescStyle}>
              {settings?.pin_lock !== undefined && settings?.pin_lock !== ""
                ? "PIN is set (4-6 digits)"
                : "No PIN set"}
            </span>
          </div>
          <button
            style={securityButtonStyle}
            onClick={() => setShowPinModal(true)}
          >
            {settings?.pin_lock !== undefined && settings?.pin_lock !== ""
              ? "Change"
              : "Set PIN"}
          </button>
        </div>
        <ToggleRow
          label="Biometric Authentication"
          description="Use fingerprint or face ID"
          checked={settings?.biometric_enabled ?? false}
          onChange={() => handleToggle("biometric_enabled")}
        />
      </SettingsSection>

      {/* Privacy Section */}
      <SettingsSection
        title="👁️ Privacy"
        description="Control what riders can see"
      >
        <ToggleRow
          label="Show Name"
          description="Display your name to riders"
          checked={settings?.privacy_show_name ?? true}
          onChange={() => handleToggle("privacy_show_name")}
        />
        <ToggleRow
          label="Show Photo"
          description="Display your profile photo to riders"
          checked={settings?.privacy_show_photo ?? true}
          onChange={() => handleToggle("privacy_show_photo")}
        />
        <ToggleRow
          label="Show Vehicle"
          description="Display vehicle details to riders"
          checked={settings?.privacy_show_vehicle ?? true}
          onChange={() => handleToggle("privacy_show_vehicle")}
        />
      </SettingsSection>

      {/* PIN Modal */}
      {showPinModal && (
        <PinModal
          pinInput={pinInput}
          setPinInput={setPinInput}
          pinError={pinError}
          onSave={handlePinSave}
          onCancel={() => {
            setShowPinModal(false);
            setPinInput("");
            setPinError("");
          }}
          hasPinSet={
            settings?.pin_lock !== undefined && settings?.pin_lock !== ""
          }
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            ...toastStyle,
            backgroundColor:
              toast.type === "error" ? COLORS.errorRed : COLORS.primaryGreen,
          }}
          role="alert"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function SettingsSection({ title, description, children }) {
  return (
    <div style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        {description && <p style={sectionDescStyle}>{description}</p>}
      </div>
      <div style={sectionCardStyle}>{children}</div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={toggleRowStyle}>
      <div style={toggleInfoStyle}>
        <span style={toggleLabelStyle}>{label}</span>
        {description && <span style={toggleDescStyle}>{description}</span>}
      </div>
      <button
        style={{
          ...toggleButtonStyle,
          backgroundColor: checked ? COLORS.primaryGreen : "#334155",
        }}
        onClick={onChange}
        role="switch"
        aria-checked={checked}
        aria-label={`${label} toggle`}
      >
        <span
          style={{
            ...toggleKnobStyle,
            transform: checked ? "translateX(28px)" : "translateX(0)",
          }}
        />
      </button>
    </div>
  );
}

function PinModal({ pinInput, setPinInput, pinError, onSave, onCancel, hasPinSet }) {
  return (
    <div style={modalOverlayStyle} onClick={onCancel}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={modalTitleStyle}>
          {hasPinSet ? "Change PIN Lock" : "Set PIN Lock"}
        </h3>
        <p style={modalDescStyle}>Enter a 4-6 digit numeric PIN</p>

        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pinInput}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPinInput(val);
          }}
          placeholder="Enter PIN (4-6 digits)"
          style={pinInputStyle}
          autoFocus
          aria-label="PIN input"
        />

        {pinError && <p style={pinErrorStyle}>{pinError}</p>}

        <div style={modalActionsStyle}>
          {hasPinSet && (
            <button
              style={modalRemoveButtonStyle}
              onClick={() => {
                setPinInput("");
                onSave();
              }}
            >
              Remove PIN
            </button>
          )}
          <button style={modalCancelButtonStyle} onClick={onCancel}>
            Cancel
          </button>
          <button style={modalSaveButtonStyle} onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "24px 16px 80px",
  overflowY: "auto",
  fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const mauritaniaAccentBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  background: `linear-gradient(90deg, ${COLORS.primaryGreen} 0%, ${COLORS.goldAccent} 50%, ${COLORS.primaryGreen} 100%)`,
};

// ─── Header ─────────────────────────────────────────────────────────────────

const headerStyle = {
  marginBottom: "24px",
  paddingTop: "12px",
};

const titleStyle = {
  color: COLORS.white,
  fontSize: "24px",
  fontWeight: 800,
  margin: "0 0 4px",
};

const subtitleStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
  fontWeight: 500,
  margin: 0,
};

// ─── Loading & Error ────────────────────────────────────────────────────────

const loadingStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
};

const loadingSpinnerStyle = {
  fontSize: "32px",
  marginBottom: "12px",
};

const loadingTextStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
};

const errorCardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  gap: "16px",
};

const errorTextStyle = {
  color: COLORS.errorRed,
  fontSize: "14px",
  textAlign: "center",
};

const retryButtonStyle = {
  padding: "10px 24px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

// ─── Sections ───────────────────────────────────────────────────────────────

const sectionStyle = {
  marginBottom: "20px",
};

const sectionHeaderStyle = {
  marginBottom: "10px",
};

const sectionTitleStyle = {
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: 800,
  margin: "0 0 2px",
};

const sectionDescStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  margin: 0,
};

const sectionCardStyle = {
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "16px",
  padding: "16px",
  backdropFilter: "blur(8px)",
};

// ─── Language ───────────────────────────────────────────────────────────────

const languageGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px",
};

const languageButtonStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
  padding: "14px 8px",
  borderRadius: "14px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: COLORS.cardBorder,
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  color: COLORS.white,
  cursor: "pointer",
  transition: "all 200ms ease",
  fontFamily: "inherit",
};

const languageButtonActiveStyle = {
  borderColor: COLORS.goldAccent,
  backgroundColor: "rgba(212, 175, 55, 0.12)",
  boxShadow: `0 4px 16px rgba(212, 175, 55, 0.2)`,
};

const languageNativeStyle = {
  fontSize: "15px",
  fontWeight: 900,
};

const languageLabelStyle = {
  fontSize: "11px",
  color: COLORS.lightGray,
  fontWeight: 600,
};

// ─── GPS ────────────────────────────────────────────────────────────────────

const gpsGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const gpsButtonStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "16px 12px",
  borderRadius: "14px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: COLORS.cardBorder,
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  color: COLORS.white,
  cursor: "pointer",
  transition: "all 200ms ease",
  fontFamily: "inherit",
};

const gpsButtonActiveStyle = {
  borderColor: COLORS.primaryGreen,
  backgroundColor: "rgba(0, 166, 81, 0.12)",
  boxShadow: `0 4px 16px rgba(0, 166, 81, 0.2)`,
};

const gpsIconStyle = {
  fontSize: "24px",
};

const gpsLabelStyle = {
  fontSize: "13px",
  fontWeight: 700,
};

const soundStyleGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const soundStyleButtonStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: "4px",
  padding: "14px 12px",
  borderRadius: "14px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: COLORS.cardBorder,
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  color: COLORS.white,
  cursor: "pointer",
  transition: "all 200ms ease",
  fontFamily: "inherit",
  textAlign: "left",
};

const soundStyleButtonActiveStyle = {
  borderColor: COLORS.primaryGreen,
  backgroundColor: "rgba(0, 166, 81, 0.12)",
  boxShadow: "0 4px 16px rgba(0, 166, 81, 0.2)",
};

const soundStyleLabelStyle = {
  fontSize: "14px",
  fontWeight: 800,
  color: COLORS.white,
};

const soundStyleDescStyle = {
  fontSize: "11px",
  color: COLORS.lightGray,
  fontWeight: 600,
};

// ─── Toggle Row ─────────────────────────────────────────────────────────────

const toggleRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 0",
  borderBottom: `1px solid ${COLORS.cardBorder}`,
};

const toggleInfoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const toggleLabelStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
};

const toggleDescStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
};

const toggleButtonStyle = {
  width: "62px",
  height: "34px",
  borderRadius: "999px",
  padding: "4px",
  border: "none",
  cursor: "pointer",
  transition: "background-color 200ms ease",
  flexShrink: 0,
};

const toggleKnobStyle = {
  display: "block",
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  backgroundColor: COLORS.white,
  transition: "transform 200ms ease",
};

// ─── Security ───────────────────────────────────────────────────────────────

const securityRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "12px 0",
  borderBottom: `1px solid ${COLORS.cardBorder}`,
};

const securityInfoStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const securityLabelStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
};

const securityDescStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
};

const securityButtonStyle = {
  padding: "8px 16px",
  borderRadius: "999px",
  border: `1px solid ${COLORS.goldAccent}`,
  backgroundColor: "transparent",
  color: COLORS.goldAccent,
  fontWeight: 700,
  fontSize: "12px",
  cursor: "pointer",
};

// ─── PIN Modal ──────────────────────────────────────────────────────────────

const modalOverlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: "16px",
};

const modalContentStyle = {
  backgroundColor: "#1E293B",
  borderRadius: "16px",
  padding: "24px",
  width: "100%",
  maxWidth: "360px",
  border: `1px solid ${COLORS.cardBorder}`,
};

const modalTitleStyle = {
  color: COLORS.white,
  fontSize: "18px",
  fontWeight: 800,
  margin: "0 0 4px",
};

const modalDescStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  margin: "0 0 16px",
};

const pinInputStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: "12px",
  border: `1px solid ${COLORS.cardBorder}`,
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  color: COLORS.white,
  fontSize: "18px",
  fontWeight: 700,
  letterSpacing: "8px",
  textAlign: "center",
  outline: "none",
  boxSizing: "border-box",
};

const pinErrorStyle = {
  color: COLORS.errorRed,
  fontSize: "12px",
  margin: "8px 0 0",
};

const modalActionsStyle = {
  display: "flex",
  gap: "10px",
  marginTop: "20px",
  justifyContent: "flex-end",
};

const modalCancelButtonStyle = {
  padding: "10px 18px",
  borderRadius: "999px",
  border: `1px solid ${COLORS.cardBorder}`,
  backgroundColor: "transparent",
  color: COLORS.lightGray,
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const modalSaveButtonStyle = {
  padding: "10px 18px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
};

const modalRemoveButtonStyle = {
  padding: "10px 18px",
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.errorRed,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "13px",
  cursor: "pointer",
  marginRight: "auto",
};

// ─── Toast ──────────────────────────────────────────────────────────────────

const toastStyle = {
  position: "fixed",
  bottom: "90px",
  left: "50%",
  transform: "translateX(-50%)",
  padding: "12px 24px",
  borderRadius: "14px",
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "13px",
  zIndex: 2000,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
  animation: "fadeIn 200ms ease",
};
