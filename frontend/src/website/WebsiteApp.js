import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WEBSITE_I18N, WEBSITE_LANGS, normalizeWebsiteLang } from "./websiteI18n";
import HomePage from "./HomePage";
import {
  RiderPage, DriverPage, DeliveryPage,
  AboutPage, SafetyPage, ContactPage, SupportPage,
} from "./Pages";
import MauritaniaFlag from "./MauritaniaFlag";
import { WEBSITE_LOGIN_LINKS, WebsiteCitiesNavDropdown, WebsiteLoginNavDropdown } from "./WebsiteNavMenus";
import { useWebsiteAuth } from "./useWebsiteAuth";
import { CEO_CONTACT } from "./FounderCard";
import { IconDownload } from "./WebsiteIcons";
import "./website.css";

const LOGIN_LINKS_MOBILE = [
  { key: "loginRider", href: "/login?next=%2Frider-dashboard" },
  { key: "loginDriver", href: "/login?next=%2Fdriver" },
  { key: "loginDelivery", href: "/login?next=%2Fdelivery%2Fcourier" },
  { key: "loginAdmin", href: "/login?next=%2Fadmin" },
];

/* --------------------------------------------------------------------------
   Slice 1: shell (header + nav + footer) and the Home page.
   Additional pages are registered in ROUTES as later slices land.
   -------------------------------------------------------------------------- */

export const WEBSITE_ROUTES = ["home", "rider", "driver", "delivery", "about", "safety", "contact", "support"];

const CONTACT = {
  phoneDisplay: "+222 22 11 43 73",
  phoneHref: "tel:+22222114373",
  waHref: "https://wa.me/19293036846",
  waDisplay: "+1 929 303 6846",
  supportEmail: "support@yalataxi.live",
  ceoEmail: "sakho@yalataxi.live",
  site: "https://www.yalataxi.live",
};

/** Sticky marketing header — Mauritanian green/gold/red, horizontal nav. */
function SiteHeader({ t, lang, route, onNavigate, onLangChange, onCitySelect }) {
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const auth = useWebsiteAuth();

  const go = useCallback(
    (next) => (event) => {
      event.preventDefault();
      setOpen(false);
      setServicesOpen(false);
      onNavigate(next);
    },
    [onNavigate]
  );

  const goHomeHash = (hash) => (event) => {
    event.preventDefault();
    setOpen(false);
    if (route !== "home") {
      onNavigate("home");
      window.setTimeout(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    } else {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <>
      <header className="ys-hdr ys-hdr--mr">
        <div className="ys-wrap ys-hdr-in">
          <a className="ys-brand ys-brand--mr" href="#/home" onClick={go("home")} aria-label="YALA Technologies — home">
            <span className="ys-brand-emblem" aria-hidden="true">
              <MauritaniaFlag className="ys-brand-flag--circle" title="Flag of Mauritania" />
            </span>
            <span className="ys-brand-txt ys-brand-txt--light">
              <strong>YALA</strong>
              <small>{t("brandTag")}</small>
            </span>
          </a>

          <nav className="ys-nav ys-nav--mr" aria-label="Main navigation" id="ys-mainnav">
            <a
              href="#/home"
              data-route="home"
              onClick={go("home")}
              className={route === "home" ? "ys-nav-active" : ""}
              aria-current={route === "home" ? "page" : undefined}
            >
              {t("navHome")}
            </a>
            <div
              className={`ys-nav-dd${servicesOpen ? " ys-nav-dd--open" : ""}`}
              onMouseLeave={() => setServicesOpen(false)}
            >
              <button
                type="button"
                className="ys-nav-dd-trigger"
                aria-expanded={servicesOpen}
                onClick={() => setServicesOpen((v) => !v)}
              >
                {t("navServices")}
                <span className="ys-chev" aria-hidden="true" />
              </button>
              <div className="ys-nav-dd-menu" role="menu">
                <a href="#/rider" role="menuitem" onClick={go("rider")}>{t("navRider")}</a>
                <a href="#/driver" role="menuitem" onClick={go("driver")}>{t("navDriver")}</a>
                <a href="#/delivery" role="menuitem" onClick={go("delivery")}>{t("navDelivery")}</a>
              </div>
            </div>
            <WebsiteCitiesNavDropdown
              t={t}
              onCitySelect={onCitySelect}
              onNavigateClose={() => {
                setOpen(false);
                setServicesOpen(false);
              }}
            />
            <a href="#/contact" data-route="contact" onClick={go("contact")}>{t("navPartners")}</a>
            <a href="#/about" data-route="about" onClick={go("about")} aria-current={route === "about" ? "page" : undefined}>
              {t("navAbout")}
            </a>
            <a href="#/support" data-route="support" onClick={go("support")} aria-current={route === "support" ? "page" : undefined}>
              {t("navSupport")}
            </a>
          </nav>

          <div className="ys-hdr-actions">
            <label className="ys-lang-select">
              <span className="ys-visually-hidden">Language</span>
              <select
                aria-label="Language"
                value={lang}
                onChange={(e) => onLangChange(e.target.value)}
              >
                {WEBSITE_LANGS.map((code) => (
                  <option key={code} value={code}>
                    {code.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <WebsiteLoginNavDropdown
              t={t}
              className="ys-nav-dd--actions"
              onNavigateClose={() => setOpen(false)}
            />
            <a className="ys-btn ys-btn-gold ys-btn-sm" href="/#download-apps" onClick={goHomeHash("#download-apps")}>
              <IconDownload />
              <span>{t("getTheApp")}</span>
            </a>
            <button
              className="ys-burger ys-burger--light"
              type="button"
              aria-expanded={open}
              aria-controls="ys-mmenu"
              aria-label="Toggle menu"
              onClick={() => setOpen((v) => !v)}
            >
              <i />
            </button>
          </div>
        </div>
      </header>

      <div className={`ys-mmenu ys-mmenu--mr${open ? " ys-open" : ""}`} id="ys-mmenu">
        <a href="#/home" onClick={go("home")}>{t("navHome")}</a>
        <a href="#/rider" onClick={go("rider")}>{t("navRider")}</a>
        <a href="#/driver" onClick={go("driver")}>{t("navDriver")}</a>
        <a href="#/delivery" onClick={go("delivery")}>{t("navDelivery")}</a>
        <span className="ys-mmenu-label">{t("navCities")}</span>
        <WebsiteCitiesNavDropdown
          t={t}
          className="ys-nav-dd--mobile"
          onCitySelect={(city) => {
            setOpen(false);
            onCitySelect?.(city);
          }}
        />
        <a href="#/contact" onClick={go("contact")}>{t("navPartners")}</a>
        <a href="#/about" onClick={go("about")}>{t("navAbout")}</a>
        <a href="#/support" onClick={go("support")}>{t("navSupport")}</a>
        <span className="ys-mmenu-label">{auth.authed ? t("navMyAccount") : t("navLogin")}</span>
        {auth.authed ? (
          <>
            <a href={auth.dashboardPath} onClick={() => setOpen(false)}>
              {t("accountDashboard")}
            </a>
            <a href={auth.profilePath} onClick={() => setOpen(false)}>
              {t("accountProfile")}
            </a>
            <button
              type="button"
              className="ys-mmenu-logout"
              onClick={async () => {
                setOpen(false);
                await auth.logout();
              }}
            >
              {t("accountLogout")}
            </button>
          </>
        ) : (
          LOGIN_LINKS_MOBILE.map(({ key, href }) => (
            <a key={key} href={href} onClick={() => setOpen(false)}>
              {t(key)}
            </a>
          ))
        )}
        {auth.authed ? (
          <>
            <span className="ys-mmenu-label">{t("navLoginAs")}</span>
            {WEBSITE_LOGIN_LINKS.map(({ key, href }) => (
              <a
                key={key}
                href={href}
                onClick={async (event) => {
                  event.preventDefault();
                  setOpen(false);
                  await auth.switchToLogin(href);
                }}
              >
                {t(key)}
              </a>
            ))}
          </>
        ) : null}
        <hr />
        <a className="ys-btn ys-btn-gold ys-btn-block" href="/#download-apps" onClick={goHomeHash("#download-apps")}>
          {t("getTheApp")}
        </a>
      </div>
    </>
  );
}

/** Site footer: platform, company, legal and the official customer-service contacts. */
function SiteFooter({ t, onNavigate }) {
  const go = useCallback(
    (next) => (event) => {
      event.preventDefault();
      onNavigate(next);
    },
    [onNavigate]
  );

  return (
    <footer className="ys-ftr">
      <div className="ys-wrap">
        <div className="ys-ftr-top">
          <div className="ys-ftr-brand">
            <span className="ys-brand-mark" aria-hidden="true">Y</span>
            <span>
              <strong>YALA Technologies</strong>
              <span>{t("ftrBlurb")}</span>
            </span>
          </div>

          <div className="ys-ftr-cols">
            <div className="ys-ftr-col">
              <h4>{t("ftrContactH")}</h4>
              <a className="ys-fc" href={CONTACT.phoneHref}>
                <span className="ys-fci" aria-hidden="true">📞</span>
                <span className="ys-fct"><b>{t("ftrPhone")}</b><i>{CONTACT.phoneDisplay}</i></span>
              </a>
              <a className="ys-fc ys-wa" href={CONTACT.waHref} target="_blank" rel="noopener noreferrer">
                <span className="ys-fci" aria-hidden="true">💬</span>
                <span className="ys-fct"><b>{t("ftrWa")}</b><i>{CONTACT.waDisplay}</i></span>
              </a>
              <a className="ys-fc" href={`mailto:${CONTACT.supportEmail}`}>
                <span className="ys-fci" aria-hidden="true">✉️</span>
                <span className="ys-fct"><b>{t("ftrEmail")}</b><i>{CONTACT.supportEmail}</i></span>
              </a>
            </div>

            <div className="ys-ftr-col">
              <h4>{t("ftrPlatform")}</h4>
              <a href="#/rider" onClick={go("rider")}>{t("navRider")}</a>
              <a href="#/driver" onClick={go("driver")}>{t("navDriver")}</a>
              <a href="#/delivery" onClick={go("delivery")}>{t("navDelivery")}</a>
              <a href="/register">{t("ftrRegister")}</a>
            </div>

            <div className="ys-ftr-col">
              <h4>{t("ftrCompany")}</h4>
              <a href="#/about" onClick={go("about")}>{t("navAbout")}</a>
              <a href="#/safety" onClick={go("safety")}>{t("navSafety")}</a>
              <a href="#/contact" onClick={go("contact")}>{t("navContact")}</a>
            </div>

            <div className="ys-ftr-col">
              <h4>{t("ftrLegal")}</h4>
              <a href="/privacy">{t("ftrPrivacy")}</a>
              <a href="/terms">{t("ftrTerms")}</a>
              <a href="https://api.yalataxi.live/yala-account-deletion/" target="_blank" rel="noopener noreferrer">
                {t("ftrDeletion")}
              </a>
              <a href="#/support" onClick={go("support")}>{t("navSupport")}</a>
            </div>
          </div>
        </div>

        <section className="ys-ftr-ceo" aria-labelledby="ys-ftr-ceo-title" lang="en">
          <p id="ys-ftr-ceo-title" className="ys-ftr-ceo__byline">
            <span className="ys-ftr-ceo__label">{t("ftrCeoCreated")}</span>{" "}
            <strong className="ys-ftr-ceo__name">{t("fdName")}</strong>
          </p>
          <p className="ys-ftr-ceo__role">
            <em>{t("ftrCeoRoleOfficial")}</em>
          </p>
          <p className="ys-ftr-ceo__org">
            <strong>{t("fdOrg")}</strong>
          </p>
          <div className="ys-ftr-ceo__links">
            <a className="ys-ftr-ceo__link" href={`mailto:${CEO_CONTACT.email}`}>
              <span className="ys-ftr-ceo__link-ico" aria-hidden="true">✉️</span>
              <span>
                <b>{t("ftrCeoEmail")}</b> {CEO_CONTACT.email}
              </span>
            </a>
            <a
              className="ys-ftr-ceo__link"
              href={CEO_CONTACT.site}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="ys-ftr-ceo__link-ico" aria-hidden="true">🌐</span>
              <span>
                <b>{t("ftrCeoWebsite")}</b> {CEO_CONTACT.siteLabel}
              </span>
            </a>
          </div>
          <p className="ys-ftr-ceo__slogan">{t("ftrSloganOfficial")}</p>
        </section>

        <div className="ys-ftr-bot">
          <span className="ys-mr">
            <MauritaniaFlag className="ys-ftr-flag" title="" />
            {t("ftrMade")}
          </span>
          <span className="ys-cp">© 2026 YALA Technologies. {t("ftrRights")}</span>
        </div>

        <p className="ys-ftr-note">{t("ftrNote")}</p>
      </div>
    </footer>
  );
}

/**
 * Public website shell.
 *
 * @param {string}   route      current website route (home | rider | ...)
 * @param {function} onNavigate called with the target route
 */
export default function WebsiteApp({ route = "home", onNavigate = () => {} }) {
  const { i18n } = useTranslation();
  const lang = normalizeWebsiteLang(i18n?.language);
  const dict = WEBSITE_I18N[lang] || WEBSITE_I18N.en;
  const [selectedCity, setSelectedCity] = useState(null);

  const t = useCallback(
    (key) => (dict[key] !== undefined ? dict[key] : WEBSITE_I18N.en[key] ?? key),
    [dict]
  );

  const active = WEBSITE_ROUTES.includes(route) ? route : "home";

  // reflect language + page in the document for a11y and SEO
  useEffect(() => {
    const previous = document.title;
    document.title = "YALA Technologies — Mauritania";
    return () => { document.title = previous; };
  }, [active, lang]);

  const handleCitySelect = useCallback(
    (city) => {
      setSelectedCity(city);
      if (active !== "home") {
        onNavigate("home");
      }
      window.setTimeout(() => {
        document.getElementById("city-services")?.scrollIntoView({ behavior: "smooth" });
      }, active !== "home" ? 160 : 40);
    },
    [active, onNavigate]
  );

  const page = useMemo(() => {
    switch (active) {
      case "rider":    return <RiderPage t={t} />;
      case "driver":   return <DriverPage t={t} />;
      case "delivery": return <DeliveryPage t={t} />;
      case "about":    return <AboutPage t={t} />;
      case "safety":   return <SafetyPage t={t} />;
      case "contact":  return <ContactPage t={t} />;
      case "support":  return <SupportPage t={t} />;
      case "home":
      default:
        return (
          <HomePage
            t={t}
            onNavigate={onNavigate}
            selectedCity={selectedCity}
            onClearCity={() => setSelectedCity(null)}
          />
        );
    }
  }, [active, t, onNavigate, selectedCity]);

  return (
    <div className="yala-site" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <a className="ys-skip" href="#ys-main">{t("skip")}</a>
      <SiteHeader
        t={t}
        lang={lang}
        route={active}
        onNavigate={onNavigate}
        onLangChange={(c) => i18n.changeLanguage(c)}
        onCitySelect={handleCitySelect}
      />
      <main id="ys-main">{page}</main>
      <SiteFooter t={t} onNavigate={onNavigate} />
    </div>
  );
}

