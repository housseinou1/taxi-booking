import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  MARKET,
  getLocationByLabel,
  getLocationsByCity,
} from "../marketConfig";

const STORAGE_KEY = "yala_saved_places";

const defaultPlaces = [
  {
    id: "home",
    type: "Home",
    name: "Home",
    city: MARKET.defaultCity,
    location: MARKET.defaultPickup.label,
    note: "Default pickup",
    favorite: true,
  },
  {
    id: "work",
    type: "Work",
    name: "Work",
    city: MARKET.defaultCity,
    location: MARKET.defaultDestination.label,
    note: "Daily destination",
    favorite: true,
  },
];

function loadSavedPlaces() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch (error) {
    return defaultPlaces;
  }

  return defaultPlaces;
}

function SavedPlaces() {
  const { t } = useTranslation();
  const [places, setPlaces] = useState(loadSavedPlaces);
  const [city, setCity] = useState(MARKET.defaultCity);
  const [name, setName] = useState("");
  const [location, setLocation] = useState(MARKET.defaultPickup.label);
  const [type, setType] = useState("Favorite");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const cityLocations = getLocationsByCity(city);
  const favoritePlaces = useMemo(() => places.filter((place) => place.type === "Favorite"), [places]);
  const homePlace = places.find((place) => place.type === "Home");
  const workPlace = places.find((place) => place.type === "Work");
  const typeLabel = (value) => t(`savedPlaces.types.${String(value || "Favorite").toLowerCase()}`);
  const displayNote = (place) => {
    if (!place) return "";
    if (place.note === "Default pickup") return t("savedPlaces.defaultPickup");
    if (place.note === "Daily destination") return t("savedPlaces.dailyDestination");
    return place.note || place.name;
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }, [places]);

  useEffect(() => {
    const exists = cityLocations.some((item) => item.label === location);
    if (!exists) {
      setLocation(cityLocations[0]?.label || MARKET.defaultPickup.label);
    }
  }, [city, cityLocations, location]);

  const savePlace = (event) => {
    event.preventDefault();

    const selectedLocation = getLocationByLabel(location, city);
    if (!selectedLocation) {
      setMessage(t("savedPlaces.errors.invalidLocation"));
      return;
    }

    const place = {
      id: type === "Favorite" ? `favorite-${Date.now()}` : type.toLowerCase(),
      type,
      name: name.trim() || type,
      city,
      location,
      note: note.trim(),
      position: selectedLocation.position,
      favorite: type === "Favorite",
    };

    setPlaces((current) => {
      if (type === "Home" || type === "Work") {
        return [...current.filter((item) => item.type !== type), place];
      }

      return [place, ...current];
    });
    setName("");
    setNote("");
    setType("Favorite");
    setMessage(t("savedPlaces.savedMessage", { name: place.name }));
  };

  const removePlace = (placeId) => {
    setPlaces((current) => current.filter((place) => place.id !== placeId));
  };

  const handleUsePlaceForRide = (place, target = "destination") => {
    localStorage.setItem(
      "yala_next_place",
      JSON.stringify({
        ...place,
        target,
      })
    );
    window.location.href = "/rider-dashboard";
  };

  return (
    <div className="rider-secondary-page saved-places-page">
      <div className="rider-secondary-toolbar">
        <p className="rider-secondary-lead">{t("savedPlaces.subtitle")}</p>
        <button type="button" className="rider-secondary-link-btn" onClick={() => setPlaces(defaultPlaces)}>
          {t("savedPlaces.reset")}
        </button>
      </div>

      <section className="rider-secondary-stats saved-places-feature-grid">
        <PlaceFeature title="Home" label={typeLabel("Home")} place={homePlace} displayNote={displayNote} onUse={handleUsePlaceForRide} onRemove={removePlace} />
        <PlaceFeature title="Work" label={typeLabel("Work")} place={workPlace} displayNote={displayNote} onUse={handleUsePlaceForRide} onRemove={removePlace} />
        <div className="rider-secondary-stat-card">
          <span>{t("savedPlaces.favorites")}</span>
          <strong>{favoritePlaces.length}</strong>
          <small>{t("savedPlaces.savedCustomPlaces")}</small>
        </div>
      </section>

      <section className="saved-places-content">
        <form className="rider-secondary-panel saved-places-form" onSubmit={savePlace}>
          <div className="rider-secondary-panel-head">
            <span>{t("savedPlaces.addSavedPlace")}</span>
            <strong>{typeLabel(type)}</strong>
          </div>

          <label>
            {t("savedPlaces.placeType")}
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="Favorite">{typeLabel("Favorite")}</option>
              <option value="Home">{typeLabel("Home")}</option>
              <option value="Work">{typeLabel("Work")}</option>
            </select>
          </label>

          <label>
            {t("savedPlaces.name")}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={type === "Favorite" ? t("savedPlaces.favoritePlaceholder") : t("savedPlaces.typeLabelPlaceholder", { type: typeLabel(type) })}
            />
          </label>

          <label>
            {t("savedPlaces.city")}
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {MARKET.cities.map((item) => (
                <option key={item.label} value={item.label}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("savedPlaces.location")}
            <input
              list="saved-place-locations"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder={t("savedPlaces.locationPlaceholder")}
            />
          </label>

          <datalist id="saved-place-locations">
            {cityLocations.map((item) => (
              <option key={item.label} value={item.label} />
            ))}
          </datalist>

          <label>
            {t("savedPlaces.note")}
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("savedPlaces.notePlaceholder")}
            />
          </label>

          <button type="submit" className="rider-secondary-primary-btn">{t("savedPlaces.savePlace")}</button>
          {message && <p className="rider-secondary-notice">{message}</p>}
        </form>

        <section className="rider-secondary-panel saved-places-list">
          <div className="rider-secondary-panel-head">
            <span>{t("savedPlaces.allPlaces")}</span>
            <strong>{places.length}</strong>
          </div>

          {places.length === 0 ? (
            <div className="rider-secondary-empty">{t("savedPlaces.empty")}</div>
          ) : (
            places.map((place) => (
              <article key={place.id} className="rider-secondary-row place-card">
                <div className="place-icon">{place.type.slice(0, 1)}</div>
                <div className="rider-secondary-row-body">
                  <strong>{place.name}</strong>
                  <span>{place.location}, {place.city}</span>
                  <small>{displayNote(place) || typeLabel(place.type)}</small>
                </div>
                <div className="place-actions">
                  <button type="button" className="rider-secondary-primary-btn" onClick={() => handleUsePlaceForRide(place, "destination")}>
                    {t("savedPlaces.dropoff")}
                  </button>
                  <button type="button" className="rider-secondary-ghost-btn" onClick={() => handleUsePlaceForRide(place, "pickup")}>
                    {t("savedPlaces.pickup")}
                  </button>
                  <button type="button" className="rider-secondary-ghost-btn" onClick={() => removePlace(place.id)}>
                    {t("savedPlaces.remove")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </div>
  );
}

function PlaceFeature({ title, label, place, displayNote, onUse, onRemove }) {
  const { t } = useTranslation();
  return (
    <article className="rider-secondary-stat-card places-feature-card">
      <span>{label}</span>
      <strong>{place?.location || t("savedPlaces.notSet")}</strong>
      <small>{place ? `${place.city} · ${displayNote(place)}` : t("savedPlaces.addThisSavedPlace")}</small>
      {place && (
        <div className="place-actions">
          <button type="button" className="rider-secondary-primary-btn" onClick={() => onUse(place, title === "Home" ? "pickup" : "destination")}>
            {t("savedPlaces.use")}
          </button>
          <button type="button" className="rider-secondary-ghost-btn" onClick={() => onRemove(place.id)}>{t("savedPlaces.remove")}</button>
        </div>
      )}
    </article>
  );
}

export default SavedPlaces;
