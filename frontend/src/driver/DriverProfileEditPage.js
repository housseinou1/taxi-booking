import React, { useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import "./DriverProfileEditPage.css";

const PERSONAL_FILES = [
  ["profile_picture", "Profile picture", "image/*"],
  ["national_id_document", "National ID", "image/jpeg,image/png,image/webp,application/pdf"],
];

const VEHICLE_FILES = [
  ["license_file", "Driver license", "image/jpeg,image/png,image/webp,application/pdf"],
  ["insurance_document", "Insurance", "image/jpeg,image/png,image/webp,application/pdf"],
  ["vignette_document", "Vignette", "image/jpeg,image/png,image/webp,application/pdf"],
  ["vehicle_registration", "Carte Grise / Vehicle registration", "image/jpeg,image/png,image/webp,application/pdf"],
];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  city: "",
  national_id_number: "",
  vehicle_make: "",
  vehicle_model: "",
  vehicle_color: "",
  vehicle_plate: "",
  car_type: "economy",
};

const getValue = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== "") || "";

export default function DriverProfileEditPage() {
  const token = localStorage.getItem("access");
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState({});
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!token) {
      window.location.href = "/login?next=/driver/profile/edit";
      return;
    }

    Promise.all([
      axios.get(`${API_URL}/drivers/me/`, { headers: { Authorization: `Bearer ${token}` } }),
      axios.get(`${API_URL}/cities/`),
    ])
      .then(([profileResponse, cityResponse]) => {
        const base = profileResponse.data || {};
        const user = base.user || {};
        const groupedCities = cityResponse.data?.results || cityResponse.data || [];
        const availableCities = groupedCities.flatMap((region) => region.cities || []);
        const currentCityName = getValue(base.city_name, base.city?.name, user.city_name, user.city?.name);
        const currentCity = availableCities.find(
          (city) => String(city.name).toLowerCase() === String(currentCityName).toLowerCase()
        );
        setCities(availableCities);
        setForm({
          first_name: getValue(base.first_name, user.first_name),
          last_name: getValue(base.last_name, user.last_name),
          email: getValue(base.email, user.email),
          phone_number: getValue(base.phone_number, user.phone_number),
          city: String(getValue(base.city?.id, base.city_id, user.city?.id, user.city_id, currentCity?.id)),
          national_id_number: getValue(base.national_id_number, user.national_id_number),
          vehicle_make: getValue(base.vehicle_make),
          vehicle_model: getValue(base.vehicle_model),
          vehicle_color: getValue(base.vehicle_color),
          vehicle_plate: getValue(base.vehicle_plate, base.plate_number),
          car_type: getValue(base.car_type, "economy"),
        });
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.error || "We could not load your profile.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const updateFile = (event) => {
    const selected = event.target.files?.[0];
    if (selected) setFiles((current) => ({ ...current, [event.target.name]: selected }));
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    const identity = new FormData();
    ["first_name", "last_name", "email", "phone_number", "city"].forEach((field) => {
      identity.append(field, form[field]);
    });
    if (form.national_id_number.trim()) identity.append("national_id_number", form.national_id_number.trim());
    if (files.profile_picture) identity.append("profile_picture", files.profile_picture);
    if (files.national_id_document) identity.append("national_id_document", files.national_id_document);

    const driver = new FormData();
    ["vehicle_make", "vehicle_model", "vehicle_color", "vehicle_plate", "car_type", "phone_number"].forEach((field) => {
      driver.append(field, form[field]);
    });
    if (files.profile_picture) driver.append("driver_photo", files.profile_picture);
    VEHICLE_FILES.forEach(([field]) => {
      if (files[field]) driver.append(field, files[field]);
    });

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "multipart/form-data",
      },
    };

    try {
      await axios.patch(`${API_URL}/auth/identity/update/`, identity, config);
      await axios.patch(`${API_URL}/drivers/profile/update/`, driver, config);
      setSuccess("Profile changes saved successfully.");
      setFiles({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (saveError) {
      const details = saveError.response?.data;
      setError(details?.error || details?.detail || Object.values(details || {})[0] || "Profile update failed.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className="driver-edit-state">Loading profile editor...</main>;
  }

  return (
    <main className="driver-edit-shell">
      <header className="driver-edit-header">
        <button type="button" className="driver-edit-back" onClick={() => (window.location.href = "/driver/profile")} aria-label="Back to profile">←</button>
        <div>
          <span>Driver management center</span>
          <h1>Edit profile</h1>
          <p>Keep your personal, vehicle, and compliance information current.</p>
        </div>
      </header>

      {success && <div className="driver-edit-message success" role="status">{success}</div>}
      {error && <div className="driver-edit-message error" role="alert">{String(error)}</div>}

      <form onSubmit={saveChanges}>
        <EditSection title="Personal information" description="Information used for your Yala driver account.">
          <div className="driver-edit-grid">
            <Field label="First name" name="first_name" value={form.first_name} onChange={updateField} required />
            <Field label="Last name" name="last_name" value={form.last_name} onChange={updateField} required />
            <Field label="Email" name="email" type="email" value={form.email} onChange={updateField} required />
            <Field label="Phone number" name="phone_number" value={form.phone_number} onChange={updateField} required />
            <label className="driver-edit-field">
              <span>City</span>
              <select name="city" value={form.city} onChange={updateField} required>
                <option value="">Select city</option>
                {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
              </select>
            </label>
            <Field label="National ID number" name="national_id_number" value={form.national_id_number} onChange={updateField} />
          </div>
          <FileFields fields={PERSONAL_FILES} files={files} onChange={updateFile} />
        </EditSection>

        <EditSection title="Vehicle information" description="Details riders and Yala support use to identify your vehicle.">
          <div className="driver-edit-grid">
            <Field label="Vehicle make" name="vehicle_make" value={form.vehicle_make} onChange={updateField} />
            <Field label="Vehicle model" name="vehicle_model" value={form.vehicle_model} onChange={updateField} />
            <Field label="Vehicle color" name="vehicle_color" value={form.vehicle_color} onChange={updateField} />
            <Field label="Plate number" name="vehicle_plate" value={form.vehicle_plate} onChange={updateField} />
            <label className="driver-edit-field">
              <span>Vehicle category</span>
              <select name="car_type" value={form.car_type} onChange={updateField}>
                <option value="economy">Economy</option>
                <option value="xl">XL</option>
                <option value="comfort">Comfort</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
          </div>
        </EditSection>

        <EditSection title="Documents" description="Upload replacements when documents change or expire.">
          <FileFields fields={VEHICLE_FILES} files={files} onChange={updateFile} />
        </EditSection>

        <div className="driver-edit-actions">
          <button type="button" className="driver-edit-cancel" onClick={() => (window.location.href = "/driver/profile")}>Cancel</button>
          <button type="submit" className="driver-edit-save" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </div>
      </form>
    </main>
  );
}

function EditSection({ title, description, children }) {
  return <section className="driver-edit-section"><header><h2>{title}</h2><p>{description}</p></header>{children}</section>;
}

function Field({ label, type = "text", ...props }) {
  return <label className="driver-edit-field"><span>{label}</span><input type={type} {...props} /></label>;
}

function FileFields({ fields, files, onChange }) {
  return (
    <div className="driver-edit-files">
      {fields.map(([name, label, accept]) => (
        <label key={name}>
          <span>{label}</span>
          <input type="file" name={name} accept={accept} onChange={onChange} />
          <small>{files[name]?.name || "Choose a new file"}</small>
        </label>
      ))}
    </div>
  );
}
