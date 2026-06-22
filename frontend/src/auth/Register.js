import React, { useEffect, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { API_URL, getApiCandidates } from "../apiConfig";
import { getAppType, isRiderLyftUI } from "../native/platform";

const logoSrc = "/yala-logo.png";
const riderLogoSrc = "/yala-rider-logo.png";
const driverLogoSrc = "/yala-driver-logo.png";

function getLogoForApp() {
  const appType = getAppType();
  if (appType === "rider") return riderLogoSrc;
  if (appType === "driver") return driverLogoSrc;
  return logoSrc;
}

/**
 * Determines the initial user type for the registration form.
 * Priority: getAppType() (if "driver" or "rider") > URL ?role= param > default "rider"
 * When getAppType() returns a known app type, it is final and non-overridable.
 */
const getRequestedRole = () => {
  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get("role");
  const nextParam = params.get("next") || "";
  const storedNext = localStorage.getItem("sx_login_redirect") || "";

  const normalizeRoute = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return new URL(raw).pathname || "";
      }
      return raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
    } catch (error) {
      return raw.startsWith("/") ? raw : `/${raw.replace(/^\/+/, "")}`;
    }
  };

  const nextRoute = normalizeRoute(nextParam || storedNext);
  if (nextRoute === "/admin" || nextRoute === "/admin-dashboard" || nextRoute.startsWith("/admin/")) {
    return "admin";
  }

  return requestedRole === "driver" || requestedRole === "rider" || requestedRole === "admin"
    ? requestedRole
    : "";
};

const getInitialUserType = () => {
  const appType = getAppType();
  if (appType === "driver" || appType === "rider") {
    return appType;
  }
  const requestedRole = getRequestedRole();
  if (requestedRole === "admin") return "admin";
  return requestedRole === "driver" ? "driver" : "rider";
};

/**
 * Returns true when the app type is known (driver or rider),
 * meaning the user type toggle should be hidden and user_type is locked.
 */
const isAppTypeLocked = () => {
  const appType = getAppType();
  const requestedRole = getRequestedRole();
  return appType === "driver" || appType === "rider" || Boolean(requestedRole);
};

function Register() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    gender: "Male",
    phone_number: "",
    national_id_number: "",
    city: "",
    password: "",
    user_type: getInitialUserType(),
  });
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);
  const [nationalIdDocument, setNationalIdDocument] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationStep, setVerificationStep] = useState(false);
  const [debugCode, setDebugCode] = useState("");
  const registrationRoles = !verificationStep && !isAppTypeLocked()
    ? ["rider", "driver"]
    : [];

  useEffect(() => {
    let isActive = true;

    const loadCities = async () => {
      let lastError = null;

      for (const endpoint of getApiCandidates("/cities/")) {
        try {
          const { data } = await axios.get(endpoint);
          if (isActive) {
            const cityGroups = Array.isArray(data) ? data : [];
            setCities(
              cityGroups.flatMap((region) =>
                (region.cities || []).map((city) => ({
                  ...city,
                  region_name: region.name,
                })),
              ),
            );
            setErrorMessage("");
          }
          return;
        } catch (error) {
          lastError = error;
          if (error?.response) {
            break;
          }
        }
      }

      if (isActive) {
        setErrorMessage(
          lastError?.response
            ? "Unable to load cities. Run: python manage.py bootstrap_yala"
            : "Unable to reach the Yala server. Start backend on port 8000.",
        );
      }
    };

    loadCities()
      .finally(() => {
        if (isActive) {
          setCitiesLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const handleChange = (event) => {
    // Prevent overriding user_type when app type is locked
    if (event.target.name === "user_type" && isAppTypeLocked()) {
      return;
    }
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const registerUser = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (!formData.city) {
      setErrorMessage("Please select your city.");
      return;
    }

    if (formData.user_type === "rider" && !profilePicture) {
      setErrorMessage(t("auth.riderPhotoRequired"));
      return;
    }

    if (formData.user_type === "rider" && !nationalIdDocument) {
      setErrorMessage(t("auth.nationalIdDocumentRequired"));
      return;
    }

    // Validate file types before submission
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
    const ALLOWED_DOC_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];

    if (profilePicture && !ALLOWED_IMAGE_TYPES.includes(profilePicture.type)) {
      setErrorMessage("Profile photo must be a JPG, PNG, or WebP image.");
      return;
    }

    if (nationalIdDocument && !ALLOWED_DOC_TYPES.includes(nationalIdDocument.type)) {
      setErrorMessage("National ID must be uploaded as a PDF, JPG, PNG, or WebP file. Other formats like AVIF or AVI are not supported.");
      return;
    }

    try {
      setLoading(true);

      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        payload.append(key, value);
      });

      if (profilePicture) {
        payload.append("profile_picture", profilePicture);
      }

      if (nationalIdDocument) {
        payload.append("national_id_document", nationalIdDocument);
      }

      const postWithFallback = async (path, data, config = {}) => {
        let lastError = null;
        for (const endpoint of getApiCandidates(path)) {
          try {
            return await axios.post(endpoint, data, config);
          } catch (error) {
            lastError = error;
            if (error?.response) {
              throw error;
            }
          }
        }
        throw lastError || new Error("Network request failed");
      };

      await postWithFallback("/auth/register/", payload, {
        headers: {
          "X-App-Type": getAppType(),
        },
      });

      const loginResponse = await postWithFallback("/auth/login/", {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      localStorage.setItem("access", loginResponse.data.access);
      localStorage.setItem("refresh", loginResponse.data.refresh);
      localStorage.setItem("user", JSON.stringify(loginResponse.data));

      const codeResponse = await postWithFallback(
        "/auth/phone/request-code/",
        {},
        { headers: { Authorization: `Bearer ${loginResponse.data.access}` } },
      );
      setDebugCode(codeResponse.data.debug_code || "");
      setVerificationStep(true);
      return;
    } catch (error) {
      const response = error.response?.data || {};
      const message =
        response.email?.[0] ||
        response.first_name?.[0] ||
        response.last_name?.[0] ||
        response.gender?.[0] ||
        response.national_id_number?.[0] ||
        response.city?.[0] ||
        response.password?.[0] ||
        response.user_type?.[0] ||
        response.phone_number?.[0] ||
        response.profile_picture ||
        response.national_id_document ||
        response.app_type?.[0] ||
        response.detail ||
        response.error ||
        (error.response ? JSON.stringify(response) : `Network error: ${error.message}`);

      setErrorMessage(Array.isArray(message) ? message[0] : message);
    } finally {
      setLoading(false);
    }
  };

  const citiesByRegion = cities.reduce((groups, city) => {
    const regionName = city.region_name || "Other";
    if (!groups[regionName]) {
      groups[regionName] = [];
    }
    groups[regionName].push(city);
    return groups;
  }, {});

  const finishRegistration = () => {
      if (formData.user_type === "rider") {
        localStorage.setItem("needs_payment_setup", "true");
        localStorage.removeItem("needs_vehicle_setup");
        window.location.replace("/payment-setup");
        return;
      }

      if (formData.user_type === "driver") {
        localStorage.setItem("needs_vehicle_setup", "true");
        localStorage.removeItem("needs_payment_setup");
        window.location.replace("/driver-vehicle-setup");
        return;
      }

      if (formData.user_type === "admin") {
        localStorage.removeItem("needs_payment_setup");
        localStorage.removeItem("needs_vehicle_setup");
        window.location.replace("/admin");
        return;
      }

      window.location.replace("/");
  };

  const verifyPhone = async (event) => {
    event.preventDefault();
    setErrorMessage("");
    try {
      setLoading(true);
      await axios.post(
        `${API_URL}/auth/phone/verify/`,
        { code: verificationCode },
        { headers: { Authorization: `Bearer ${localStorage.getItem("access")}` } },
      );
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      localStorage.setItem("user", JSON.stringify({ ...user, phone_verified: true }));
      finishRegistration();
    } catch (error) {
      const response = error.response?.data || {};
      setErrorMessage(response.error || response.detail || "Phone verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const isRiderLyft = isRiderLyftUI() || formData.user_type === "rider";

  return (
    <main className={`auth-register-page${isRiderLyft ? " auth-register-page--lyft" : ""}`}>
      <AuthRegisterStyles />
      <section className="auth-register-hero">
        <img src={getLogoForApp()} alt="Yala" />
        <span>{t("auth.join")}</span>
        <h1>{t("auth.registerTitle")}</h1>
        <p>{t("auth.registerSubtitle")}</p>
      </section>

      <form
        className="auth-register-card"
        onSubmit={verificationStep ? verifyPhone : registerUser}
      >
        <div className="auth-register-header">
          <span>
            {verificationStep
              ? "Phone verification"
              : formData.user_type === "rider"
                ? t("auth.riderAccount")
                : formData.user_type === "admin"
                  ? "Admin Account"
                  : t("auth.driverAccount")}
          </span>
          <h2>{verificationStep ? "Enter your SMS code" : t("auth.signUp")}</h2>
        </div>

        {!verificationStep && !isAppTypeLocked() && <div className="auth-register-tabs">
          {registrationRoles.map((type) => (
            <button
              key={type}
              type="button"
              className={formData.user_type === type ? "active" : ""}
              onClick={() => {
                setFormData({ ...formData, user_type: type });
                if (type !== "rider") {
                  setProfilePicture(null);
                  setNationalIdDocument(null);
                }
              }}
            >
              {type === "rider" ? t("common.rider") : t("common.driver")}
            </button>
          ))}
        </div>}

        {errorMessage && <div className="auth-register-error">{errorMessage}</div>}

        {verificationStep ? (
          <>
            <p className="auth-register-verification-copy">
              We sent a six-digit code to {formData.phone_number}. Verify it before
              Yala sends your application to admin review.
            </p>
            {debugCode && (
              <div className="auth-register-debug-code">
                Local test code: <strong>{debugCode}</strong>
              </div>
            )}
            <input
              value={verificationCode}
              onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              required
            />
          </>
        ) : <>
        <div className="auth-register-grid">
          <input
            name="first_name"
            placeholder={t("auth.firstName")}
            value={formData.first_name}
            onChange={handleChange}
            autoComplete="given-name"
          />

          <input
            name="last_name"
            placeholder={t("auth.lastName")}
            value={formData.last_name}
            onChange={handleChange}
            autoComplete="family-name"
          />
        </div>

        <input
          name="email"
          type="email"
          placeholder={t("auth.email")}
          value={formData.email}
          onChange={handleChange}
          autoComplete="email"
        />

        <div className="auth-register-grid">
          <select name="gender" value={formData.gender} onChange={handleChange}>
            <option value="Male">{t("auth.male")}</option>
            <option value="Female">{t("auth.female")}</option>
          </select>

          <input
            name="phone_number"
            type="tel"
            placeholder={t("auth.phonePlaceholder")}
            value={formData.phone_number}
            onChange={handleChange}
            autoComplete="tel"
          />
        </div>

        <input
          name="national_id_number"
          placeholder={t("auth.nationalId")}
          value={formData.national_id_number}
          onChange={handleChange}
        />

        <label className="auth-register-city">
          <strong>City</strong>
          <span>Select the city where you will use Yala.</span>
          <select
            name="city"
            value={formData.city}
            onChange={handleChange}
            required
            disabled={citiesLoading}
          >
            <option value="">
              {citiesLoading ? "Loading cities..." : "Select your city"}
            </option>
            {Object.entries(citiesByRegion).map(([regionName, regionCities]) => (
              <optgroup key={regionName} label={regionName}>
                {regionCities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {formData.user_type === "rider" && (
          <>
            <label className="auth-register-file">
              <strong>{t("auth.riderPhotoRequired")}</strong>
              <span>{profilePicture?.name || t("auth.riderPhotoHelp")}</span>
              <span style={{fontSize: "11px", color: "rgba(255,255,255,0.5)"}}>Accepted: JPG, PNG, WebP (max 5MB)</span>
              {profilePicture && !["image/jpeg", "image/png", "image/webp"].includes(profilePicture.type) && (
                <span style={{fontSize: "12px", color: "#f87171", fontWeight: 700}}>⚠ Invalid file type. Please choose a JPG, PNG, or WebP image.</span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(event) => setProfilePicture(event.target.files?.[0] || null)}
              />
            </label>

            <label className="auth-register-file">
              <strong>{t("auth.nationalIdDocumentRequired")}</strong>
              <span>{nationalIdDocument?.name || t("auth.nationalIdDocumentHelp")}</span>
              <span style={{fontSize: "11px", color: "rgba(255,255,255,0.5)"}}>Accepted: PDF, JPG, PNG, WebP (max 8MB)</span>
              {nationalIdDocument && !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(nationalIdDocument.type) && (
                <span style={{fontSize: "12px", color: "#f87171", fontWeight: 700}}>⚠ Invalid file type: {nationalIdDocument.type || "unknown"}. Please choose a PDF, JPG, PNG, or WebP file.</span>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                required
                onChange={(event) => setNationalIdDocument(event.target.files?.[0] || null)}
              />
            </label>
          </>
        )}

        <input
          name="password"
          type="password"
          placeholder={t("auth.password")}
          value={formData.password}
          onChange={handleChange}
          autoComplete="new-password"
        />
        </>}

        <button className="auth-register-primary" type="submit" disabled={loading}>
          {loading
            ? t("auth.creatingAccount")
            : verificationStep
              ? "Verify phone"
              : t("auth.createAccount")}
        </button>

        {!verificationStep && <button
          className="auth-register-secondary"
          type="button"
          onClick={() => (window.location.href = "/login")}
        >
          {t("auth.alreadyHaveAccount")}
        </button>}
      </form>
    </main>
  );
}

function AuthRegisterStyles() {
  return (
    <style>{`
      .auth-register-page {
        width: 100%;
        min-height: 100vh;
        min-height: 100dvh;
        height: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px 16px;
        padding-bottom: 40px;
        background: linear-gradient(180deg, #0B1220 0%, #0f1d2e 100%);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Inter, sans-serif;
        overflow-x: hidden;
        overflow-y: visible;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
      }

      .auth-register-page * {
        box-sizing: border-box;
      }

      .auth-register-hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 24px;
        flex-shrink: 0;
      }

      .auth-register-hero img {
        width: 72px;
        height: 72px;
        object-fit: cover;
        border-radius: 18px;
        margin-bottom: 12px;
        box-shadow: 0 8px 32px rgba(0, 166, 81, 0.2);
      }

      .auth-register-hero span,
      .auth-register-header span {
        display: inline-flex;
        width: max-content;
        margin-bottom: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(0, 166, 81, 0.12);
        color: #00A651;
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .auth-register-hero h1 {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.5px;
      }

      .auth-register-hero p {
        margin: 8px 0 0;
        color: rgba(255, 255, 255, 0.6);
        font-size: 14px;
        line-height: 1.4;
        max-width: 320px;
      }

      .auth-register-card {
        width: 100%;
        max-width: 420px;
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(12px);
      }

      .auth-register-header h2 {
        margin: 0 0 18px;
        font-size: 34px;
      }

      .auth-register-tabs {
        display: flex;
        gap: 6px;
        margin-bottom: 16px;
        padding: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .auth-register-tabs button,
      .auth-register-primary,
      .auth-register-secondary {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .auth-register-tabs button {
        flex: 1;
        min-height: 42px;
        border-radius: 999px;
        background: transparent;
        color: #fff;
        font-weight: 900;
      }

      .auth-register-tabs button.active {
        background: #00A651;
        color: #fff;
      }

      .auth-register-error {
        margin-bottom: 14px;
        padding: 12px;
        border: 1px solid rgba(248, 113, 113, 0.4);
        border-radius: 14px;
        background: rgba(127, 29, 29, 0.28);
        color: #fecaca;
        font-weight: 800;
      }

      .auth-register-verification-copy {
        margin: 0 0 16px;
        color: rgba(255, 255, 255, 0.72);
        line-height: 1.5;
      }

      .auth-register-debug-code {
        margin-bottom: 14px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(34, 197, 94, 0.14);
        color: #bbf7d0;
      }

      .auth-register-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .auth-register-card input,
      .auth-register-card select {
        width: 100%;
        min-height: 48px;
        margin-bottom: 12px;
        padding: 0 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        font-size: 16px;
        outline: none;
        transition: border-color 150ms ease;
      }

      .auth-register-card input:focus,
      .auth-register-card select:focus {
        border-color: #00A651;
        box-shadow: 0 0 0 3px rgba(0, 166, 81, 0.15);
      }

      .auth-register-card option {
        color: #111827;
      }

      .auth-register-city {
        display: grid;
        gap: 7px;
        margin-bottom: 2px;
      }

      .auth-register-city span {
        color: rgba(255, 255, 255, 0.64);
        font-size: 12px;
      }

      .auth-register-file {
        display: grid;
        gap: 7px;
        margin-bottom: 12px;
        padding: 14px;
        border: 1px dashed rgba(0, 166, 81, 0.5);
        border-radius: 12px;
        background: rgba(0, 166, 81, 0.06);
      }

      .auth-register-file span {
        color: rgba(255, 255, 255, 0.66);
        font-size: 14px;
      }

      .auth-register-file input {
        min-height: auto;
        margin-bottom: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
      }

      .auth-register-primary,
      .auth-register-secondary {
        width: 100%;
        min-height: 50px;
        border-radius: 12px;
        font-weight: 700;
        font-size: 16px;
        -webkit-tap-highlight-color: transparent;
        transition: background 150ms ease, transform 100ms ease;
      }

      .auth-register-primary {
        margin-top: 8px;
        background: #00A651;
        color: #fff;
      }

      .auth-register-primary:active {
        transform: scale(0.97);
        background: #008f45;
      }

      .auth-register-secondary {
        margin-top: 12px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: transparent;
        color: #fff;
      }

      .auth-register-secondary:active {
        transform: scale(0.97);
        background: rgba(255, 255, 255, 0.08);
      }

      @media (max-width: 900px) {
        .auth-register-page {
          padding: 16px;
          padding-bottom: 40px;
        }

        .auth-register-hero {
          margin-bottom: 20px;
        }
      }

      @media (max-width: 560px) {
        .auth-register-page {
          padding: 12px;
          padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
          align-items: stretch;
        }

        .auth-register-card {
          max-width: none;
          padding: 20px;
          border-radius: 16px;
        }

        .auth-register-grid {
          grid-template-columns: 1fr;
          gap: 0;
        }

        .auth-register-hero h1 {
          font-size: 22px;
        }
      }
    `}</style>
  );
}

export default Register;
