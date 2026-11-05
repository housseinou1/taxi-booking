import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WEBSITE_I18N, WEBSITE_LANGS, normalizeWebsiteLang } from "./websiteI18n";
import HomePage from "./HomePage";
import {
  RiderPage, DriverPage, DeliveryPage,
  AboutPage, SafetyPage, ContactPage, SupportPage,
} from "./Pages";
import "./website.css";

/* --------------------------------------------------------------------------
   Slice 1: shell (header + nav + footer) and the Home page.
   Additional pages are registered in ROUTES as later slices land.
   -------------------------------------------------------------------------- */

export const WEBSITE_ROUTES = ["home", "rider", "driver", "delivery", "about", "safety", "contact", "support"];

const NAV_KEYS = [
  ["home", "navHome"],
  ["rider", "navRider"],
  ["driver", "navDriver"],
  ["delivery", "navDelivery"],
  ["about", "navAbout"],
  ["safety", "navSafety"],
  ["contact", "navContact"],
  ["support", "navSupport"],
];

const CONTACT = {
  phoneDisplay: "+222 22 11 43 73",
  phoneHref: "tel:+22222114373",
  waHref: "https://wa.me/19293036846",
  waDisplay: "+1 929 303 6846",
  supportEmail: "support@yalataxi.live",
  ceoEmail: "sakho@yalataxi.live",
  site: "https://www.yalataxi.live",
};

/** Sticky site header with the eight-item navigation and language switcher. */
function SiteHeader({ t, lang, route, onNavigate, onLangChange }) {
  const [open, setOpen] = useState(false);

  const go = useCallback(
    (next) => (event) => {
      event.preventDefault();
      setOpen(false);
      onNavigate(next);
    },
    [onNavigate]
  );

  return (
    <>
      <header className="ys-hdr">
        <div className="ys-wrap ys-hdr-in">
          <a className="ys-brand" href="#/home" onClick={go("home")} aria-label="YALA Technologies — home">
            <span className="ys-brand-mark" aria-hidden="true">Y</span>
            <span className="ys-brand-txt">
              <strong>YALA</strong>
              <small>{t("brandTag")}</small>
            </span>
          </a>

          <nav className="ys-nav" aria-label="Main navigation" id="ys-mainnav">
            {NAV_KEYS.map(([key, label]) => (
              <a
                key={key}
                href={`#/${key}`}
                data-route={key}
                onClick={go(key)}
                aria-current={route === key ? "page" : undefined}
              >
                {t(label)}
              </a>
            ))}
          </nav>

          <div className="ys-hdr-actions">
            <div className="ys-lang" role="group" aria-label="Language">
              {WEBSITE_LANGS.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-lang={code}
                  aria-pressed={lang === code}
                  onClick={() => onLangChange(code)}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
            <a className="ys-btn ys-btn-ghost ys-btn-sm" href="/login">{t("signIn")}</a>
            <a className="ys-btn ys-btn-primary ys-btn-sm" href="/register">{t("createAccount")}</a>
            <button
              className="ys-burger"
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

      <div className={`ys-mmenu${open ? " ys-open" : ""}`} id="ys-mmenu">
        {NAV_KEYS.map(([key, label]) => (
          <a key={key} href={`#/${key}`} data-route={key} onClick={go(key)}>{t(label)}</a>
        ))}
        <hr />
        <div className="ys-mm-cta">
          <a className="ys-btn ys-btn-ghost ys-btn-block" href="/login">{t("signIn")}</a>
          <a className="ys-btn ys-btn-primary ys-btn-block" href="/register">{t("createAccount")}</a>
        </div>
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

        <div className="ys-ftr-bot">
          <span className="ys-mr"><span aria-hidden="true">🇲🇷</span>{t("ftrMade")}</span>
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

  const t = useCallback(
    (key) => (dict[key] !== undefined ? dict[key] : WEBSITE_I18N.en[key] ?? key),
    [dict]
  );

  const active = WEBSITE_ROUTES.includes(route) ? route : "home";

  // reflect language + page in the document for a11y and SEO
  useEffect(() => {
    const previous = document.title;
    document.title = "YALA — Mauritania";
    return () => { document.title = previous; };
  }, [active, lang]);

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
        return <HomePage t={t} onNavigate={onNavigate} />;
    }
  }, [active, t, onNavigate]);

  return (
    <div className="yala-site" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
      <a className="ys-skip" href="#ys-main">{t("skip")}</a>
      <SiteHeader t={t} lang={lang} route={active} onNavigate={onNavigate} onLangChange={(c) => i18n.changeLanguage(c)} />
      <main id="ys-main">{page}</main>
      <SiteFooter t={t} onNavigate={onNavigate} />
    </div>
  );
}

