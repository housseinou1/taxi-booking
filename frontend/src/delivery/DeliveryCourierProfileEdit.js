import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import { getDeliveryVehicleLabel } from "./deliveryVehicleTypes";
import "./delivery-uber.css";

export default function DeliveryCourierProfileEdit() {
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
    city: "",
  });
  const [cities, setCities] = useState([]);
  const [courierType, setCourierType] = useState("");
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const token = localStorage.getItem("access");

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profileResponse, cityResponse, onboardingResponse] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/`, { headers: authHeaders }),
        axios.get(`${API_URL}/cities/`),
        axios.get(`${API_URL}/deliveries/courier/onboarding/`, { headers: authHeaders }),
      ]);
      const profile = profileResponse.data || {};
      const user = profile.user || {};
      const groupedCities = cityResponse.data?.results || cityResponse.data || [];
      const availableCities = groupedCities.flatMap((region) => region.cities || []);
      const currentCityName = user.city_name || profile.city_name || "";
      const currentCity = availableCities.find(
        (city) => String(city.name).toLowerCase() === String(currentCityName).toLowerCase()
      );

      setForm({
        first_name: user.first_name || profile.first_name || "",
        last_name: user.last_name || profile.last_name || "",
        phone_number: user.phone_number || profile.phone_number || "",
        city: String(user.city_id || profile.city_id || currentCity?.id || ""),
      });
      setCities(availableCities);
      setCourierType(onboardingResponse.data?.delivery_vehicle_type || "");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not load delivery profile.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const updateForm = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.append("first_name", form.first_name.trim());
      body.append("last_name", form.last_name.trim());
      body.append("phone_number", form.phone_number.trim());
      body.append("city", form.city);
      if (profilePhoto) body.append("profile_picture", profilePhoto);

      await axios.patch(`${API_URL}/auth/identity/update/`, body, {
        headers: { ...authHeaders, "Content-Type": "multipart/form-data" },
      });
      setNotice("Delivery courier profile updated.");
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Could not save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DeliveryUberPage
      title="Courier profile"
      onBack={() => {
        window.location.href = "/delivery/account";
      }}
    >
      <form className="delivery-uber__earnings" onSubmit={save}>
        {error ? <p className="delivery-uber__toast is-error">{error}</p> : null}
        {notice ? <p className="delivery-uber__toast">{notice}</p> : null}
        {loading ? <p className="delivery-uber__empty">Loading delivery profile...</p> : null}

        <div className="delivery-uber-card">
          <h2>Delivery courier information</h2>
          <p>Update the profile customers and Yala support use for deliveries.</p>
          <p>
            <strong>Courier type:</strong> {getDeliveryVehicleLabel(courierType || "motorcycle")}
          </p>
        </div>

        <label className="delivery-uber-field">
          First name
          <input name="first_name" value={form.first_name} onChange={updateForm} required />
        </label>
        <label className="delivery-uber-field">
          Last name
          <input name="last_name" value={form.last_name} onChange={updateForm} required />
        </label>
        <label className="delivery-uber-field">
          Phone number
          <input name="phone_number" type="tel" value={form.phone_number} onChange={updateForm} required />
        </label>
        <label className="delivery-uber-field">
          City
          <select name="city" value={form.city} onChange={updateForm} required>
            <option value="">Select city</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <label className="delivery-uber-field">
          Profile photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setProfilePhoto(event.target.files?.[0] || null)}
          />
          <small>{profilePhoto?.name || "Optional JPG, PNG, or WebP"}</small>
        </label>

        <button type="submit" className="delivery-uber__primary-btn" disabled={saving || loading}>
          {saving ? "Saving..." : "Save delivery profile"}
        </button>
      </form>
    </DeliveryUberPage>
  );
}
