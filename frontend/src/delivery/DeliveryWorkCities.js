import React from "react";

import { DEFAULT_DELIVERY_CITY, MAURITANIA_DELIVERY_CITIES } from "./deliveryCities";

export default function DeliveryWorkCities({
  cities = [],
  onChange,
  disabled = false,
  compact = false,
}) {
  const selected = cities.length ? cities : [DEFAULT_DELIVERY_CITY];
  const available = MAURITANIA_DELIVERY_CITIES.filter((city) => !selected.includes(city));

  const addCity = (event) => {
    const city = event.target.value;
    if (!city || selected.includes(city)) return;
    onChange([...selected, city]);
    event.target.value = "";
  };

  const removeCity = (city) => {
    if (selected.length <= 1) return;
    onChange(selected.filter((item) => item !== city));
  };

  return (
    <div className={`delivery-work-cities${compact ? " delivery-work-cities--compact" : ""}`}>
      <label className="delivery-work-cities__label" htmlFor="delivery-city-add">
        {compact ? "Work cities" : "Cities you deliver in"}
      </label>
      {!compact ? (
        <p className="delivery-work-cities__hint">
          Choose the Mauritania cities where you accept delivery requests.
        </p>
      ) : null}
      <select
        id="delivery-city-add"
        className="delivery-work-cities__select"
        defaultValue=""
        disabled={disabled || available.length === 0}
        onChange={addCity}
      >
        <option value="">{available.length ? "Add city..." : "All cities selected"}</option>
        {available.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
      <div className="delivery-uber__chips delivery-work-cities__chips">
        {selected.map((city) => (
          <button
            key={city}
            type="button"
            className="delivery-uber__chip is-active"
            disabled={disabled || selected.length <= 1}
            onClick={() => removeCity(city)}
            title={selected.length <= 1 ? "Keep at least one city" : `Remove ${city}`}
          >
            {city}
            {selected.length > 1 ? <span aria-hidden="true"> ×</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
