import React from "react";

import { IconCar, IconPackage } from "./WebsiteIcons";

/**
 * Shown on the home page after a visitor picks a city from the nav dropdown.
 */
export default function WebsiteCityPanel({ t, selectedCity, onClear }) {
  if (!selectedCity) return null;

  const { city, region, operational, districts = [] } = selectedCity;

  return (
    <section className="ys-city-panel" id="city-services" aria-labelledby="ys-city-panel-title">
      <div className="ys-wrap">
        <div className="ys-city-panel__head">
          <div>
            <p className="ys-city-panel__eyebrow">{region}</p>
            <h2 id="ys-city-panel-title">{city}</h2>
          </div>
          <button type="button" className="ys-btn ys-btn-ghost" onClick={onClear}>
            {t("cityPanelClear")}
          </button>
        </div>

        <p className={`ys-city-panel__status${operational ? " ys-city-panel__status--on" : ""}`}>
          {operational ? t("cityPanelOperational") : t("cityPanelPlanned")}
        </p>

        {operational ? (
          <ul className="ys-city-panel__services">
            <li>
              <IconCar />
              <span>{t("cityPanelRide")}</span>
            </li>
            <li>
              <IconPackage />
              <span>{t("cityPanelDelivery")}</span>
            </li>
          </ul>
        ) : (
          <p className="ys-city-panel__note">{t("cityPanelNoService")}</p>
        )}

        {city === "Nouakchott" && districts.length > 0 ? (
          <div className="ys-city-panel__districts">
            <h3>{t("cityPanelDistricts")}</h3>
            <ul>
              {districts.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
