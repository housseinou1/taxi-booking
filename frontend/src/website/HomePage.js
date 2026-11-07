import React from "react";
import {
  IconCar,
  IconDownload,
  IconHeadset,
  IconMap,
  IconPackage,
  IconShield,
  IconUsers,
} from "./WebsiteIcons";
import WebsiteCityPanel from "./WebsiteCityPanel";

const PLAY = {
  rider: "https://play.google.com/store/apps/details?id=com.yala.rider.mr",
  driver: "https://play.google.com/store/apps/details?id=com.yala.driver.mr",
  delivery: "https://play.google.com/store/apps/details?id=com.yala.delivery.mr",
};

const APP_CARDS = [
  {
    key: "rider",
    logo: "/yala-rider-logo.png",
    border: "ys-app-card--rider",
    play: PLAY.rider,
    nameKey: "appRiderName",
    descKey: "appRiderDesc",
  },
  {
    key: "driver",
    logo: "/yala-driver-logo.png",
    border: "ys-app-card--driver",
    play: PLAY.driver,
    nameKey: "appDriverName",
    descKey: "appDriverDesc",
  },
  {
    key: "delivery",
    logo: "/yala-delivery-logo.png",
    border: "ys-app-card--delivery",
    play: PLAY.delivery,
    nameKey: "appDeliveryName",
    descKey: "appDeliveryDesc",
  },
];

const WHY = [
  { icon: IconShield, title: "why1t", text: "why1x" },
  { icon: IconUsers, title: "why2t", text: "why2x" },
  { icon: IconMap, title: "why3t", text: "why3x" },
  { icon: IconHeadset, title: "why4t", text: "why4x" },
];

/**
 * Public home — Mauritanian flag marketing layout (www.yalataxi.live).
 */
export default function HomePage({ t, selectedCity, onClearCity }) {
  const scrollToApps = (event) => {
    event.preventDefault();
    document.getElementById("download-apps")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      <section className="ys-hero-mr" aria-labelledby="ys-hero-title">
        <div className="ys-hero-mr__inner">
          <div className="ys-hero-mr__copy">
            <h1 id="ys-hero-title" className="ys-hero-mr__brand">
              {t("heroBrand")}
            </h1>
            <p className="ys-hero-mr__kicker">{t("heroKicker")}</p>
            <p className="ys-hero-mr__lead">{t("heroLead")}</p>

            <ul className="ys-hero-mr__feats" aria-label="Platform highlights">
              <li>
                <IconCar />
                <span>{t("hf1")}</span>
              </li>
              <li>
                <IconPackage />
                <span>{t("hf2")}</span>
              </li>
              <li>
                <IconShield />
                <span>{t("hf3")}</span>
              </li>
              <li>
                <IconHeadset />
                <span>{t("hf4")}</span>
              </li>
            </ul>

            <a className="ys-btn ys-btn-gold ys-btn-lg ys-hero-mr__cta" href="#download-apps" onClick={scrollToApps}>
              <IconDownload />
              <span>{t("downloadCta")}</span>
            </a>
          </div>

          <div className="ys-hero-mr__visual" aria-hidden="true">
            <img src="/splash-screen.png" alt="" className="ys-hero-mr__photo" />
          </div>
        </div>
      </section>

      <section className="ys-app-download" id="download-apps" aria-labelledby="ys-apps-title">
        <div className="ys-wrap">
          <h2 id="ys-apps-title" className="ys-visually-hidden">
            {t("downloadSectionTitle")}
          </h2>
          <div className="ys-app-download__grid">
            {APP_CARDS.map((card) => (
              <article key={card.key} className={`ys-app-card ${card.border}`}>
                <img src={card.logo} alt="" className="ys-app-card__logo" />
                <h3>{t(card.nameKey)}</h3>
                <p>{t(card.descKey)}</p>
                <div className="ys-store-badges">
                  <a className="ys-store-badge" href={card.play} target="_blank" rel="noopener noreferrer">
                    {t("playStore")}
                  </a>
                  <span className="ys-store-badge ys-store-badge--muted" title="Coming soon">
                    {t("appStore")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WebsiteCityPanel t={t} selectedCity={selectedCity} onClear={onClearCity} />

      <section className="ys-why" id="cities" aria-labelledby="ys-why-title">
        <div className="ys-wrap">
          <div className="ys-why__head">
            <span className="ys-why__rule" aria-hidden="true" />
            <h2 id="ys-why-title">{t("whyTitle")}</h2>
          </div>
          <div className="ys-why__grid">
            {WHY.map(({ icon: Ico, title, text }) => (
              <article key={title} className="ys-why__item">
                <div className="ys-why__ico" aria-hidden="true">
                  <Ico />
                </div>
                <h3>{t(title)}</h3>
                <p>{t(text)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="ys-tricolor-ribbon" aria-hidden="true">
        <span className="ys-tricolor-ribbon__green" />
        <span className="ys-tricolor-ribbon__gold" />
        <span className="ys-tricolor-ribbon__red" />
      </div>
    </>
  );
}
