import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import {
  fetchRiderProfile,
  updateRiderIdentity,
} from "./utils/riderProfileSettingsApi";
import "./RiderProfileEditPage.css";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  city: "",
};

export default function RiderProfileEditPage() {
  const [form, setForm] = useState(emptyForm);
  const [profilePhoto, setProfilePhoto] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("access");
    if (!token) {
      window.location.href = `/login?next=${encodeURIComponent("/rider-profile/edit")}`;
      return;
    }

    Promise.all([fetchRiderProfile(token), axios.get(`${API_URL}/cities/`, {
      headers: { Authorization: `Bearer ${token}` },
    })])
      .then(([profile, cityResponse]) => {
        const grouped = cityResponse.data?.results || cityResponse.data || [];
        const availableCities = grouped.flatMap((region) => region.cities || []);
        setCities(availableCities);
        setForm({
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          email: profile.email || "",
          phone_number: profile.phone_number || "",
          city: String(profile.city || availableCities[0]?.id || ""),
        });
        setProfilePhoto(profile.profile_picture || "");
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.error || "We could not load your profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setProfilePhoto(URL.createObjectURL(file));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = new FormData();
      ["first_name", "last_name", "email", "phone_number", "city"].forEach((field) => {
        payload.append(field, form[field]);
      });
      if (photoFile) payload.append("profile_picture", photoFile);

      await updateRiderIdentity(payload);
      setSuccess("Profile updated.");
      window.setTimeout(() => {
        window.location.href = "/rider-profile";
      }, 700);
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          requestError.response?.data?.detail ||
          "Could not save your profile."
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rider-profile-edit"><p role="status">Loading profile...</p></div>;
  }

  return (
    <div className="rider-profile-edit">
      <header className="rider-profile-edit__header">
        <h1>Edit profile</h1>
        <p>Update the details riders and drivers see during your trips.</p>
      </header>

      <form className="rider-profile-edit__form" onSubmit={saveProfile}>
        <label className="rider-profile-edit__photo">
          <span>Profile photo</span>
          <div className="rider-profile-edit__photo-row">
            {profilePhoto ? (
              <img src={profilePhoto} alt="Profile preview" />
            ) : (
              <div className="rider-profile-edit__photo-placeholder" aria-hidden="true">+</div>
            )}
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </div>
        </label>

        <label>
          First name
          <input name="first_name" value={form.first_name} onChange={updateField} required />
        </label>

        <label>
          Last name
          <input name="last_name" value={form.last_name} onChange={updateField} required />
        </label>

        <label>
          Email
          <input name="email" type="email" value={form.email} onChange={updateField} required />
        </label>

        <label>
          Phone number
          <input name="phone_number" value={form.phone_number} onChange={updateField} />
        </label>

        <label>
          City
          <select name="city" value={form.city} onChange={updateField}>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </select>
        </label>

        {error ? <p className="rider-profile-edit__error" role="alert">{error}</p> : null}
        {success ? <p className="rider-profile-edit__success" role="status">{success}</p> : null}

        <div className="rider-profile-edit__actions">
          <button type="button" className="rider-profile-edit__secondary" onClick={() => { window.location.href = "/rider-profile"; }}>
            Cancel
          </button>
          <button type="submit" className="rider-profile-edit__primary" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
