import React, { useEffect, useState } from "react";
import axios from "axios";

import Login from "./auth/Login";
import Register from "./auth/Register";

import RiderApp from "./rider/RiderApp";
import RiderDashboard from "./rider/RiderDashboard";

import DriverApp from "./driver/DriverApp";
import DriverSignup from "./driver/DriverSignup";

import AdminDashboard from "./admin/AdminDashboard";
import InstallAppButton from "./InstallAppButton";

import AddPaymentMethod from "./payments/AddPaymentMethod";
import SavedPaymentMethods from "./payments/SavedPaymentMethods";
import RiderPayments from "./payments/PaymentPage";
import { API_URL } from "./apiConfig";
import { MARKET } from "./marketConfig";

const LOGO_SRC = "/sakho-brand-logo.jpeg";

function App() {
  const currentPath = window.location.pathname;

  const [page, setPage] = useState("home");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [refreshCards, setRefreshCards] = useState(0);
  const [selectedRide, setSelectedRide] = useState(null);

  useEffect(() => {
    if (currentPath === "/payment-setup") setPage("payment-setup");
    else if (currentPath === "/driver-vehicle-setup") setPage("driver-vehicle-setup");
    else if (currentPath === "/rider-dashboard") setPage("rider-dashboard");
    else if (currentPath === "/rider-payments") setPage("rider-payments");
    else if (currentPath === "/rider") setPage("rider");
    else if (currentPath === "/driver") setPage("driver");
    else if (currentPath === "/register") setPage("register");
    else if (currentPath === "/login") setPage("login");
    else if (currentPath === "/admin-dashboard") setPage("admin");
    else if (currentPath === "/admin") setPage("admin");
    else if (currentPath === "/terms") setPage("terms");
    else if (currentPath === "/privacy") setPage("privacy");
    else if (currentPath === "/support") setPage("support");
    else setPage("home");
  }, [currentPath]);

  useEffect(() => {
    if (page === "rider-payments") {
      fetchSelectedRide();
    }
  }, [page]);

  const fetchSelectedRide = async () => {
    try {
      const token = localStorage.getItem("access");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await axios.get(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const rides = Array.isArray(response.data) ? response.data : [];

      const selectedRideId = localStorage.getItem("selectedRideId");

      let ride = null;

      if (selectedRideId) {
        ride = rides.find((item) => Number(item.id) === Number(selectedRideId));
      }

      if (!ride && rides.length > 0) {
        ride = rides[0];
      }

      setSelectedRide(ride || null);
    } catch (error) {
      console.log("Selected ride error:", error.response?.data || error);
    }
  };

  const goHome = () => {
    window.location.href = "/";
  };

  const logout = () => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
    localStorage.removeItem("user");
    localStorage.removeItem("selectedRideId");
    localStorage.removeItem("needs_payment_setup");
    localStorage.removeItem("needs_vehicle_setup");
    window.location.href = "/";
  };

  const withInstall = (content) => (
    <>
      {content}
      <InstallAppButton />
    </>
  );

  if (page === "login") return withInstall(<Login />);
  if (page === "register") return withInstall(<Register />);

  if (page === "rider-dashboard") {
    return withInstall(<RiderDashboard goBack={() => (window.location.href = "/rider")} />);
  }

  if (page === "rider-payments") {
    return withInstall(
      <div>
        <TopBar
          title={`${MARKET.brandName} Payments`}
          goHome={goHome}
          logout={logout}
        />

        {selectedRide ? (
          <RiderPayments ride={selectedRide} />
        ) : (
          <div style={emptyPageStyle}>
            <h2>No completed ride found.</h2>
            <button
              onClick={() => (window.location.href = "/rider-dashboard")}
              style={continueButtonStyle}
            >
              Back to Rider Dashboard
            </button>
          </div>
        )}
      </div>
    );
  }

  if (page === "payment-setup") {
    return withInstall(
      <div>
        <TopBar
          title={`${MARKET.brandName} Payment Setup`}
          goHome={goHome}
          logout={logout}
        />

        <div style={setupPageStyle}>
          <div style={setupCardStyle}>
            <h1 style={setupTitleStyle}>💳 Add Your Payment Method</h1>

            <p style={setupSubtitleStyle}>
              Add Card, Bank Account, Bankily, Masravi, Seddad, or Cash before
              requesting your first ride.
            </p>

            <AddPaymentMethod
              onCardSaved={() => setRefreshCards((prev) => prev + 1)}
            />

            <SavedPaymentMethods
              methods={paymentMethods}
              setMethods={setPaymentMethods}
              refreshKey={refreshCards}
            />

            <button
              onClick={() => {
                localStorage.removeItem("needs_payment_setup");
                window.location.href = "/rider";
              }}
              style={continueButtonStyle}
            >
              Continue to Rider App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "driver-vehicle-setup") {
    return withInstall(
      <div>
        <TopBar
          title={`${MARKET.brandName} Driver Vehicle Setup`}
          goHome={goHome}
          logout={logout}
        />

        <div style={setupPageStyle}>
          <div style={setupCardStyle}>
            <h1 style={setupTitleStyle}>🚗 Add Vehicle Information</h1>

            <p style={setupSubtitleStyle}>
              Add your vehicle and driver documents before going online.
            </p>

            <DriverSignup />

            <button
              onClick={() => {
                localStorage.removeItem("needs_vehicle_setup");
                window.location.href = "/driver";
              }}
              style={continueButtonStyle}
            >
              Continue to Driver App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "rider") {
    return withInstall(
      <div>
        <TopBar title={`${MARKET.brandName} Rider`} goHome={goHome} logout={logout} />
        <RiderApp />
      </div>
    );
  }

  if (page === "driver") {
    return withInstall(<DriverApp />);
  }

  if (page === "admin") {
    return withInstall(
      <div>
        <TopBar title={`${MARKET.brandName} Admin`} goHome={goHome} logout={logout} />
        <AdminDashboard />
      </div>
    );
  }

  if (["terms", "privacy", "support"].includes(page)) {
    return withInstall(
      <div>
        <TopBar title={`${MARKET.brandName} ${page}`} goHome={goHome} logout={logout} />
        <LegalPage page={page} />
      </div>
    );
  }

  return withInstall(
    <div style={pageStyle}>
      <div style={homeShellStyle}>
        <header style={navStyle}>
          <div style={topBrandStyle}>
            <BrandLogo />
            <strong style={{ color: "#f8fafc", fontSize: "1rem" }}>{MARKET.brandName}</strong>
          </div>
          <div style={authRowStyle}>
            <button onClick={() => (window.location.href = "/login")} style={lightButtonStyle}>Login</button>
            <button onClick={() => (window.location.href = "/register")} style={lightButtonStyle}>Register</button>
          </div>
        </header>
        <section style={landingHeroStyle}>
          <div style={landingCopyStyle}>
            <span style={brandPillStyle}>{MARKET.country} · Luxury mobility</span>
            <h1 style={titleStyle}>{MARKET.brandName} for the next billion trips</h1>
            <p style={subtitleStyle}>Premium rides, live trip intelligence, and five-star service for riders and drivers across every city in your network.</p>
            <div style={ctaRowStyle}>
              <button onClick={() => (window.location.href = "/rider-dashboard")} style={primaryButtonStyle}>Ride now</button>
              <button onClick={() => (window.location.href = "/driver")} style={secondaryButtonStyle}>Become a driver</button>
            </div>
            <div style={statsGridStyle}>
              <div style={statCardStyle}><strong>4.96★</strong><span>Average rider rating</span></div>
              <div style={statCardStyle}><strong>2.4m+</strong><span>Trips completed safely</span></div>
              <div style={statCardStyle}><strong>3 min</strong><span>Median pickup time</span></div>
            </div>
          </div>
          <div style={dispatchPanelStyle}>
            <div style={phoneMockStyle}>
              <div style={liveHeaderStyle}><span>Live Trip</span><strong>Driver arriving · 2 min</strong></div>
              <div style={liveMapStyle} />
              <div style={liveRowStyle}><span>Premium Black</span><strong>MRU 1450</strong></div>
              <div style={liveRowStyle}><span>Captain Ahmed</span><strong>4.9 ★</strong></div>
            </div>
            <div style={roleSelectorStyle}>
              <button onClick={() => (window.location.href = "/rider-dashboard")} style={roleCardStyle}><span style={roleLabelStyle}>For riders</span><strong style={roleTitleStyle}>Tap, track, pay instantly</strong></button>
              <button onClick={() => (window.location.href = "/driver")} style={roleCardStyle}><span style={roleLabelStyle}>For drivers</span><strong style={roleTitleStyle}>Go online, earn smarter</strong></button>
            </div>
          </div>
        </section>
        <section style={platformGridStyle}>
          <PlatformTile title="Economy" text="Best everyday value with short ETAs." path="/rider-dashboard" />
          <PlatformTile title="Premium Black" text="Executive rides with top-rated drivers." path="/rider-dashboard" />
          <PlatformTile title="XL Family" text="Extra seats, luggage room, and comfort." path="/rider-dashboard" />
          <PlatformTile title="Driver Pro" text="Real-time demand heatmaps and earning tools." path="/driver" />
        </section>
        <section style={cityStripStyle}>{MARKET.cities.map((city) => <div key={city.label} style={cityPillStyle}>{city.label}</div>)}</section>
        <EmergencyPanel />
        <FooterLinks />
      </div>
    </div>
  );
}

function PlatformTile({ title, text, path }) {
  return (
    <button onClick={() => (window.location.href = path)} style={platformTileStyle}>
      <strong>{title}</strong>
      <span>{text}</span>
    </button>
  );
}

function EmergencyPanel() {
  return (
    <div style={emergencyPanelStyle}>
      <div>
        <strong>Emergency contacts</strong>
        <span>Tap to call from a phone</span>
      </div>
      <div style={emergencyLinksStyle}>
        {MARKET.emergencyNumbers.map((item) => (
          <a key={item.number} href={`tel:${item.number}`} style={emergencyLinkStyle}>
            {item.label} {item.number}
          </a>
        ))}
      </div>
    </div>
  );
}


const roleSelectorStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "12px",
  marginTop: "24px",
};

const roleCardStyle = {
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "white",
  borderRadius: "16px",
  padding: "14px",
  textAlign: "left",
  display: "grid",
  gap: "4px",
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(2, 6, 23, 0.2)",
};

const roleLabelStyle = {
  color: "#cbd5e1",
  fontSize: "0.78rem",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontWeight: 800,
};

const roleTitleStyle = {
  fontSize: "0.98rem",
  lineHeight: 1.35,
};

function FooterLinks() {
  return (
    <div style={footerLinksStyle}>
      <button onClick={() => (window.location.href = "/terms")} style={footerLinkStyle}>
        Terms
      </button>
      <button onClick={() => (window.location.href = "/privacy")} style={footerLinkStyle}>
        Privacy
      </button>
      <button onClick={() => (window.location.href = "/support")} style={footerLinkStyle}>
        Support
      </button>
    </div>
  );
}

function LegalPage({ page }) {
  const content = {
    terms: {
      title: "Terms and Conditions",
      subtitle: "Rider terms, driver agreement, payment rules, and platform operations.",
      sections: [
        {
          title: "Account responsibility and identity",
          text:
            "Riders and drivers must provide accurate names, phone numbers, National Identification information, and payment or payout details. Users are responsible for keeping their account information current. Accounts may be blocked, suspended, or reviewed for unsafe behavior, fraud, false information, expired driver documents, non-payment, or misuse of the app.",
        },
        {
          title: "Rider terms",
          text:
            "Riders must request trips honestly, choose accurate pickup and drop-off locations, respect drivers and vehicles, pay the agreed fare, and use rating, support, and emergency tools responsibly. Riders can tip drivers after drop-off when payment is completed. Repeated cancellations, false requests, harassment, abuse, or refusal to pay may lead to account blocking.",
        },
        {
          title: "Driver agreement",
          text:
            "Drivers agree to operate safely, follow local transport laws, keep their vehicle clean and roadworthy, respect riders, and complete trips only through the app. Drivers must keep license, registration, insurance, vehicle, payout, and National ID information current. Expired required documents can automatically reject the driver profile until updated documents are submitted and reviewed.",
        },
        {
          title: "Driver conduct and safety",
          text:
            "Drivers must not misuse rider phone numbers, pickup locations, drop-off locations, documents, payment information, or trip history. Drivers must not accept trips while impaired, drive dangerously, overcharge riders, or allow another person to use their driver account. Admin may block or reintegrate drivers based on safety, document, payment, and rating review.",
        },
        {
          title: "Payments and commission",
          text:
            `The platform owner commission is ${MARKET.ownerCommissionPercent}% of the ride fare. Driver earnings, rider tips, withdrawal requests, and owner payout methods are tracked in the app. Bankily, Masravi, Seddad, cash, card, and bank account records may be used depending on the selected method. Real provider transfers depend on approved provider APIs or manual admin processing.`,
        },
        {
          title: "Ratings, blocking, and disputes",
          text:
            "Riders and drivers can rate each other after trips. Admin can use ratings, payment status, documents, and support reports to investigate disputes, block accounts, unblock accounts, or reintegrate drivers. Users should report safety, payment, or document issues as soon as possible.",
        },
        {
          title: "Emergency and support use",
          text:
            "Users should follow local laws, use emergency numbers only for real emergencies, and contact support or the admin for safety or account concerns. The app can provide emergency contact shortcuts, but it does not replace police, ambulance, fire, or official emergency services.",
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      subtitle: "Data protection rules for user, trip, document, and payment information.",
      sections: [
        {
          title: "Information collected",
          text:
            "The app stores account details, phone numbers, trip pickup and drop-off locations, driver documents, National ID information, ratings, payment method details, and payout method details.",
        },
        {
          title: "How information is used",
          text:
            "Information is used to match riders with drivers, verify identity and driver documents, process payment records, calculate commission, support withdrawals, improve safety, and help admin manage the platform.",
        },
        {
          title: "Access control",
          text:
            "Riders see assigned driver details after acceptance. Drivers see active rider trip information. Admin can review users, documents, payouts, ratings, and account status for platform operations.",
        },
        {
          title: "Data protection rules",
          text:
            "Sensitive information should be accessed only by users who need it for a real platform purpose. Admin access should be limited to trusted staff. Driver documents, National ID documents, payout details, and payment records should not be shared outside support, verification, payment, safety, or legal needs.",
        },
        {
          title: "Security requirements",
          text:
            "Before public launch, the production app should use HTTPS, private API keys, a strong Django secret key, protected database credentials, limited admin accounts, regular backups, provider webhook verification, and secure hosting. Real payment credentials must not be stored in frontend code.",
        },
        {
          title: "Retention and correction",
          text:
            "Users should be able to request correction of inaccurate account, identity, vehicle, or payout information. Trip, payment, rating, and safety records may be retained for operations, dispute handling, fraud prevention, accounting, and legal compliance.",
        },
      ],
    },
    support: {
      title: "Support and Safety",
      subtitle: "Help options for riders, drivers, and admin operations.",
      sections: [
        {
          title: "Emergency contacts",
          text:
            `Police ${MARKET.emergencyNumbers[0]?.number || ""}, Ambulance ${MARKET.emergencyNumbers[1]?.number || ""}, Fire ${MARKET.emergencyNumbers[2]?.number || ""}. Use these only for real emergencies.`,
        },
        {
          title: "Emergency process",
          text:
            "If a rider or driver is in immediate danger, they should call the correct emergency number first. After the situation is safe, they should report the trip, driver or rider name, phone number, pickup, drop-off, time, and issue to the platform admin for investigation.",
        },
        {
          title: "Rider support",
          text:
            "Riders can contact the driver after acceptance, share trip details, rate the trip, and report payment, driver behavior, wrong route, cancellation, document, or safety problems to the platform admin.",
        },
        {
          title: "Driver support",
          text:
            "Drivers can update vehicle documents, National ID, payout methods, and withdrawal requests from the driver app. If blocked or rejected, drivers should update missing information and request admin reintegration.",
        },
        {
          title: "Admin support process",
          text:
            "Admin should review pending drivers, expired documents, rider and driver ratings, owner payout information, driver withdrawals, blocked accounts, and safety reports regularly. Serious safety reports should be prioritized before normal account and payment requests.",
        },
        {
          title: "Payment and payout support",
          text:
            "For Bankily, Masravi, Seddad, cash, bank account, and withdrawal issues, admin should compare ride status, payment records, driver earnings, owner commission, payout method, and provider confirmation before approving or rejecting requests.",
        },
      ],
    },
  }[page];

  return (
    <main style={legalPageStyle}>
      <section style={legalCardStyle}>
        <span style={brandPillStyle}>{MARKET.brandName}</span>
        <h1 style={legalTitleStyle}>{content.title}</h1>
        <p style={legalSubtitleStyle}>{content.subtitle}</p>
        <div style={legalSectionGridStyle}>
          {content.sections.map((section) => (
            <article key={section.title} style={legalSectionStyle}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function TopBar({ title, goHome, logout }) {
  const [showSafety, setShowSafety] = useState(false);

  return (
    <div style={topBarStyle}>
      <div>
        <div style={topBrandStyle}>
          <BrandLogo />
          <div>
            <h2 style={topTitleStyle}>{title}</h2>
            <span style={topSubtitleStyle}>Mauritania mobility platform</span>
          </div>
        </div>
      </div>

      <div style={topButtonGroupStyle}>
        <div style={safetyMenuWrapStyle}>
          <button
            onClick={() => setShowSafety((current) => !current)}
            style={safetyButtonStyle}
          >
            Safety
          </button>

          {showSafety && (
            <div style={safetyDropdownStyle}>
              <div style={safetyHeaderStyle}>
                <strong>Emergency help</strong>
                <span>Tap a number to call</span>
              </div>

              {MARKET.emergencyNumbers.map((item) => (
                <a
                  key={item.number}
                  href={`tel:${item.number}`}
                  title={item.description}
                  style={safetyCallRowStyle}
                >
                  <span>{item.label}</span>
                  <strong>{item.number}</strong>
                </a>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => (window.location.href = "/rider-dashboard")} style={topButtonStyle}>
          Rider
        </button>

        <button onClick={() => (window.location.href = "/driver")} style={topButtonStyle}>
          Driver
        </button>

        <button onClick={() => (window.location.href = "/admin")} style={topButtonStyle}>
          Admin
        </button>

        <button onClick={goHome} style={topButtonStyle}>
          Home
        </button>

        <button onClick={() => (window.location.href = "/support")} style={topButtonStyle}>
          Support
        </button>

        <button onClick={logout} style={logoutButtonStyle}>
          Logout
        </button>
      </div>
    </div>
  );
}

function BrandLogo({ variant = "default" }) {
  const isHero = variant === "hero";

  return (
    <div style={isHero ? heroLogoWrapStyle : brandLogoWrapStyle}>
      <img
        src={LOGO_SRC}
        alt={`${MARKET.brandName} logo`}
        style={isHero ? heroLogoImageStyle : brandLogoImageStyle}
      />
    </div>
  );
}

const emptyPageStyle = {
  padding: "30px",
};

const pageStyle = {
  minHeight: "100vh",
  background: "radial-gradient(circle at 15% 10%, #1f2a44 0%, #090d19 48%, #04050b 100%)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
  padding: "20px 20px 36px",
};

const homeShellStyle = {
  maxWidth: "1240px",
  width: "100%",
};
const navStyle = {
  background: "rgba(15, 23, 42, 0.55)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: "18px",
  backdropFilter: "blur(10px)",
  padding: "10px 14px",
  marginBottom: "18px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const landingHeroStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: "24px",
  alignItems: "stretch",
};

const landingCopyStyle = {
  background: "linear-gradient(152deg, rgba(16,24,40,0.86) 0%, rgba(15,23,42,0.7) 100%)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  boxShadow: "0 30px 80px rgba(2, 6, 23, 0.45)",
  color: "white",
  padding: "44px",
  borderRadius: "28px",
  minHeight: "520px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const heroLogoWrapStyle = {
  width: "min(420px, 100%)",
  aspectRatio: "1.55 / 1",
  borderRadius: "18px",
  background: "#0c0c14",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  display: "block",
  overflow: "hidden",
  marginBottom: "18px",
  boxShadow: "0 18px 36px rgba(2, 6, 23, 0.24)",
};

const heroLogoImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const brandPillStyle = {
  width: "fit-content",
  background: "rgba(255, 255, 255, 0.08)",
  color: "#f4f4f5",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "999px",
  padding: "9px 12px",
  fontWeight: 900,
  fontSize: "0.82rem",
  marginBottom: "18px",
};

const titleStyle = {
  fontSize: "clamp(2.5rem, 5vw, 4.7rem)",
  margin: "0 0 14px",
  color: "white",
  letterSpacing: 0,
};

const subtitleStyle = {
  fontSize: "1.13rem",
  lineHeight: 1.55,
  color: "#d1d5db",
  margin: "0 0 28px",
  maxWidth: "620px",
};

const ctaRowStyle = {
  display: "flex",
  gap: "14px",
  flexWrap: "wrap",
};

const primaryButtonStyle = {
  background: "linear-gradient(135deg, #67e8f9 0%, #22d3ee 40%, #06b6d4 100%)",
  color: "#001219",
  border: "1px solid rgba(255,255,255,0.6)",
  padding: "15px 18px",
  borderRadius: "14px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
  transition: "transform .25s ease, box-shadow .25s ease",
  boxShadow: "0 10px 24px rgba(6, 182, 212, 0.35)",
};

const secondaryButtonStyle = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#f8fafc",
  border: "1px solid rgba(255, 255, 255, 0.3)",
  padding: "15px 18px",
  borderRadius: "14px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
  transition: "transform .25s ease, border-color .25s ease",
};

const lightButtonStyle = {
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,0.25)",
  padding: "12px 16px",
  borderRadius: "10px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
};

const dispatchPanelStyle = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.72) 0%, rgba(30,41,59,0.6) 100%)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: "28px",
  padding: "22px",
  boxShadow: "0 22px 70px rgba(2, 6, 23, 0.4)",
};

const dispatchHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "14px",
  marginBottom: "18px",
};

const panelKickerStyle = {
  display: "block",
  color: "#64748b",
  fontSize: "0.76rem",
  fontWeight: 900,
  textTransform: "uppercase",
  marginBottom: "4px",
};

const panelTitleStyle = {
  margin: 0,
  color: "#111827",
  fontSize: "1.35rem",
};

const onlineBadgeStyle = {
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #bbf7d0",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 900,
};

const platformGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "14px",
  marginTop: "18px",
};

const platformTileStyle = {
  textAlign: "left",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(15, 23, 42, 0.5)",
  borderRadius: "14px",
  padding: "16px",
  cursor: "pointer",
  display: "grid",
  gap: "6px",
  color: "#e2e8f0",
  transition: "transform .25s ease, box-shadow .25s ease",
  boxShadow: "0 12px 24px rgba(2,6,23,.22)",
};

const emergencyPanelStyle = {
  marginTop: "16px",
  border: "1px solid #fecaca",
  background: "#fff7f7",
  color: "#7f1d1d",
  borderRadius: "14px",
  padding: "14px",
  display: "grid",
  gap: "14px",
};

const emergencyLinksStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: "8px",
};

const emergencyLinkStyle = {
  display: "inline-flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: "40px",
  borderRadius: "14px",
  background: "#dc2626",
  color: "white",
  fontWeight: 900,
  textDecoration: "none",
};

const cityStripStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "16px",
};

const cityPillStyle = {
  background: "rgba(255,255,255,.08)",
  border: "1px solid rgba(255,255,255,.2)",
  borderRadius: "999px",
  padding: "10px 16px",
  color: "#e2e8f0",
  fontWeight: 900,
  boxShadow: "0 8px 20px rgba(15, 23, 42, 0.06)",
};

const authRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "18px",
};

const footerLinksStyle = {
  display: "flex",
  justifyContent: "center",
  gap: "10px",
  flexWrap: "wrap",
  marginTop: "22px",
};

const footerLinkStyle = {
  background: "transparent",
  color: "#cbd5e1",
  border: "none",
  fontWeight: 900,
  cursor: "pointer",
  textDecoration: "underline",
};
const statsGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginTop: "22px" };
const statCardStyle = { background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.24)", borderRadius: "14px", padding: "12px", color: "#f8fafc", display: "grid", gap: "6px", boxShadow: "0 10px 24px rgba(2,6,23,.2)" };
const phoneMockStyle = { background: "rgba(15,23,42,.65)", border: "1px solid rgba(255,255,255,.24)", borderRadius: "26px", padding: "16px", display: "grid", gap: "12px", backdropFilter: "blur(12px)" };
const liveHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", color: "#e2e8f0", fontSize: ".85rem" };
const liveMapStyle = { minHeight: "180px", borderRadius: "16px", background: "linear-gradient(130deg, rgba(56,189,248,.3), rgba(59,130,246,.14), rgba(14,116,144,.3))", border: "1px solid rgba(255,255,255,.14)" };
const liveRowStyle = { display: "flex", justifyContent: "space-between", color: "#e2e8f0", borderTop: "1px solid rgba(255,255,255,.12)", paddingTop: "8px" };

const legalPageStyle = {
  minHeight: "100vh",
  background: "#f3f6fa",
  padding: "28px",
};

const legalCardStyle = {
  maxWidth: "980px",
  margin: "0 auto",
  background: "linear-gradient(180deg, #f8fbff 0%, #eef3ff 100%)",
  border: "1px solid #e6e8ef",
  borderRadius: "28px",
  padding: "28px",
  boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
};

const legalTitleStyle = {
  margin: "14px 0 8px",
  color: "#111827",
  fontSize: "2.2rem",
};

const legalSubtitleStyle = {
  margin: "0 0 22px",
  color: "#64748b",
  lineHeight: 1.5,
};

const legalSectionGridStyle = {
  display: "grid",
  gap: "14px",
};

const legalSectionStyle = {
  background: "#f8f9ff",
  border: "1px solid #d5deef",
  borderRadius: "14px",
  padding: "18px",
  color: "#334155",
  lineHeight: 1.55,
};

const topBarStyle = {
  background: "#0c0c14",
  color: "#0b1220",
  padding: "12px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.16)",
};

const topBrandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
};

const brandLogoWrapStyle = {
  width: "62px",
  height: "46px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  background: "#0c0c14",
  border: "1px solid rgba(251, 191, 36, 0.28)",
  position: "relative",
  flex: "0 0 auto",
  overflow: "hidden",
};

const brandLogoImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const topTitleStyle = {
  margin: 0,
  fontSize: "18px",
  color: "#0b1220",
};

const topSubtitleStyle = {
  display: "block",
  marginTop: "2px",
  color: "#9ca3af",
  fontSize: "0.78rem",
  fontWeight: 800,
};

const topButtonGroupStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
};

const safetyMenuWrapStyle = {
  position: "relative",
};

const safetyButtonStyle = {
  background: "#dc2626",
  color: "#0b1220",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  padding: "10px 12px",
  borderRadius: "14px",
  fontWeight: 900,
  cursor: "pointer",
};

const safetyDropdownStyle = {
  position: "absolute",
  top: "48px",
  right: 0,
  zIndex: 50,
  width: "260px",
  background: "linear-gradient(160deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #fecaca",
  borderRadius: "14px",
  padding: "12px",
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.24)",
};

const safetyHeaderStyle = {
  display: "grid",
  gap: "3px",
  color: "#111827",
  marginBottom: "10px",
};

const safetyCallRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  minHeight: "44px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#fff7f7",
  color: "#991b1b",
  fontWeight: 900,
  textDecoration: "none",
  marginTop: "8px",
};

const topButtonStyle = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#f9fafb",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const logoutButtonStyle = {
  background: "rgba(220, 38, 38, 0.22)",
  color: "#ffe4e6",
  border: "1px solid rgba(254, 202, 202, 0.24)",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const setupPageStyle = {
  minHeight: "100vh",
  background: "#f3f4f9",
  padding: "30px",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
};

const setupCardStyle = {
  maxWidth: "900px",
  margin: "0 auto",
  background: "#ffffff",
  padding: "32px",
  borderRadius: "20px",
  border: "1px solid #e4e7ec",
  boxShadow: "0 10px 25px rgba(16,24,40,0.08)",
};

const setupTitleStyle = {
  marginTop: 0,
  color: "#111827",
};

const setupSubtitleStyle = {
  color: "#6b7280",
  marginBottom: "20px",
};

const continueButtonStyle = {
  width: "100%",
  marginTop: "25px",
  padding: "16px",
  background: "#0c0c14",
  color: "#0b1220",
  border: "1px solid #1f2937",
  borderRadius: "14px",
  fontWeight: "bold",
  fontSize: "16px",
  cursor: "pointer",
};

export default App;
