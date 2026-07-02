import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { languageOptions, normalizeLanguageCode } from "../i18n";

const ASSETS = {
  logo: "/yala-logo-housseinou.png",
  riderLogo: "/yala-rider-logo.png",
  driverLogo: "/yala-driver-logo.png",
  adminLogo: "/yala-admin-logo.png",
  riderHome: "/play-store/yala-rider-phone-1-home.png",
  riderVehicles: "/play-store/yala-rider-phone-2-vehicles.png",
  riderTracking: "/play-store/yala-rider-phone-3-tracking.png",
  riderSafety: "/play-store/yala-rider-phone-4-safety.png",
  driverHome: "/play-store/yala-driver-phone-1-dashboard.png",
  driverTrip: "/play-store/yala-driver-phone-2-trip.png",
  driverEarnings: "/play-store/yala-driver-phone-3-earnings.png",
};

const PLAY_STORE = {
  rider: "https://play.google.com/store/apps/details?id=com.yala.rider.mr",
  driver: "https://play.google.com/store/apps/details?id=com.yala.driver.mr",
  delivery: "https://play.google.com/store/apps/details?id=com.yala.delivery.mr",
};

const go = (path) => {
  if (path.startsWith("http")) {
    window.open(path, "_blank");
  } else {
    window.location.href = path;
  }
};

const HERO_HEADLINE = "Yala Technologies Rides Across Mauritania";
const HERO_CREDIT = "created by Housseinou Sakho";

const CITIES = [
  "Nouakchott", "Nouadhibou", "Rosso", "Kiffa", "Atar", "Zouérat",
  "Kaédi", "Néma", "Sélibaby", "Aleg", "Tidjikja", "Aioun el Atrouss",
  "Akjoujt", "Boutilimit", "Timbédra", "Bir Moghrein", "F'Dérik",
  "Maghama", "Toulel",
];

const FEATURES_KEYS = [
  { icon: "⚡", key: "instantBooking" },
  { icon: "📍", key: "liveTracking" },
  { icon: "🔒", key: "securePayments" },
  { icon: "✓", key: "driverVerification" },
  { icon: "⭐", key: "ratingsReviews" },
  { icon: "📊", key: "earningsDashboard" },
  { icon: "🕐", key: "rideHistory" },
  { icon: "🛡️", key: "safetyTools" },
];

const SAFETY_KEYS = [
  { icon: "🛡️", key: "verifiedDrivers" },
  { icon: "🔒", key: "securePayments" },
  { icon: "📍", key: "realTimeTracking" },
  { icon: "📞", key: "support247" },
  { icon: "🚨", key: "riderSafety" },
  { icon: "⭐", key: "communityTrust" },
];

export default function LandingPage() {
  const { t, i18n } = useTranslation();
  const currentLanguage = normalizeLanguageCode(i18n.language);
  const [menuOpen, setMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem("yala_dark_mode");
    if (saved !== null) return saved === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    localStorage.setItem("yala_dark_mode", darkMode);
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <div className={`yala-site ${darkMode ? "dark" : ""}`}>
      <SiteStyles darkMode={darkMode} />

      {/* Header with hamburger menu */}
      <header className="site-header">
        <button className="brand-button" onClick={() => go("/")} aria-label="Yala home">
          <img src={ASSETS.logo} alt="Yala" />
          <span><strong>Yala</strong><small>Ride anywhere</small></span>
        </button>

        <nav className="site-nav desktop-nav" aria-label="Main navigation">
          <a href="#rider">Rider</a>
          <a href="#driver">Driver</a>
          <a href="#delivery">Delivery</a>
          <a href="#admin">Admin</a>
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
          <a href="#support">Support</a>
        </nav>

        <div className="header-actions desktop-actions">
          <button
            className="theme-toggle"
            onClick={() => setDarkMode(!darkMode)}
            aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
          <select
            aria-label="Language"
            value={currentLanguage}
            onChange={(e) => i18n.changeLanguage(normalizeLanguageCode(e.target.value))}
          >
            {languageOptions.map((l) => (
              <option key={l.code} value={l.code}>{l.nativeName}</option>
            ))}
          </select>
          <button className="quiet-button" onClick={() => go("/login")}>Log in</button>
          <button className="primary-button compact" onClick={() => go("/register")}>Create account</button>
        </div>

        {/* Hamburger button */}
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span className={`hamburger-icon ${menuOpen ? "open" : ""}`} />
        </button>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <button onClick={(e) => { e.stopPropagation(); setDarkMode(!darkMode); }}>
            {darkMode ? "☀️ Light mode" : "🌙 Dark mode"}
          </button>
          <a href="#rider">Rider</a>
          <a href="#driver">Driver</a>
          <a href="#delivery">Delivery</a>
          <a href="#admin">Admin</a>
          <a href="#features">Features</a>
          <a href="#safety">Safety</a>
          <a href="#support">Support</a>
          <hr />
          <button onClick={() => go("/login")}>Log in</button>
          <button onClick={() => go("/register")}>Create account</button>
          <button onClick={() => go("/rider-dashboard")}>Open Rider App</button>
          <button onClick={() => go("/driver")}>Open Driver App</button>
          <button onClick={() => go("/delivery")}>Request Delivery</button>
          <button onClick={() => go("/login?next=%2Fadmin")}>Admin</button>
          <hr />
          <select
            aria-label="Language"
            value={currentLanguage}
            onChange={(e) => { i18n.changeLanguage(normalizeLanguageCode(e.target.value)); setMenuOpen(false); }}
          >
            {languageOptions.map((l) => (
              <option key={l.code} value={l.code}>{l.nativeName}</option>
            ))}
          </select>
        </div>
      )}

      <main>
        {/* Hero Section */}
        <section className="hero-band">
          <div className="hero-copy">
            <div className="mr-badge">
              <span className="mr-flag">🇲🇷</span>
              <span>{t("newLanding.badge")}</span>
            </div>
            <h1 className="hero-headline">{HERO_HEADLINE}</h1>
            <p className="hero-credit">{HERO_CREDIT}</p>
            <p className="hero-subtitle">{t("newLanding.heroSubtitle")}</p>
            <div className="action-row">
              <button className="primary-button large" onClick={() => go(PLAY_STORE.rider)}>
                <span>📱</span> Download Rider App
              </button>
              <button className="secondary-button large" onClick={() => go(PLAY_STORE.driver)}>
                <span>🚗</span> Download Driver App
              </button>
            </div>
            <div className="action-row secondary-actions">
              <button className="outline-button" onClick={() => go("/register?role=rider")}>{t("newLanding.registerRider")}</button>
              <button className="outline-button" onClick={() => go("/register?role=driver")}>{t("newLanding.registerDriver")}</button>
              <button className="outline-button" onClick={() => go("/delivery")}>Send a package</button>
            </div>
            <div className="trust-row">
              <span>✓ {t("newLanding.trustVerified")}</span>
              <span>✓ {t("newLanding.trustTracking")}</span>
              <span>✓ {t("newLanding.trustSupport")}</span>
              <span>✓ {t("newLanding.trustPayments")}</span>
            </div>
          </div>

          <div className="hero-product" aria-label="Yala apps">
            <div className="phone-shot back"><img src={ASSETS.driverHome} alt="Yala Driver" /></div>
            <div className="phone-shot front"><img src={ASSETS.riderHome} alt="Yala Rider" /></div>
          </div>
        </section>

        {/* Cities Banner */}
        <section className="cities-band">
          <div className="cities-inner">
            <span className="mr-flag-small">🇲🇷</span>
            <span className="cities-label">{t("newLanding.availableIn")}:</span>
            {CITIES.map((city) => (
              <span key={city} className="city-tag">{city}</span>
            ))}
          </div>
        </section>

        {/* App Downloads */}
        <section className="quick-actions">
          <DownloadAction
            logo={ASSETS.riderLogo}
            title="Yala Rider"
            text={t("newLanding.riderDesc")}
            button={t("newLanding.getRider")}
            onClick={() => go(PLAY_STORE.rider)}
          />
          <DownloadAction
            logo={ASSETS.driverLogo}
            title="Yala Driver"
            text={t("newLanding.driverDesc")}
            button={t("newLanding.getDriver")}
            onClick={() => go(PLAY_STORE.driver)}
          />
          <CourierAction />
          <DeliveryAction />
          <AdminAction />
          <div className="account-action">
            <span className="eyebrow-dark">{t("newLanding.newToYala")}</span>
            <h2>{t("newLanding.oneAccount")}</h2>
            <p>{t("newLanding.oneAccountDesc")}</p>
            <button className="primary-button" onClick={() => go("/register")}>{t("newLanding.createAccount")}</button>
          </div>
        </section>

        {/* Features Section */}
        <section className="features-band" id="features">
          <div className="section-heading center">
            <span className="eyebrow">{t("newLanding.featuresEyebrow")}</span>
            <h2>{t("newLanding.featuresTitle")}</h2>
            <p>{t("newLanding.featuresSubtitle")}</p>
          </div>
          <div className="features-grid">
            {FEATURES_KEYS.map((f) => (
              <article key={f.key} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <h3>{t(`newLanding.features.${f.key}.title`)}</h3>
                <p>{t(`newLanding.features.${f.key}.text`)}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Rider Product Section */}
        <ProductSection
          id="rider"
          tone="rider"
          eyebrow={t("newLanding.forRiders")}
          title={t("newLanding.riderTitle")}
          description={t("newLanding.riderDescription")}
          features={[
            [t("newLanding.riderF1Title"), t("newLanding.riderF1Text")],
            [t("newLanding.riderF2Title"), t("newLanding.riderF2Text")],
            [t("newLanding.riderF3Title"), t("newLanding.riderF3Text")],
            [t("newLanding.riderF4Title"), t("newLanding.riderF4Text")],
          ]}
          images={[ASSETS.riderHome, ASSETS.riderVehicles, ASSETS.riderTracking]}
          primaryLabel={t("newLanding.openRider")}
          primaryPath="/rider-dashboard"
          secondaryLabel={t("newLanding.createRiderAccount")}
          secondaryPath="/register?role=rider"
        />

        {/* Driver Product Section */}
        <ProductSection
          id="driver"
          tone="driver"
          eyebrow={t("newLanding.forDrivers")}
          title={t("newLanding.driverTitle")}
          description={t("newLanding.driverDescription")}
          features={[
            [t("newLanding.driverF1Title"), t("newLanding.driverF1Text")],
            [t("newLanding.driverF2Title"), t("newLanding.driverF2Text")],
            [t("newLanding.driverF3Title"), t("newLanding.driverF3Text")],
            [t("newLanding.driverF4Title"), t("newLanding.driverF4Text")],
          ]}
          images={[ASSETS.driverHome, ASSETS.driverTrip, ASSETS.driverEarnings]}
          primaryLabel={t("newLanding.openDriver")}
          primaryPath="/driver"
          secondaryLabel={t("newLanding.applyDrive")}
          secondaryPath="/register?role=driver"
        />

        {/* Delivery Product Section */}
        <section className="delivery-section" id="delivery">
          <div className="delivery-copy">
            <span className="eyebrow">Yala Delivery</span>
            <h2>Send packages across Mauritania with confidence.</h2>
            <p className="product-description">
              Request Food, Courier, Packages, or Pharmacy Medicines with live tracking
              and a private recipient PIN. Couriers use the separate Yala Delivery app.
            </p>
            <div className="delivery-points">
              <InfoBlock icon="🍕" title="Food" text="Restaurant and meal delivery with insulated handling." />
              <InfoBlock icon="🚴" title="Courier" text="Documents, errands, and same-day courier runs." />
              <InfoBlock icon="📦" title="Packages" text="Parcels and boxed items, door-to-door." />
              <InfoBlock icon="💊" title="Pharmacy Medicines" text="Prescription and pharmacy items with careful handling." />
            </div>
            <div className="action-row">
              <button className="primary-button" onClick={() => go("/delivery")}>Request a delivery</button>
              <button className="outline-button" onClick={() => go("/login?next=%2Fdelivery%2Fcourier")}>Courier sign in</button>
              <button className="outline-button" onClick={() => go(PLAY_STORE.delivery)}>Download courier app</button>
            </div>
          </div>
          <div className="delivery-visual" aria-label="Yala Delivery workflow">
            <div className="delivery-status">
              <span className="delivery-kicker">Active delivery</span>
              <strong>Package on the way</strong>
              <span>Nouakchott · 12 min</span>
            </div>
            <div className="delivery-route">
              <div><span className="route-dot pickup" /><p><strong>Pickup confirmed</strong><small>Package collected securely</small></p></div>
              <div><span className="route-dot moving" /><p><strong>Driver en route</strong><small>Live location and ETA available</small></p></div>
              <div><span className="route-dot destination" /><p><strong>Recipient handoff</strong><small>Protected by a 4-digit PIN</small></p></div>
            </div>
            <div className="delivery-pin"><span>Recipient PIN</span><strong>••••</strong><small>Shared privately with the recipient</small></div>
          </div>
        </section>

        {/* Admin Operations Section */}
        <section className="admin-section" id="admin">
          <div className="admin-copy">
            <span className="eyebrow admin-eyebrow">Yala Admin</span>
            <h2>Operate the entire Yala platform from one command center.</h2>
            <p className="product-description">
              Review accounts, monitor rides and deliveries, manage safety, and understand platform
              performance from a secure operations dashboard.
            </p>
            <div className="admin-capabilities">
              <InfoBlock icon="✓" title="Driver and rider verification" text="Review identities, documents, vehicles, and account approvals." />
              <InfoBlock icon="📍" title="Live operations oversight" text="Monitor active rides, deliveries, drivers, and service activity." />
              <InfoBlock icon="🚨" title="Safety monitoring" text="Manage emergency events, blocked accounts, and safety reports." />
              <InfoBlock icon="📊" title="Payments and analytics" text="Track revenue, payments, reports, and marketplace performance." />
            </div>
            <div className="action-row">
              <button className="primary-button admin-button" onClick={() => go("/login?next=%2Fadmin")}>Open Admin Console</button>
            </div>
          </div>

          <div className="admin-dashboard-preview" aria-label="Yala Admin operations dashboard preview">
            <div className="admin-preview-head">
              <img src={ASSETS.adminLogo} alt="" />
              <div><strong>Yala Admin</strong><span>Operations command center</span></div>
              <span className="admin-live">Live</span>
            </div>
            <div className="admin-metrics">
              <div className="admin-metric"><strong>148</strong><span>Active drivers</span></div>
              <div className="admin-metric"><strong>36</strong><span>Live rides</span></div>
              <div className="admin-metric"><strong>12</strong><span>Deliveries</span></div>
              <div className="admin-metric"><strong>4</strong><span>Pending reviews</span></div>
            </div>
            <div className="admin-activity">
              <span className="admin-activity-title">Operations status</span>
              <div className="admin-activity-row"><span className="admin-status green" /><div><strong>Driver network</strong><small>148 verified drivers online</small></div><b>Healthy</b></div>
              <div className="admin-activity-row"><span className="admin-status gold" /><div><strong>Account verification</strong><small>4 applications awaiting review</small></div><b>Review</b></div>
              <div className="admin-activity-row"><span className="admin-status blue" /><div><strong>Payments</strong><small>Daily settlement processing</small></div><b>Active</b></div>
            </div>
          </div>
        </section>

        {/* Trust & Safety Section */}
        <section className="safety-band" id="safety">
          <div className="section-heading">
            <span className="eyebrow light">{t("newLanding.safetyEyebrow")}</span>
            <h2>{t("newLanding.safetyTitle")}</h2>
            <p>{t("newLanding.safetySubtitle")}</p>
          </div>
          <div className="safety-grid">
            {SAFETY_KEYS.map((item) => (
              <InfoBlock key={item.key} icon={item.icon} title={t(`newLanding.safety.${item.key}.title`)} text={t(`newLanding.safety.${item.key}.text`)} />
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="journey-band">
          <div className="section-heading center">
            <span className="eyebrow">{t("newLanding.howEyebrow")}</span>
            <h2>{t("newLanding.howTitle")}</h2>
          </div>
          <div className="journey-grid">
            <JourneyStep number="01" title={t("newLanding.step1Title")} text={t("newLanding.step1Text")} />
            <JourneyStep number="02" title={t("newLanding.step2Title")} text={t("newLanding.step2Text")} />
            <JourneyStep number="03" title={t("newLanding.step3Title")} text={t("newLanding.step3Text")} />
            <JourneyStep number="04" title={t("newLanding.step4Title")} text={t("newLanding.step4Text")} />
          </div>
        </section>

        {/* App Screenshots */}
        <section className="screenshots-band">
          <div className="section-heading center">
            <span className="eyebrow">{t("newLanding.screenshotsEyebrow")}</span>
            <h2>{t("newLanding.screenshotsTitle")}</h2>
          </div>
          <div className="screenshots-row">
            <div className="screenshot-group">
              <h3>Yala Rider</h3>
              <div className="screenshot-phones">
                <img src={ASSETS.riderHome} alt="Rider Home" />
                <img src={ASSETS.riderVehicles} alt="Rider Vehicles" />
                <img src={ASSETS.riderTracking} alt="Rider Tracking" />
                <img src={ASSETS.riderSafety} alt="Rider Safety" />
              </div>
            </div>
            <div className="screenshot-group">
              <h3>Yala Driver</h3>
              <div className="screenshot-phones">
                <img src={ASSETS.driverHome} alt="Driver Dashboard" />
                <img src={ASSETS.driverTrip} alt="Driver Trip" />
                <img src={ASSETS.driverEarnings} alt="Driver Earnings" />
              </div>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="support-band" id="support">
          <div>
            <span className="eyebrow light">{t("newLanding.supportEyebrow")}</span>
            <h2>{t("newLanding.supportTitle")}</h2>
            <p>{t("newLanding.supportSubtitle")}</p>
          </div>
          <div className="action-row">
            <button className="primary-button white" onClick={() => go("/support")}>{t("newLanding.openSupport")}</button>
            <button className="outline-button light" onClick={() => go("/terms")}>{t("newLanding.readTerms")}</button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="footer-top">
          <div className="footer-brand">
            <img src={ASSETS.logo} alt="Yala" />
            <div>
              <strong>Yala Technologies</strong>
              <span>Ride-hailing platform for Mauritania</span>
            </div>
          </div>
          <div className="footer-columns">
            <div className="footer-col">
              <h4>Platform</h4>
              <button onClick={() => go("/rider-dashboard")}>Rider App</button>
              <button onClick={() => go("/driver")}>Driver App</button>
              <button onClick={() => go("/login?next=%2Fdelivery%2Fcourier")}>Courier App</button>
              <button onClick={() => go("/delivery")}>Send a package</button>
              <button onClick={() => go("/login?next=%2Fadmin")}>Yala Admin</button>
              <button onClick={() => go("/register")}>Register</button>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <button onClick={() => go("/privacy")}>Privacy Policy</button>
              <button onClick={() => go("/terms")}>Terms of Service</button>
              <a href="https://housseinou1.github.io/yala-driver/delete-account.html" target="_blank" rel="noopener noreferrer">Account Deletion</a>
            </div>
            <div className="footer-col">
              <h4>Support</h4>
              <button onClick={() => go("/support")}>Support Center</button>
              <a href="mailto:sakhohousseinou@gmail.com">Contact Us</a>
              <span className="footer-email">sakhohousseinou@gmail.com</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="mr-flag-small">🇲🇷</span>
          <span>Proudly built in Mauritania</span>
          <span className="copyright">© 2026 Yala Technologies. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}


function DownloadAction({ logo, title, text, button, onClick }) {
  return (
    <article className="download-action">
      <img src={logo} alt="" />
      <div><h2>{title}</h2><p>{text}</p></div>
      <button className="download-button" onClick={onClick}>{button}<span aria-hidden="true">→</span></button>
    </article>
  );
}

function CourierAction() {
  return (
    <article className="download-action delivery-action">
      <span className="delivery-action-icon" aria-hidden="true">🚚</span>
      <div>
        <h2>Yala Delivery Courier</h2>
        <p>Deliver by Bicycle, Motorcycle, or Car across Food, Courier, Packages, and Pharmacy runs.</p>
      </div>
      <button className="download-button" onClick={() => go("/login?next=%2Fdelivery%2Fcourier")}>
        Open courier app
        <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function DeliveryAction() {
  return (
    <article className="download-action delivery-action">
      <span className="delivery-action-icon" aria-hidden="true">📦</span>
      <div>
        <h2>Send a package</h2>
        <p>Request Food, Courier, Packages, or Pharmacy Medicines with live tracking.</p>
      </div>
      <button className="download-button" onClick={() => go("/delivery")}>
        Request delivery
        <span aria-hidden="true">→</span>
      </button>
    </article>
  );
}

function AdminAction() {
  return (
    <article className="download-action admin-action">
      <img src={ASSETS.adminLogo} alt="" />
      <div>
        <h2>Yala Admin</h2>
        <p>Approve accounts, monitor operations, manage safety, and track platform performance.</p>
      </div>
      <button className="download-button" onClick={() => go("/login?next=%2Fadmin")}>Open Admin Console<span aria-hidden="true">→</span></button>
    </article>
  );
}

function ProductSection({ id, tone, eyebrow, title, description, features, images, primaryLabel, primaryPath, secondaryLabel, secondaryPath }) {
  return (
    <section className={`product-section ${tone}`} id={id}>
      <div className="product-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p className="product-description">{description}</p>
        <div className="feature-list">
          {features.map(([ft, text]) => (
            <div className="feature-row" key={ft}><span>✓</span><div><strong>{ft}</strong><p>{text}</p></div></div>
          ))}
        </div>
        <div className="action-row">
          <button className="primary-button" onClick={() => go(primaryPath)}>{primaryLabel}</button>
          <button className="outline-button" onClick={() => go(secondaryPath)}>{secondaryLabel}</button>
        </div>
      </div>
      <div className="screens-gallery">
        {images.map((src, i) => <img key={src} className={`screen screen-${i + 1}`} src={src} alt="" />)}
      </div>
    </section>
  );
}

function InfoBlock({ icon, title, text }) {
  return <article className="info-block"><span className="info-icon">{icon}</span><h3>{title}</h3><p>{text}</p></article>;
}

function JourneyStep({ number, title, text }) {
  return <article className="journey-step"><span className="step-num">{number}</span><h3>{title}</h3><p>{text}</p></article>;
}

function SiteStyles({ darkMode }) {
  return <style>{`
    :root { --green:#07894a; --green-dark:#065f35; --gold:#e6b928; --ink:#111914; --soft:#f2f5f1; --line:#dce4dd; --muted:#5d6a61; --bg:#ffffff; --card-bg:#ffffff; --hero-bg:linear-gradient(135deg,#f0f9f3 0%,#fff 45%,#fffbef 100%); }
    .yala-site.dark { --ink:#f0f4f1; --soft:#1a1f1c; --line:#2a3330; --muted:#9ca89e; --bg:#0a0f0c; --card-bg:#141a16; --hero-bg:linear-gradient(135deg,#0a1a10 0%,#0f1a14 45%,#1a1a0f 100%); }
    * { box-sizing:border-box; margin:0; }
    html { scroll-behavior:smooth; }
    body { margin:0; }
    button, select { font:inherit; cursor:pointer; }
    img { max-width:100%; }
    .yala-site { min-height:100vh; color:var(--ink); background:var(--bg); font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.5; transition:background .3s, color .3s; }

    /* Header */
    .site-header { height:72px; padding:0 max(20px, calc((100vw - 1240px)/2)); display:flex; align-items:center; gap:24px; border-bottom:1px solid var(--line); background:var(--bg); backdrop-filter:blur(12px); position:sticky; top:0; z-index:50; transition:background .3s; }
    .brand-button { display:flex; align-items:center; gap:10px; border:0; background:transparent; padding:0; }
    .brand-button img { width:42px; height:42px; object-fit:contain; border-radius:10px; }
    .brand-button span { display:grid; text-align:left; }
    .brand-button strong { font-size:18px; letter-spacing:-0.02em; }
    .brand-button small { color:var(--muted); font-size:11px; font-weight:600; }
    .desktop-nav { display:flex; align-items:center; gap:24px; margin-right:auto; }
    .desktop-nav a { color:var(--ink); text-decoration:none; font-weight:600; font-size:14px; transition:color .2s; }
    .desktop-nav a:hover { color:var(--green); }
    .desktop-actions { display:flex; align-items:center; gap:8px; }
    .desktop-actions select { height:38px; border:1px solid var(--line); border-radius:8px; padding:0 12px; background:var(--bg); color:var(--ink); font-size:13px; }

    /* Theme toggle */
    .theme-toggle { width:38px; height:38px; border:1px solid var(--line); border-radius:8px; background:var(--soft); display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer; transition:all .2s; }
    .theme-toggle:hover { border-color:var(--green); }

    /* Hamburger */
    .hamburger-btn { display:none; border:0; background:transparent; padding:8px; margin-left:auto; }
    .hamburger-icon { display:block; width:24px; height:2px; background:var(--ink); position:relative; transition:all .3s; }
    .hamburger-icon::before, .hamburger-icon::after { content:''; position:absolute; width:24px; height:2px; background:var(--ink); left:0; transition:all .3s; }
    .hamburger-icon::before { top:-7px; }
    .hamburger-icon::after { top:7px; }
    .hamburger-icon.open { background:transparent; }
    .hamburger-icon.open::before { top:0; transform:rotate(45deg); }
    .hamburger-icon.open::after { top:0; transform:rotate(-45deg); }

    /* Mobile menu */
    .mobile-menu { position:fixed; top:72px; left:0; right:0; bottom:0; background:#fff; z-index:40; padding:24px; display:flex; flex-direction:column; gap:8px; overflow-y:auto; animation:slideDown .25s ease; }
    .mobile-menu a, .mobile-menu button { display:block; width:100%; text-align:left; padding:14px 16px; border:0; background:var(--soft); border-radius:10px; font-size:16px; font-weight:600; color:var(--ink); text-decoration:none; }
    .mobile-menu button:nth-last-child(-n+2) { background:var(--green); color:#fff; }
    .mobile-menu hr { border:0; border-top:1px solid var(--line); margin:8px 0; }
    .mobile-menu select { width:100%; height:44px; border:1px solid var(--line); border-radius:10px; padding:0 14px; font-size:14px; }
    @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }

    /* Buttons */
    .primary-button, .secondary-button, .outline-button, .quiet-button, .download-button { min-height:46px; border-radius:10px; padding:0 22px; font-weight:700; font-size:15px; border:1px solid transparent; transition:all .2s; display:inline-flex; align-items:center; gap:8px; }
    .primary-button { background:var(--green); color:#fff; }
    .primary-button:hover { background:var(--green-dark); }
    .primary-button.compact { min-height:38px; font-size:13px; border-radius:8px; }
    .primary-button.large { min-height:52px; padding:0 28px; font-size:16px; }
    .primary-button.white { background:#fff; color:var(--green); }
    .secondary-button { background:var(--ink); color:#fff; }
    .secondary-button.large { min-height:52px; padding:0 28px; font-size:16px; }
    .outline-button { background:transparent; color:var(--ink); border-color:var(--line); }
    .outline-button:hover { border-color:var(--green); color:var(--green); }
    .outline-button.light { color:#fff; border-color:rgba(255,255,255,.5); }
    .quiet-button { min-height:38px; background:transparent; color:var(--ink); padding:0 12px; }
    .download-button { width:100%; margin-top:auto; display:flex; justify-content:space-between; align-items:center; background:var(--ink); color:#fff; border-radius:10px; }

    /* Hero */
    .hero-band { min-height:680px; display:grid; grid-template-columns:minmax(0,1.1fr) minmax(380px,.9fr); gap:48px; align-items:center; padding:60px max(24px, calc((100vw - 1240px)/2)); overflow:hidden; background:var(--hero-bg); border-bottom:1px solid var(--line); transition:background .3s; }
    .hero-copy { max-width:640px; }
    .mr-badge { display:inline-flex; align-items:center; gap:8px; background:#fff; border:1px solid var(--line); border-radius:999px; padding:8px 16px 8px 10px; margin-bottom:20px; font-size:13px; font-weight:700; color:var(--green); box-shadow:0 2px 8px rgba(0,0,0,.04); }
    .mr-flag { font-size:20px; }
    .mr-flag-small { font-size:16px; }
    .hero-copy h1.hero-headline { font-size:clamp(28px,4.2vw,46px); line-height:1.12; letter-spacing:-0.02em; margin:0 0 10px; font-weight:800; }
    .hero-credit { margin:0 0 16px; color:var(--muted); font-size:clamp(14px,1.8vw,17px); line-height:1.5; font-weight:600; letter-spacing:0.01em; }
    .hero-subtitle { color:var(--muted); font-size:18px; line-height:1.7; max-width:560px; }
    .action-row { display:flex; gap:10px; flex-wrap:wrap; margin-top:24px; }
    .secondary-actions { margin-top:12px; }
    .trust-row { display:flex; gap:16px; flex-wrap:wrap; margin-top:28px; color:var(--muted); font-size:13px; font-weight:700; }
    .hero-product { min-height:540px; position:relative; display:flex; align-items:center; justify-content:center; }
    .phone-shot { position:absolute; width:260px; height:520px; overflow:hidden; border:8px solid #1a1a1a; border-radius:32px; background:#111; box-shadow:0 30px 60px rgba(0,0,0,.18); }
    .phone-shot img { width:100%; height:100%; object-fit:cover; }
    .phone-shot.back { transform:translate(-110px,20px) rotate(-6deg); }
    .phone-shot.front { transform:translate(100px,-10px) rotate(5deg); z-index:2; }

    /* Cities */
    .cities-band { background:var(--ink); padding:24px max(24px, calc((100vw - 1240px)/2)); }
    .cities-inner { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:center; }
    .cities-label { color:rgba(255,255,255,.9); font-size:14px; font-weight:700; }
    .city-tag { background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); color:#fff; padding:8px 16px; border-radius:999px; font-size:13px; font-weight:600; }

    /* Quick Actions */
    .quick-actions { max-width:1240px; margin:0 auto; padding:70px 24px; display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; }
    .download-action, .account-action { border:1px solid var(--line); border-radius:16px; padding:28px; min-height:260px; display:flex; flex-direction:column; align-items:flex-start; background:var(--card-bg); transition:box-shadow .2s, background .3s; }
    .download-action:hover { box-shadow:0 12px 40px rgba(0,0,0,.08); }
    .download-action img { width:60px; height:60px; object-fit:contain; margin-bottom:16px; border-radius:12px; }
    .delivery-action { border-color:#d6e7dc; background:#f5fbf7; }
    .delivery-action-icon { width:60px; height:60px; display:grid; place-items:center; margin-bottom:16px; border-radius:12px; background:#e3f5e9; font-size:28px; }
    .admin-action { border-color:#cbd9ec; background:#f3f7fc; }
    .admin-action .download-button { background:#102f63; }
    .download-action h2, .account-action h2 { font-size:22px; margin-bottom:8px; }
    .download-action p, .account-action p { color:var(--muted); line-height:1.6; font-size:15px; margin-bottom:20px; }
    .account-action { grid-column:1 / -1; min-height:210px; background:linear-gradient(135deg, var(--gold), #f0c830); border-color:var(--gold); justify-content:center; }
    .eyebrow-dark { font-size:12px; font-weight:800; text-transform:uppercase; margin-bottom:12px; }

    /* Features */
    .features-band { padding:90px max(24px, calc((100vw - 1240px)/2)); background:var(--soft); transition:background .3s; }
    .section-heading { max-width:700px; margin-bottom:48px; }
    .section-heading.center { text-align:center; margin-left:auto; margin-right:auto; }
    .eyebrow { display:inline-block; color:var(--green); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; margin-bottom:12px; }
    .eyebrow.light { color:rgba(255,255,255,.7); }
    .section-heading h2, .support-band h2 { font-size:clamp(32px,4.5vw,52px); line-height:1.1; letter-spacing:-0.02em; margin-bottom:14px; }
    .section-heading p, .support-band p { color:var(--muted); font-size:17px; line-height:1.65; }
    .features-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; }
    .feature-card { background:var(--card-bg); border:1px solid var(--line); border-radius:14px; padding:24px; transition:transform .2s, box-shadow .2s, background .3s; }
    .feature-card:hover { transform:translateY(-3px); box-shadow:0 12px 30px rgba(0,0,0,.06); }
    .feature-icon { font-size:28px; display:block; margin-bottom:14px; }
    .feature-card h3 { font-size:16px; margin-bottom:8px; }
    .feature-card p { color:var(--muted); font-size:14px; line-height:1.55; }

    /* Product Sections */
    .product-section { min-height:700px; padding:90px max(24px, calc((100vw - 1240px)/2)); display:grid; grid-template-columns:.85fr 1.15fr; gap:60px; align-items:center; overflow:hidden; border-top:1px solid var(--line); }
    .product-section.rider { background:var(--soft); }
    .product-section.driver { background:var(--soft); }
    .product-copy h2 { font-size:clamp(32px,4.5vw,52px); line-height:1.1; letter-spacing:-0.02em; margin-bottom:14px; }
    .product-description { color:var(--muted); font-size:17px; line-height:1.65; }
    .feature-list { display:grid; gap:16px; margin-top:28px; }
    .feature-row { display:grid; grid-template-columns:28px 1fr; gap:10px; border-top:1px solid var(--line); padding-top:16px; }
    .feature-row > span { color:var(--green); font-weight:900; font-size:16px; }
    .feature-row strong { font-size:15px; }
    .feature-row p { color:var(--muted); margin-top:4px; line-height:1.5; font-size:14px; }
    .screens-gallery { min-height:580px; position:relative; }
    .screen { width:260px; height:520px; object-fit:cover; border:7px solid #1a1a1a; border-radius:28px; box-shadow:0 20px 50px rgba(0,0,0,.15); position:absolute; top:20px; left:50%; }
    .screen-1 { transform:translateX(-85%) rotate(-6deg); }
    .screen-2 { transform:translateX(-50%) translateY(-10px); z-index:2; }
    .screen-3 { transform:translateX(-15%) rotate(6deg); }

    /* Delivery */
    .delivery-section { padding:90px max(24px, calc((100vw - 1240px)/2)); display:grid; grid-template-columns:1.05fr .95fr; gap:60px; align-items:center; background:#f2f8f4; border-top:1px solid var(--line); }
    .delivery-copy h2 { max-width:680px; font-size:clamp(32px,4.5vw,52px); line-height:1.1; letter-spacing:-0.02em; margin-bottom:14px; }
    .delivery-points { display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-top:28px; }
    .delivery-points .info-block { padding:20px; color:var(--ink); border-color:#d8e7dc; background:#fff; }
    .delivery-points .info-icon { font-size:24px; margin-bottom:12px; }
    .delivery-points .info-block p { color:var(--muted); }
    .delivery-visual { border-radius:16px; padding:28px; background:#092f20; color:#fff; box-shadow:0 24px 60px rgba(6,95,53,.18); }
    .delivery-status { display:grid; gap:4px; padding-bottom:22px; border-bottom:1px solid rgba(255,255,255,.16); }
    .delivery-status strong { font-size:26px; }
    .delivery-status > span:last-child { color:#b8d7c5; }
    .delivery-kicker { color:#f3cf50; font-size:12px; font-weight:800; text-transform:uppercase; }
    .delivery-route { display:grid; gap:0; padding:20px 0; }
    .delivery-route > div { min-height:80px; display:grid; grid-template-columns:28px 1fr; gap:12px; position:relative; }
    .delivery-route > div:not(:last-child)::after { content:''; position:absolute; left:7px; top:22px; bottom:-4px; width:2px; background:#3d7258; }
    .route-dot { width:16px; height:16px; margin-top:4px; border-radius:50%; background:#fff; border:4px solid #55d88f; position:relative; z-index:2; }
    .route-dot.moving { border-color:var(--gold); }
    .route-dot.destination { border-color:#fff; }
    .delivery-route p { display:grid; gap:3px; }
    .delivery-route small { color:#a9c8b7; font-size:13px; }
    .delivery-pin { display:grid; grid-template-columns:1fr auto; gap:2px 16px; padding:18px; border-radius:12px; background:#fff; color:var(--ink); }
    .delivery-pin span { color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; }
    .delivery-pin strong { grid-row:1 / 3; grid-column:2; align-self:center; color:var(--green); font-size:24px; letter-spacing:.2em; }
    .delivery-pin small { color:var(--muted); }

    /* Admin */
    .admin-section { padding:90px max(24px, calc((100vw - 1240px)/2)); display:grid; grid-template-columns:1.05fr .95fr; gap:60px; align-items:center; background:#eef3fb; border-top:1px solid #d7e0ee; }
    .admin-copy h2 { max-width:720px; font-size:clamp(32px,4.5vw,52px); line-height:1.1; letter-spacing:-0.02em; margin-bottom:14px; }
    .admin-eyebrow { color:#174c96; }
    .admin-capabilities { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:28px; }
    .admin-capabilities .info-block { padding:20px; color:var(--ink); border-color:#d4dfef; background:#fff; }
    .admin-capabilities .info-icon { color:#174c96; font-size:22px; margin-bottom:10px; }
    .admin-capabilities .info-block p { color:var(--muted); }
    .admin-button { background:#174c96; }
    .admin-button:hover { background:#102f63; }
    .admin-dashboard-preview { padding:22px; border-radius:16px; background:#0b2a59; color:#fff; box-shadow:0 24px 60px rgba(16,47,99,.2); }
    .admin-preview-head { display:flex; align-items:center; gap:12px; padding-bottom:18px; border-bottom:1px solid rgba(255,255,255,.14); }
    .admin-preview-head img { width:42px; height:42px; object-fit:contain; border-radius:9px; background:#fff; }
    .admin-preview-head div { display:grid; gap:1px; }
    .admin-preview-head strong { font-size:16px; }
    .admin-preview-head span { color:#abc2e2; font-size:12px; }
    .admin-live { margin-left:auto; padding:5px 10px; border-radius:999px; background:#dff8e9; color:#087541 !important; font-weight:800; text-transform:uppercase; }
    .admin-metrics { display:grid; grid-template-columns:repeat(2, 1fr); gap:10px; margin:18px 0; }
    .admin-metric { display:grid; gap:2px; padding:16px; border:1px solid rgba(255,255,255,.14); border-radius:10px; background:#12396f; }
    .admin-metric strong { font-size:24px; }
    .admin-metric span { color:#abc2e2; font-size:12px; }
    .admin-activity { overflow:hidden; border:1px solid rgba(255,255,255,.14); border-radius:10px; background:#08244d; }
    .admin-activity-title { display:block; padding:14px 16px; color:#abc2e2; font-size:11px; font-weight:800; text-transform:uppercase; border-bottom:1px solid rgba(255,255,255,.12); }
    .admin-activity-row { display:grid; grid-template-columns:10px 1fr auto; gap:12px; align-items:center; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.1); }
    .admin-activity-row:last-child { border-bottom:0; }
    .admin-activity-row div { display:grid; gap:2px; }
    .admin-activity-row strong { font-size:13px; }
    .admin-activity-row small { color:#abc2e2; font-size:11px; }
    .admin-activity-row b { color:#dbe8f8; font-size:11px; }
    .admin-status { width:8px; height:8px; border-radius:50%; }
    .admin-status.green { background:#46da8c; }
    .admin-status.gold { background:#f1c84b; }
    .admin-status.blue { background:#55b8f4; }

    /* Safety */
    .safety-band { padding:90px max(24px, calc((100vw - 1240px)/2)); background:#0a1a10; color:#fff; }
    .safety-band .section-heading p { color:#a8c4b0; }
    .safety-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; margin-top:48px; }
    .info-block { padding:28px; border:1px solid #1e3a28; border-radius:14px; background:#112119; transition:border-color .2s; }
    .info-block:hover { border-color:var(--green); }
    .info-icon { font-size:28px; display:block; margin-bottom:16px; }
    .info-block h3 { font-size:17px; margin-bottom:8px; }
    .info-block p { color:#a8c4b0; line-height:1.6; font-size:14px; }

    /* Journey */
    .journey-band { padding:90px max(24px, calc((100vw - 1240px)/2)); }
    .journey-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:0; border:1px solid var(--line); border-radius:14px; overflow:hidden; margin-top:48px; }
    .journey-step { padding:32px 24px; border-right:1px solid var(--line); background:var(--card-bg); transition:background .3s; }
    .journey-step:last-child { border-right:0; }
    .step-num { display:inline-flex; width:36px; height:36px; align-items:center; justify-content:center; background:var(--green); color:#fff; border-radius:50%; font-size:13px; font-weight:800; }
    .journey-step h3 { margin:20px 0 8px; font-size:17px; }
    .journey-step p { color:var(--muted); font-size:14px; line-height:1.6; }

    /* Screenshots */
    .screenshots-band { padding:70px max(24px, calc((100vw - 1240px)/2)); background:var(--soft); transition:background .3s; }
    .screenshots-row { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:40px; }
    .screenshot-group { min-width:0; }
    .screenshot-group h3 { font-size:20px; margin-bottom:16px; text-align:center; }
    .screenshot-phones { display:flex; gap:12px; justify-content:center; overflow-x:auto; max-width:100%; padding-bottom:10px; }
    .screenshot-phones img { width:160px; height:320px; object-fit:cover; border:5px solid #1a1a1a; border-radius:20px; flex-shrink:0; box-shadow:0 8px 24px rgba(0,0,0,.1); }

    /* Support */
    .support-band { margin:0 max(24px, calc((100vw - 1240px)/2)) 60px; padding:48px 40px; background:var(--green); color:#fff; border-radius:16px; display:flex; justify-content:space-between; align-items:center; gap:30px; }
    .support-band .eyebrow { color:rgba(255,255,255,.7); }
    .support-band p { color:#d0eddb; }

    /* Footer */
    .site-footer { border-top:1px solid var(--line); padding:48px max(24px, calc((100vw - 1240px)/2)) 24px; }
    .footer-top { display:grid; grid-template-columns:1fr 2fr; gap:40px; margin-bottom:32px; }
    .footer-brand { display:flex; align-items:flex-start; gap:12px; }
    .footer-brand img { width:48px; height:48px; object-fit:contain; border-radius:10px; }
    .footer-brand div { display:grid; gap:2px; }
    .footer-brand strong { font-size:16px; }
    .footer-brand span { color:var(--muted); font-size:12px; }
    .footer-columns { display:grid; grid-template-columns:repeat(3, 1fr); gap:24px; }
    .footer-col h4 { font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:12px; }
    .footer-col button, .footer-col a { display:block; border:0; background:transparent; padding:6px 0; color:var(--ink); font-size:14px; font-weight:500; text-decoration:none; text-align:left; }
    .footer-col button:hover, .footer-col a:hover { color:var(--green); }
    .footer-email { display:block; color:var(--muted); font-size:13px; margin-top:4px; }
    .footer-bottom { display:flex; align-items:center; gap:10px; padding-top:20px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); }
    .copyright { margin-left:auto; }

    /* Responsive */
    @media (max-width:1050px) {
      .desktop-nav, .desktop-actions { display:none; }
      .hamburger-btn { display:block; }
      .hero-band, .product-section, .delivery-section, .admin-section { grid-template-columns:1fr; }
      .hero-product { min-height:500px; }
      .quick-actions { grid-template-columns:1fr 1fr; }
      .account-action { grid-column:1 / -1; }
      .delivery-points { grid-template-columns:1fr 1fr 1fr; }
      .features-grid { grid-template-columns:1fr 1fr; }
      .safety-grid { grid-template-columns:1fr 1fr; }
      .journey-grid { grid-template-columns:1fr 1fr; }
      .journey-step:nth-child(2) { border-right:0; }
      .journey-step { border-bottom:1px solid var(--line); }
      .screenshots-row { grid-template-columns:1fr; }
      .footer-top { grid-template-columns:1fr; }
    }
    @media (max-width:720px) {
      .site-header { height:64px; padding:0 16px; }
      .hero-band { min-height:auto; padding:40px 18px 30px; }
      .hero-copy h1.hero-headline { font-size:26px; line-height:1.15; }
      .hero-credit { font-size:14px; margin-bottom:12px; }
      .hero-subtitle { font-size:15px; }
      .hero-product { min-height:380px; margin-top:20px; }
      .phone-shot { width:180px; height:360px; border-width:6px; border-radius:24px; }
      .phone-shot.back { transform:translate(-65px,15px) rotate(-6deg); }
      .phone-shot.front { transform:translate(60px,-5px) rotate(5deg); }
      .cities-band { padding:14px 18px; }
      .quick-actions { grid-template-columns:1fr; padding:40px 18px; }
      .account-action { grid-column:auto; }
      .features-band, .journey-band, .screenshots-band { padding:60px 18px; }
      .features-grid { grid-template-columns:1fr; }
      .product-section { padding:50px 18px; min-height:auto; gap:30px; }
      .delivery-section { padding:50px 18px; gap:30px; }
      .delivery-points { grid-template-columns:1fr; }
      .admin-section { padding:50px 18px; gap:30px; }
      .admin-capabilities { grid-template-columns:1fr; }
      .screens-gallery { min-height:400px; }
      .screen { width:180px; height:360px; border-width:5px; border-radius:20px; }
      .screen-1 { transform:translateX(-80%) rotate(-6deg); }
      .screen-3 { transform:translateX(-20%) rotate(6deg); }
      .safety-band { padding:50px 18px; }
      .safety-grid, .journey-grid { grid-template-columns:1fr; }
      .journey-step { border-right:0; }
      .support-band { margin:0 18px 40px; padding:28px 20px; flex-direction:column; text-align:center; }
      .screenshot-phones { justify-content:flex-start; }
      .screenshot-phones img { width:130px; height:260px; }
      .footer-columns { grid-template-columns:1fr 1fr; }
      .footer-bottom { flex-wrap:wrap; }
      .copyright { margin-left:0; width:100%; }
    }
  `}</style>;
}
