import React from "react";
import FounderCard from "./FounderCard";

/* =============================================================================
   YALA public website — remaining pages (Slices 2–4)
   Rider · Driver · Delivery · About · Safety · Contact · Support
   Each page composes shared blocks so there is one source of layout truth.
   ============================================================================= */

export const SUPPORT = {
  phoneDisplay: "+222 22 11 43 73",
  phoneHref: "tel:+22222114373",
  waHref: "https://wa.me/19293036846",
  waDisplay: "+1 929 303 6846",
  email: "support@yalataxi.live",
};

/* ------------------------------------------------------------- primitives */
function PageHero({ t, crumb, icon, tone = "", title, lead, cta1, cta2, aside }) {
  return (
    <section className={`ys-phero ${tone}`.trim()}>
      <div className="ys-wrap ys-phero-grid">
        <div>
          <nav className="ys-crumb" aria-label="Breadcrumb">
            <a href="/">{t("navHome")}</a>
            <span className="ys-sep" aria-hidden="true">/</span>
            <span>{crumb}</span>
          </nav>
          <div className="ys-icon-badge" aria-hidden="true">{icon}</div>
          <h1>{title}</h1>
          <p className="ys-lead">{lead}</p>
          <div className="ys-hero-cta">
            {cta1 && <a className="ys-btn ys-btn-primary ys-btn-lg" href={cta1.href}>{cta1.label}</a>}
            {cta2 && <a className="ys-btn ys-btn-ghost ys-btn-lg" href={cta2.href}>{cta2.label}</a>}
          </div>
        </div>
        {aside && <div>{aside}</div>}
      </div>
    </section>
  );
}

function FeatureGrid({ eyebrow, title, items, icons }) {
  return (
    <section className="ys-sec">
      <div className="ys-wrap">
        <div className="ys-sec-head">
          <span className="ys-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="ys-feat-grid">
          {items.map((it, i) => (
            <article className="ys-feat" key={it.title}>
              <div className="ys-fi" aria-hidden="true">{icons[i]}</div>
              <h3>{it.title}</h3>
              <p>{it.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Checklist({ items }) {
  return (
    <ul className="ys-check">
      {items.map((x) => (
        <li key={x}><span className="ys-tick" aria-hidden="true">✓</span><span>{x}</span></li>
      ))}
    </ul>
  );
}

function CtaBand({ title, text, primary, secondary }) {
  return (
    <section className="ys-sec">
      <div className="ys-wrap">
        <div className="ys-cta-band">
          <h2>{title}</h2>
          <p>{text}</p>
          <div className="ys-row">
            {primary && <a className="ys-btn ys-btn-white ys-btn-lg" href={primary.href}>{primary.label}</a>}
            {secondary && <a className="ys-btn ys-btn-outline-l ys-btn-lg" href={secondary.href}>{secondary.label}</a>}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepList({ eyebrow, title, steps }) {
  return (
    <section className="ys-sec">
      <div className="ys-wrap">
        <div className="ys-sec-head">
          <span className="ys-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="ys-steps">
          {steps.map((s, i) => (
            <div className="ys-step" key={s.title}>
              <span className="ys-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetyGrid({ eyebrow, title, sub, items }) {
  return (
    <section className="ys-sec ys-safety">
      <div className="ys-wrap">
        <div className="ys-sec-head">
          <span className="ys-eyebrow ys-on-dark">{eyebrow}</span>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        <div className="ys-sg">
          {items.map((s) => (
            <div className="ys-sg-item" key={s.title}>
              <div className="ys-si" aria-hidden="true">{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const safetyItems = (t) => [
  { icon: "🪪", title: t("sf1t"), text: t("sf1x") },
  { icon: "📍", title: t("sf2t"), text: t("sf2x") },
  { icon: "🤝", title: t("sf3t"), text: t("sf3x") },
  { icon: "🔒", title: t("sf4t"), text: t("sf4x") },
  { icon: "🛟", title: t("sf5t"), text: t("sf5x") },
  { icon: "💬", title: t("sf6t"), text: t("sf6x") },
];

const steps = (t) => [
  { title: t("st1t"), text: t("st1x") },
  { title: t("st2t"), text: t("st2x") },
  { title: t("st3t"), text: t("st3x") },
  { title: t("st4t"), text: t("st4x") },
];

/* ------------------------------------------------------------ Rider page */
export function RiderPage({ t }) {
  return (
    <>
      <PageHero
        t={t} crumb={t("navRider")} icon="🚕" title={t("rpTitle")} lead={t("rpLead")}
        cta1={{ label: t("rpCta1"), href: "/register?role=rider" }}
        cta2={{ label: t("rpCta2"), href: "/safety" }}
        aside={<Checklist items={[t("trust1"), t("trust2"), t("trust3"), t("trust4")]} />}
      />
      <FeatureGrid
        eyebrow={t("rpFeatEyebrow")} title={t("rpFeatTitle")} icons={["⚡", "📍", "🧾", "🤝"]}
        items={[
          { title: t("rf1t"), text: t("rf1x") },
          { title: t("rf2t"), text: t("rf2x") },
          { title: t("rf3t"), text: t("rf3x") },
          { title: t("rf4t"), text: t("rf4x") },
        ]}
      />
      <StepList eyebrow={t("howEyebrow")} title={t("rpStepsTitle")} steps={steps(t)} />
      <CtaBand
        title={t("rpBandTitle")} text={t("rpBandText")}
        primary={{ label: t("rpCta1"), href: "/register?role=rider" }}
        secondary={{ label: t("navSupport"), href: "/website/support" }}
      />
    </>
  );
}

/* ----------------------------------------------------------- Driver page */
export function DriverPage({ t }) {
  return (
    <>
      <PageHero
        t={t} crumb={t("navDriver")} icon="🚗" tone="ys-gold" title={t("dpTitle")} lead={t("dpLead")}
        cta1={{ label: t("dpCta1"), href: "/register?role=driver" }}
        cta2={{ label: t("navSupport"), href: "/website/support" }}
        aside={
          <>
            <Checklist items={[t("dpReq1"), t("dpReq2"), t("dpReq3"), t("dpReq4")]} />
            <p className="ys-note-line">{t("dpReqNote")}</p>
          </>
        }
      />
      <FeatureGrid
        eyebrow={t("dpFeatEyebrow")} title={t("dpFeatTitle")} icons={["🕐", "💰", "📄", "🛡️"]}
        items={[
          { title: t("df1t"), text: t("df1x") },
          { title: t("df2t"), text: t("df2x") },
          { title: t("df3t"), text: t("df3x") },
          { title: t("df4t"), text: t("df4x") },
        ]}
      />
      <CtaBand
        title={t("dpBandTitle")} text={t("dpBandText")}
        primary={{ label: t("dpCta1"), href: "/register?role=driver" }}
        secondary={{ label: t("navContact"), href: "/contact" }}
      />
    </>
  );
}

/* ------------------------------------------------------------ About page */
export function AboutPage({ t }) {
  return (
    <>
      <PageHero
        t={t} crumb={t("navAbout")} icon="🇲🇷" title={t("aboutTitle")} lead={t("aboutText1")}
        cta1={{ label: t("navContact"), href: "/contact" }}
        cta2={{ label: t("navSafety"), href: "/safety" }}
        aside={
          <div className="ys-mr-panel">
            <div className="ys-flag-big" aria-hidden="true">🇲🇷</div>
            <h3>{t("mrTitle")}</h3>
            <p>{t("mrText")}</p>
            <div className="ys-mr-tags">
              {["mrT1", "mrT2", "mrT3", "mrT4", "mrT5"].map((k) => <span key={k}>{t(k)}</span>)}
            </div>
          </div>
        }
      />
      <section className="ys-sec">
        <div className="ys-wrap">
          <div className="ys-sec-head"><p>{t("aboutText2")}</p></div>
          <div className="ys-feat-grid">
            {[["3", "stat1"], ["3", "stat2"], ["1", "stat3"], ["🇲🇷", "stat4"]].map(([n, k]) => (
              <div className="ys-feat ys-stat" key={k}>
                <strong>{n}</strong><span>{t(k)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="ys-sec">
        <div className="ys-wrap">
          <div className="ys-sec-head">
            <span className="ys-eyebrow">{t("fdAboutEyebrow")}</span>
            <h2>{t("fdAboutTitle")}</h2>
          </div>
          <FounderCard t={t} className="ys-founder--center" />
        </div>
      </section>
    </>
  );
}

/* ----------------------------------------------------------- Safety page */
export function SafetyPage({ t }) {
  return (
    <>
      <PageHero
        t={t} crumb={t("navSafety")} icon="🛡️" title={t("spTitle")} lead={t("spLead")}
        cta1={{ label: t("spCta1"), href: "/contact" }}
        cta2={{ label: t("navSupport"), href: "/website/support" }}
        aside={<Checklist items={[t("spK1"), t("spK2"), t("spK3"), t("spK4")]} />}
      />
      <SafetyGrid
        eyebrow={t("safetyEyebrow")} title={t("safetyTitle")} sub={t("safetySub")}
        items={safetyItems(t)}
      />
      <CtaBand
        title={t("spBandTitle")} text={t("spBandText")}
        primary={{ label: t("supCta2"), href: "/contact" }}
        secondary={{ label: t("ftrEmail"), href: `mailto:${SUPPORT.email}` }}
      />
    </>
  );
}

/* ---------------------------------------------------------- Contact page */
const CONTACT_CARDS = [
  { mod: "ys-phone", icon: "📞", title: "ctPhoneT", text: "ctPhoneX",
    value: SUPPORT.phoneDisplay, btn: "ctPhoneB", href: SUPPORT.phoneHref, meta: "ctPhoneM" },
  { mod: "ys-wa", icon: "💬", title: "ctWaT", text: "ctWaX",
    value: SUPPORT.waDisplay, btn: "ctWaB", href: SUPPORT.waHref, meta: "ctWaM", external: true },
  { mod: "ys-mail", icon: "✉️", title: "ctMailT", text: "ctMailX",
    value: SUPPORT.email, btn: "ctMailB", href: `mailto:${SUPPORT.email}`, meta: "ctMailM" },
];

function ContactForm({ t }) {
  const [values, setValues] = React.useState({ name: "", email: "", phone: "", topic: "", message: "" });
  const [consent, setConsent] = React.useState(false);
  const [invalid, setInvalid] = React.useState({});
  const [status, setStatus] = React.useState(null);

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    setInvalid((i) => ({ ...i, [k]: false }));
  };

  const submit = (e) => {
    e.preventDefault();
    const bad = {};
    if (!values.name.trim()) bad.name = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) bad.email = true;
    if (!values.topic) bad.topic = true;
    if (values.message.trim().length < 10) bad.message = true;
    if (!consent) bad.consent = true;
    setInvalid(bad);
    if (Object.keys(bad).length) { setStatus({ kind: "ys-bad", key: "fBad" }); return; }
    // No backend yet — validate and report only. Nothing is transmitted.
    setStatus({ kind: "ys-ok", key: "fOk" });
    setValues({ name: "", email: "", phone: "", topic: "", message: "" });
    setConsent(false);
  };

  const field = (key, labelKey, errKey, props = {}) => (
    <div className={`ys-field${invalid[key] ? " ys-invalid" : ""}`}>
      <label htmlFor={`ys-${key}`}>
        {t(labelKey)} {props.required && <span className="ys-req">*</span>}
      </label>
      <input id={`ys-${key}`} value={values[key]} onChange={set(key)} {...props} />
      <span className="ys-err">{t(errKey)}</span>
    </div>
  );

  return (
    <div className="ys-form-wrap">
      <div className="ys-form-aside">
        <h3>{t("fmTitle")}</h3>
        <p>{t("fmSub")}</p>
        <ul className="ys-secure-list">
          {["fmS1", "fmS2", "fmS3", "fmS4", "fmS5"].map((k) => (
            <li key={k}><span className="ys-sh" aria-hidden="true">✓</span><span>{t(k)}</span></li>
          ))}
        </ul>
      </div>

      <form className="ys-cform" onSubmit={submit} noValidate>
        {/* spam honeypot: hidden from users, tempting to naive bots */}
        <div className="ys-hp" aria-hidden="true">
          <label htmlFor="ys-website">Website</label>
          <input id="ys-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <div className="ys-row2">
          {field("name", "fName", "fErrName", { type: "text", autoComplete: "name", maxLength: 80, required: true, placeholder: t("fNamePh") })}
          {field("email", "fEmail", "fErrEmail", { type: "email", autoComplete: "email", maxLength: 120, dir: "ltr", required: true, placeholder: t("fEmailPh") })}
        </div>

        <div className="ys-row2">
          {field("phone", "fPhone", "fPhoneHint", { type: "tel", autoComplete: "tel", maxLength: 24, dir: "ltr", inputMode: "tel", placeholder: t("fPhonePh") })}
          <div className={`ys-field${invalid.topic ? " ys-invalid" : ""}`}>
            <label htmlFor="ys-topic">{t("fTopic")} <span className="ys-req">*</span></label>
            <select id="ys-topic" value={values.topic} onChange={set("topic")}>
              <option value="">{t("fTopicPick")}</option>
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <option key={i} value={`t${i}`}>{t(`fTopic${i}`)}</option>
              ))}
            </select>
            <span className="ys-err">{t("fErrTopic")}</span>
          </div>
        </div>

        <div className={`ys-field${invalid.message ? " ys-invalid" : ""}`}>
          <label htmlFor="ys-message">{t("fMsg")} <span className="ys-req">*</span></label>
          <textarea id="ys-message" value={values.message} onChange={set("message")}
                    maxLength={2000} placeholder={t("fMsgPh")} />
          <span className="ys-hint">{t("fMsgHint")}</span>
          <span className="ys-err">{t("fErrMsg")}</span>
        </div>

        <label className="ys-consent" htmlFor="ys-consent">
          <input id="ys-consent" type="checkbox" checked={consent}
                 onChange={(e) => { setConsent(e.target.checked); setInvalid((i) => ({ ...i, consent: false })); }} />
          <span>{t("fConsent")} <a href="/privacy">{t("ftrPrivacy")}</a>.</span>
        </label>
        {invalid.consent && <span className="ys-err ys-err-show">{t("fErrConsent")}</span>}

        <button className="ys-btn ys-btn-primary ys-btn-lg ys-btn-block" type="submit" disabled aria-disabled="true">
          <span className="ys-ico" aria-hidden="true">✉️</span>
          <span>{t("fSend")}</span>
        </button>

        <div className="ys-status ys-show ys-note" role="status">
          {t("fFoot")}
        </div>

        <p className="ys-form-foot">
          <a href={SUPPORT.phoneHref}>{SUPPORT.phoneDisplay}</a>
          <span aria-hidden="true"> · </span>
          <a href={SUPPORT.waHref} target="_blank" rel="noopener noreferrer">{SUPPORT.waDisplay}</a>
          <span aria-hidden="true"> · </span>
          <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a>
        </p>
      </form>
    </div>
  );
}

export function ContactPage({ t }) {
  return (
    <>
      <PageHero t={t} crumb={t("navContact")} icon="📞" title={t("ctTitle")} lead={t("ctSub")} />
      <section className="ys-sec ys-contact">
        <div className="ys-wrap">
          <div className="ys-contact-grid">
            {CONTACT_CARDS.map((c) => (
              <article className={`ys-ccard ${c.mod}`} key={c.title}>
                <div className="ys-cico" aria-hidden="true">{c.icon}</div>
                <h3>{t(c.title)}</h3>
                <span className="ys-cval">{c.value}</span>
                <p>{t(c.text)}</p>
                <a className={`ys-btn ${c.mod === "ys-wa" ? "ys-btn-wa" : c.mod === "ys-phone" ? "ys-btn-primary" : "ys-btn-ghost"} ys-btn-block ys-cbtn`}
                   href={c.href} {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                  {t(c.btn)}
                </a>
                <span className="ys-meta">{t(c.meta)}</span>
              </article>
            ))}
          </div>
          <ContactForm t={t} />
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------- Support page */
export function SupportPage({ t }) {
  const faqs = [
    { q: t("faq1q"), a: t("faq1a") },
    { q: t("faq2q"), a: t("faq2a") },
    { q: t("faq3q"), a: t("faq3a") },
    { q: t("faq4q"), a: t("faq4a") },
  ];
  return (
    <>
      <PageHero
        t={t} crumb={t("navSupport")} icon="💬" title={t("supTitle")} lead={t("supText")}
        cta1={{ label: t("supCta2"), href: "/contact" }}
        cta2={{ label: t("ctPhoneB"), href: SUPPORT.phoneHref }}
      />
      <section className="ys-sec">
        <div className="ys-wrap">
          <div className="ys-sec-head">
            <span className="ys-eyebrow">{t("supFaqEyebrow")}</span>
            <h2>{t("supFaqTitle")}</h2>
          </div>
          <div className="ys-faq">
            {faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="ys-ans">{f.a}</div>
              </details>
            ))}
          </div>
          <CtaBand
            title={t("supTitle")} text={t("supText")}
            primary={{ label: t("supCta2"), href: "/contact" }}
            secondary={{ label: t("ctWaB"), href: SUPPORT.waHref }}
          />
        </div>
      </section>
    </>
  );
}

/* --------------------------------------------------------- Delivery page */
export function DeliveryPage({ t }) {
  return (
    <>
      <PageHero
        t={t} crumb={t("navDelivery")} icon="📦" tone="ys-blue" title={t("lvTitle")} lead={t("lvLead")}
        cta1={{ label: t("deliveryCta"), href: "/register" }}
        cta2={{ label: t("navContact"), href: "/contact" }}
      />
      <FeatureGrid
        eyebrow={t("lvFeatEyebrow")} title={t("lvFeatTitle")} icons={["📝", "🗺️", "🔐", "🧾"]}
        items={[
          { title: t("lf1t"), text: t("lf1x") },
          { title: t("lf2t"), text: t("lf2x") },
          { title: t("lf3t"), text: t("lf3x") },
          { title: t("lf4t"), text: t("lf4x") },
        ]}
      />
      <CtaBand
        title={t("lvBandTitle")} text={t("lvBandText")}
        primary={{ label: t("deliveryCta"), href: "/register" }}
        secondary={{ label: t("navSupport"), href: "/website/support" }}
      />
    </>
  );
}

