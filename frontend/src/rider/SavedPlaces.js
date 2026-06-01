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
    <main className="saved-places-page">
      <SavedPlacesStyles />

      <header className="places-topbar">
        <button type="button" onClick={() => (window.location.href = "/rider-dashboard")}>
          {t("savedPlaces.back")}
        </button>
        <strong>{t("savedPlaces.topbar")}</strong>
        <button type="button" onClick={() => setPlaces(defaultPlaces)}>
          {t("savedPlaces.reset")}
        </button>
      </header>

      <section className="places-hero">
        <span>{t("savedPlaces.eyebrow")}</span>
        <h1>{t("savedPlaces.title")}</h1>
        <p>{t("savedPlaces.subtitle")}</p>
      </section>

      <section className="places-feature-grid">
        <PlaceFeature title="Home" label={typeLabel("Home")} place={homePlace} displayNote={displayNote} onUse={handleUsePlaceForRide} onRemove={removePlace} />
        <PlaceFeature title="Work" label={typeLabel("Work")} place={workPlace} displayNote={displayNote} onUse={handleUsePlaceForRide} onRemove={removePlace} />
        <div className="places-feature-card">
          <span>{t("savedPlaces.favorites")}</span>
          <strong>{favoritePlaces.length}</strong>
          <small>{t("savedPlaces.savedCustomPlaces")}</small>
        </div>
      </section>

      <section className="places-content">
        <form className="places-form" onSubmit={savePlace}>
          <div className="places-panel-head">
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

          <button type="submit">{t("savedPlaces.savePlace")}</button>
          {message && <p>{message}</p>}
        </form>

        <section className="places-list">
          <div className="places-panel-head">
            <span>{t("savedPlaces.allPlaces")}</span>
            <strong>{places.length}</strong>
          </div>

          {places.length === 0 ? (
            <div className="places-empty">{t("savedPlaces.empty")}</div>
          ) : (
            places.map((place) => (
              <article key={place.id} className="place-card">
                <div className="place-icon">{place.type.slice(0, 1)}</div>
                <div>
                  <strong>{place.name}</strong>
                  <span>{place.location}, {place.city}</span>
                  <small>{displayNote(place) || typeLabel(place.type)}</small>
                </div>
                <div className="place-actions">
                  <button type="button" onClick={() => handleUsePlaceForRide(place, "destination")}>
                    {t("savedPlaces.dropoff")}
                  </button>
                  <button type="button" onClick={() => handleUsePlaceForRide(place, "pickup")}>
                    {t("savedPlaces.pickup")}
                  </button>
                  <button type="button" onClick={() => removePlace(place.id)}>
                    {t("savedPlaces.remove")}
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function PlaceFeature({ title, label, place, displayNote, onUse, onRemove }) {
  const { t } = useTranslation();
  return (
    <article className="places-feature-card">
      <span>{label}</span>
      <strong>{place?.location || t("savedPlaces.notSet")}</strong>
      <small>{place ? `${place.city} · ${displayNote(place)}` : t("savedPlaces.addThisSavedPlace")}</small>
      {place && (
        <div>
          <button type="button" onClick={() => onUse(place, title === "Home" ? "pickup" : "destination")}>
            {t("savedPlaces.use")}
          </button>
          <button type="button" onClick={() => onRemove(place.id)}>{t("savedPlaces.remove")}</button>
        </div>
      )}
    </article>
  );
}

function SavedPlacesStyles() {
  return (
    <style>{`
      .saved-places-page {
        min-height: 100vh;
        padding: 14px;
        box-sizing: border-box;
        background:
          radial-gradient(circle at 10% 4%, rgba(0, 166, 81, 0.30), transparent 28%),
          radial-gradient(circle at 90% 8%, rgba(243, 189, 52, 0.24), transparent 30%),
          linear-gradient(180deg, #08111f 0%, #101827 42%, #f8fafc 42%, #edf2f7 100%);
        color: #0f172a;
      }

      .places-topbar,
      .places-hero,
      .places-feature-grid,
      .places-content {
        max-width: 1000px;
        margin-left: auto;
        margin-right: auto;
      }

      .places-topbar {
        display: grid;
        grid-template-columns: 72px 1fr 72px;
        gap: 10px;
        align-items: center;
        color: #fff;
        margin-bottom: 16px;
      }

      .places-topbar strong {
        text-align: center;
        font-size: 18px;
      }

      .places-topbar button,
      .places-form button,
      .place-actions button,
      .places-feature-card button {
        min-height: 40px;
        border: 0;
        border-radius: 999px;
        font-weight: 900;
        cursor: pointer;
      }

      .places-topbar button {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }

      .places-hero {
        color: #fff;
        padding: 20px 0 22px;
      }

      .places-hero span,
      .places-panel-head span,
      .places-feature-card span {
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        color: rgba(255,255,255,0.66);
      }

      .places-hero h1 {
        margin: 8px 0;
        max-width: 700px;
        font-size: clamp(30px, 8vw, 48px);
        line-height: 1;
        letter-spacing: 0;
      }

      .places-hero p {
        max-width: 560px;
        margin: 0;
        color: rgba(255,255,255,0.72);
        font-weight: 650;
        line-height: 1.5;
      }

      .places-feature-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .places-feature-card,
      .places-form,
      .places-list {
        border: 1px solid rgba(15,23,42,0.08);
        border-radius: 8px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 18px 40px rgba(15,23,42,0.08);
      }

      .places-feature-card {
        padding: 14px;
        display: grid;
        gap: 7px;
      }

      .places-feature-card span,
      .places-panel-head span {
        color: #64748b;
      }

      .places-feature-card strong {
        font-size: 20px;
      }

      .places-feature-card small,
      .place-card small,
      .place-card span {
        color: #64748b;
        font-weight: 750;
      }

      .places-feature-card div,
      .place-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .places-feature-card button,
      .place-actions button {
        padding: 0 13px;
        background: #08111f;
        color: #fff;
      }

      .places-feature-card button:first-child,
      .place-actions button:first-child,
      .places-form button {
        background: #00a651;
        color: #fff;
      }

      .places-content {
        display: grid;
        grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.15fr);
        gap: 12px;
      }

      .places-form,
      .places-list {
        padding: 14px;
      }

      .places-form {
        display: grid;
        gap: 11px;
        align-content: start;
      }

      .places-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .places-panel-head strong {
        border-radius: 999px;
        padding: 7px 10px;
        background: #dcfce7;
        color: #166534;
      }

      .places-form label {
        display: grid;
        gap: 6px;
        color: #334155;
        font-weight: 900;
      }

      .places-form input,
      .places-form select {
        min-height: 46px;
        border: 1px solid #dbe3ef;
        border-radius: 8px;
        padding: 0 12px;
        color: #0f172a;
        font-weight: 800;
        background: #fff;
      }

      .places-form p {
        margin: 0;
        color: #166534;
        font-weight: 850;
      }

      .places-list {
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .place-card {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr) auto;
        gap: 10px;
        align-items: center;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }

      .place-icon {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #08111f, #00a651);
        color: #fff;
        font-weight: 950;
      }

      .place-card strong,
      .place-card span,
      .place-card small {
        display: block;
      }

      .places-empty {
        padding: 22px;
        text-align: center;
        color: #64748b;
        font-weight: 850;
      }

      @media (max-width: 760px) {
        .places-feature-grid,
        .places-content {
          grid-template-columns: 1fr;
        }

        .place-card {
          grid-template-columns: 44px minmax(0, 1fr);
        }

        .place-actions {
          grid-column: 1 / -1;
        }
      }
    `}</style>
  );
}

export default SavedPlaces;
