import React from "react";
import FounderCard from "./FounderCard";

/**
 * Slice 1 — Home page.
 * Sections: hero (+ founder card), services, how it works, safety, CTA band.
 * No city list and no invented statistics, per the CEO's decision (Option A).
 */

const SERVICES = [
  { key: "rider", mod: "", icon: "🚕", to: "rider" },
  { key: "driver", mod: "ys-gold", icon: "🚗", to: "driver" },
  { key: "delivery", mod: "ys-blue", icon: "📦", to: "delivery" },
];

const STEPS = [
  { n: "01", t: "st1t", x: "st1x" },
  { n: "02", t: "st2t", x: "st2x" },
  { n: "03", t: "st3t", x: "st3x" },
  { n: "04", t: "st4t", x: "st4x" },
];

const SAFETY = [
  { icon: "🪪", t: "sf1t", x: "sf1x" },
  { icon: "📍", t: "sf2t", x: "sf2x" },
  { icon: "🤝", t: "sf3t", x: "sf3x" },
  { icon: "🔒", t: "sf4t", x: "sf4x" },
  { icon: "🛟", t: "sf5t", x: "sf5x" },
  { icon: "💬", t: "sf6t", x: "sf6x" },
];

export default function HomePage({ t, onNavigate }) {
  const go = (next) => (event) => {
    event.preventDefault();
    onNavigate(next);
  };

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="ys-hero">
        <div className="ys-wrap ys-hero-grid">
          <div>
            <span className="ys-badge-mr">
              <span className="ys-flag" aria-hidden="true">🇲🇷</span>
              <span>{t("heroBadge")}</span>
            </span>

            <h1>
              {t("heroTitle1")} <em>{t("heroTitle2")}</em>
            </h1>

            <p className="ys-hero-sub">{t("heroSub")}</p>

            <div className="ys-hero-cta">
              <a className="ys-btn ys-btn-primary ys-btn-lg" href="/register?role=rider">
                <span className="ys-ico" aria-hidden="true">🚕</span>
                <span>{t("ctaBook")}</span>
              </a>
              <a className="ys-btn ys-btn-ghost ys-btn-lg" href="/register?role=driver">
                <span className="ys-ico" aria-hidden="true">🚗</span>
                <span>{t("ctaDrive")}</span>
              </a>
            </div>

            <div className="ys-trust">
              {["trust1", "trust2", "trust3", "trust4"].map((k) => (
                <span key={k}>
                  <i className="ys-ck" aria-hidden="true">✓</i>
                  <span>{t(k)}</span>
                </span>
              ))}
            </div>

            <FounderCard t={t} />
          </div>

          <div className="ys-hero-visual" aria-hidden="true">
            <div className="ys-phone">
              <div className="ys-scr">
                <div className="ys-bar ys-w45" />
                <div className="ys-mini">🚕</div>
                <div className="ys-row"><span className="ys-av">📍</span><span className="ys-ln"><i /><i /></span></div>
                <div className="ys-row"><span className="ys-av">👤</span><span className="ys-ln"><i /><i /></span></div>
                <div className="ys-row"><span className="ys-av">💳</span><span className="ys-ln"><i /><i /></span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- services */}
      <section className="ys-sec" id="ys-services">
        <div className="ys-wrap">
          <div className="ys-sec-head">
            <span className="ys-eyebrow">{t("svcEyebrow")}</span>
            <h2>{t("svcTitle")}</h2>
            <p>{t("svcSub")}</p>
          </div>

          <div className="ys-cards">
            {SERVICES.map(({ key, mod, icon, to }) => (
              <article key={key} className={`ys-card ${mod}`.trim()}>
                <span className="ys-card-ico" aria-hidden="true">{icon}</span>
                <h3>{t(`${key}Title`)}</h3>
                <p>{t(`${key}Text`)}</p>
                <ul>
                  {[1, 2, 3, 4].map((i) => (
                    <li key={i}>
                      <span className="ys-tick" aria-hidden="true">✓</span>
                      <span>{t(`${key}L${i}`)}</span>
                    </li>
                  ))}
                </ul>
                <div className="ys-card-cta">
                  <a className="ys-btn ys-btn-primary ys-btn-block" href={`#/${to}`} onClick={go(to)}>
                    {t(`${key}Cta`)}
                  </a>
                  <span className="ys-note">{t(`${key}Note`)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- how it works */}
      <section className="ys-sec">
        <div className="ys-wrap">
          <div className="ys-sec-head">
            <span className="ys-eyebrow">{t("howEyebrow")}</span>
            <h2>{t("howTitle")}</h2>
          </div>
          <div className="ys-steps">
            {STEPS.map(({ n, t: titleKey, x }) => (
              <div className="ys-step" key={n}>
                <span className="ys-n" aria-hidden="true">{n}</span>
                <h3>{t(titleKey)}</h3>
                <p>{t(x)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- safety */}
      <section className="ys-sec ys-safety">
        <div className="ys-wrap">
          <div className="ys-sec-head">
            <span className="ys-eyebrow ys-on-dark">{t("safetyEyebrow")}</span>
            <h2>{t("safetyTitle")}</h2>
            <p>{t("safetySub")}</p>
          </div>
          <div className="ys-sg">
            {SAFETY.map(({ icon, t: titleKey, x }) => (
              <div className="ys-sg-item" key={titleKey}>
                <div className="ys-si" aria-hidden="true">{icon}</div>
                <h3>{t(titleKey)}</h3>
                <p>{t(x)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- cta band */}
      <section className="ys-sec">
        <div className="ys-wrap">
          <div className="ys-cta-band">
            <h2>{t("bandTitle")}</h2>
            <p>{t("bandText")}</p>
            <div className="ys-row">
              <a className="ys-btn ys-btn-white ys-btn-lg" href="/register">{t("createAccount")}</a>
              <a className="ys-btn ys-btn-outline-l ys-btn-lg" href="#/support" onClick={go("support")}>
                {t("navSupport")}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

