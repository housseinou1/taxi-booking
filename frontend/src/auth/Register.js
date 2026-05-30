import React, { useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { API_URL } from "../apiConfig";

const logoSrc = "/yala-logo.png";

function Register() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    gender: "Male",
    phone_number: "",
    national_id_number: "",
    password: "",
    user_type: "rider",
  });
  const [loading, setLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const registerUser = async (event) => {
    event.preventDefault();
    setErrorMessage("");

    if (formData.user_type === "rider" && !profilePicture) {
      setErrorMessage(t("auth.riderPhotoRequired"));
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

      await axios.post(`${API_URL}/auth/register/`, payload, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const loginResponse = await axios.post(`${API_URL}/auth/login/`, {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
      });

      localStorage.setItem("access", loginResponse.data.access);
      localStorage.setItem("refresh", loginResponse.data.refresh);
      localStorage.setItem("user", JSON.stringify(loginResponse.data));

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

      window.location.replace("/");
    } catch (error) {
      const response = error.response?.data || {};
      const message =
        response.email?.[0] ||
        response.gender?.[0] ||
        response.national_id_number?.[0] ||
        response.password?.[0] ||
        response.user_type?.[0] ||
        response.profile_picture ||
        response.phone_number ||
        response.detail ||
        response.error ||
        t("auth.registrationFailed");

      setErrorMessage(Array.isArray(message) ? message[0] : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-register-page">
      <AuthRegisterStyles />
      <section className="auth-register-hero">
        <img src={logoSrc} alt="Yala" />
        <span>{t("auth.join")}</span>
        <h1>{t("auth.registerTitle")}</h1>
        <p>{t("auth.registerSubtitle")}</p>
      </section>

      <form className="auth-register-card" onSubmit={registerUser}>
        <div className="auth-register-header">
          <span>{formData.user_type === "rider" ? t("auth.riderAccount") : t("auth.driverAccount")}</span>
          <h2>{t("auth.signUp")}</h2>
        </div>

        <div className="auth-register-tabs">
          {["rider", "driver"].map((type) => (
            <button
              key={type}
              type="button"
              className={formData.user_type === type ? "active" : ""}
              onClick={() => {
                setFormData({ ...formData, user_type: type });
                if (type !== "rider") setProfilePicture(null);
              }}
            >
              {type === "rider" ? t("common.rider") : t("common.driver")}
            </button>
          ))}
        </div>

        {errorMessage && <div className="auth-register-error">{errorMessage}</div>}

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

        {formData.user_type === "rider" && (
          <label className="auth-register-file">
            <strong>{t("auth.riderPhotoRequired")}</strong>
            <span>{t("auth.riderPhotoHelp")}</span>
            <input
              type="file"
              accept="image/*"
              required
              onChange={(event) => setProfilePicture(event.target.files?.[0] || null)}
            />
          </label>
        )}

        <input
          name="password"
          type="password"
          placeholder={t("auth.password")}
          value={formData.password}
          onChange={handleChange}
          autoComplete="new-password"
        />

        <button className="auth-register-primary" type="submit" disabled={loading}>
          {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
        </button>

        <button
          className="auth-register-secondary"
          type="button"
          onClick={() => (window.location.href = "/login")}
        >
          {t("auth.alreadyHaveAccount")}
        </button>
      </form>
    </main>
  );
}

function AuthRegisterStyles() {
  return (
    <style>{`
      .auth-register-page {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(340px, 520px);
        gap: 28px;
        align-items: center;
        padding: 28px;
        background:
          radial-gradient(circle at 16% 14%, rgba(250, 204, 21, 0.2), transparent 28%),
          radial-gradient(circle at 84% 18%, rgba(22, 163, 74, 0.16), transparent 30%),
          #05070c;
        color: #fff;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .auth-register-page * {
        box-sizing: border-box;
      }

      .auth-register-hero {
        max-width: 680px;
      }

      .auth-register-hero img {
        width: min(430px, 100%);
        aspect-ratio: 1.55 / 1;
        object-fit: cover;
        border-radius: 28px;
        margin-bottom: 28px;
        box-shadow: 0 34px 80px rgba(0, 0, 0, 0.42);
      }

      .auth-register-hero span,
      .auth-register-header span {
        display: inline-flex;
        width: max-content;
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(250, 204, 21, 0.12);
        color: #facc15;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }

      .auth-register-hero h1 {
        margin: 0;
        max-width: 620px;
        font-size: clamp(42px, 6vw, 76px);
        line-height: 0.95;
        letter-spacing: 0;
      }

      .auth-register-hero p {
        max-width: 560px;
        margin: 20px 0 0;
        color: rgba(255, 255, 255, 0.72);
        font-size: 18px;
        line-height: 1.55;
      }

      .auth-register-card {
        width: 100%;
        padding: 26px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.09);
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.32);
        backdrop-filter: blur(18px);
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
        background: #fff;
        color: #111827;
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

      .auth-register-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .auth-register-card input,
      .auth-register-card select {
        width: 100%;
        min-height: 52px;
        margin-bottom: 12px;
        padding: 0 15px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font-size: 16px;
        outline: none;
      }

      .auth-register-card option {
        color: #111827;
      }

      .auth-register-file {
        display: grid;
        gap: 7px;
        margin-bottom: 12px;
        padding: 14px;
        border: 1px dashed rgba(250, 204, 21, 0.5);
        border-radius: 16px;
        background: rgba(250, 204, 21, 0.08);
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
        min-height: 54px;
        border-radius: 999px;
        font-weight: 950;
      }

      .auth-register-primary {
        margin-top: 8px;
        background: linear-gradient(135deg, #facc15, #f59e0b);
        color: #111827;
      }

      .auth-register-secondary {
        margin-top: 12px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      @media (max-width: 900px) {
        .auth-register-page {
          grid-template-columns: 1fr;
          padding: 18px;
        }

        .auth-register-hero {
          padding-top: 18px;
        }
      }

      @media (max-width: 560px) {
        .auth-register-page {
          padding: 12px;
        }

        .auth-register-card {
          padding: 20px;
          border-radius: 22px;
        }

        .auth-register-grid {
          grid-template-columns: 1fr;
          gap: 0;
        }

        .auth-register-hero h1 {
          font-size: 44px;
        }
      }
    `}</style>
  );
}

export default Register;
