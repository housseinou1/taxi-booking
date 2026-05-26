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
    return withInstall(
      <div>
        <TopBar
          title={`${MARKET.brandName} Rider Dashboard`}
          goHome={goHome}
          logout={logout}
        />

        <RiderDashboard goBack={() => (window.location.href = "/rider")} />
      </div>
    );
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
              Add Card, Bank Account, Bankily, Masrvi, Seddad, or Cash before
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

  return withInstall(
    <div style={pageStyle}>
      <div style={homeShellStyle}>
        <section style={landingHeroStyle}>
          <div style={landingCopyStyle}>
            <span style={brandPillStyle}>{MARKET.country} ride platform</span>
            <h1 style={titleStyle}>{MARKET.brandName}</h1>
            <p style={subtitleStyle}>
              Book rides, manage drivers, collect payments, and operate across
              Nouakchott, Nouadhibou, Kaedi, Selibaby, and Rosso.
            </p>

            <div style={ctaRowStyle}>
              <button
                onClick={() => (window.location.href = "/rider-dashboard")}
                style={primaryButtonStyle}
              >
                Open rider app
              </button>

              <button
                onClick={() => (window.location.href = "/driver")}
                style={secondaryButtonStyle}
              >
                Open driver app
              </button>
            </div>
          </div>

          <div style={dispatchPanelStyle}>
            <div style={dispatchHeaderStyle}>
              <div>
                <span style={panelKickerStyle}>Live operations</span>
                <h2 style={panelTitleStyle}>Platform control</h2>
              </div>
              <span style={onlineBadgeStyle}>MRU</span>
            </div>

            <div style={platformGridStyle}>
              <PlatformTile title="Riders" text="Request, track, pay, tip, and rate trips." path="/rider-dashboard" />
              <PlatformTile title="Drivers" text="Go online, accept trips, navigate, and earn." path="/driver" />
              <PlatformTile title="Payments" text="Cash, Bankily, Masrvi, card, and receipts." path="/rider-payments" />
              <PlatformTile title="Admin" text="Approve drivers and monitor the marketplace." path="/admin" />
            </div>

            <EmergencyPanel />
          </div>
        </section>

        <section style={cityStripStyle}>
          {MARKET.cities.map((city) => (
            <div key={city.label} style={cityPillStyle}>
              {city.label}
            </div>
          ))}
        </section>

        <div style={authRowStyle}>
          <button
            onClick={() => (window.location.href = "/login")}
            style={lightButtonStyle}
          >
            Login
          </button>

          <button
            onClick={() => (window.location.href = "/register")}
            style={lightButtonStyle}
          >
            Register
          </button>
        </div>
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

function TopBar({ title, goHome, logout }) {
  const [showSafety, setShowSafety] = useState(false);

  return (
    <div style={topBarStyle}>
      <div>
        <h2 style={topTitleStyle}>{title}</h2>
        <span style={topSubtitleStyle}>Mauritania mobility platform</span>
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

        <button onClick={logout} style={logoutButtonStyle}>
          Logout
        </button>
      </div>
    </div>
  );
}

const emptyPageStyle = {
  padding: "30px",
};

const pageStyle = {
  minHeight: "100vh",
  background: "#eef2f6",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  fontFamily: "Arial, sans-serif",
  padding: "24px",
};

const homeShellStyle = {
  maxWidth: "1160px",
  width: "100%",
};

const landingHeroStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: "18px",
  alignItems: "stretch",
};

const landingCopyStyle = {
  background: "linear-gradient(135deg, #111827 0%, #1f2937 56%, #064e3b 100%)",
  color: "white",
  padding: "34px",
  borderRadius: "8px",
  minHeight: "430px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const brandPillStyle = {
  width: "fit-content",
  background: "rgba(167, 243, 208, 0.14)",
  color: "#a7f3d0",
  border: "1px solid rgba(167, 243, 208, 0.26)",
  borderRadius: "999px",
  padding: "9px 12px",
  fontWeight: 900,
  fontSize: "0.82rem",
  marginBottom: "18px",
};

const titleStyle = {
  fontSize: "3rem",
  margin: "0 0 14px",
  color: "white",
  letterSpacing: 0,
};

const subtitleStyle = {
  fontSize: "1.08rem",
  lineHeight: 1.55,
  color: "#d1d5db",
  margin: "0 0 28px",
  maxWidth: "620px",
};

const ctaRowStyle = {
  display: "flex",
  gap: "12px",
  flexWrap: "wrap",
};

const primaryButtonStyle = {
  background: "#12b76a",
  color: "white",
  border: "none",
  padding: "15px 18px",
  borderRadius: "8px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  background: "rgba(255, 255, 255, 0.12)",
  color: "white",
  border: "1px solid rgba(255, 255, 255, 0.24)",
  padding: "15px 18px",
  borderRadius: "8px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
};

const lightButtonStyle = {
  background: "#ffffff",
  color: "#111827",
  border: "1px solid #d1d5db",
  padding: "12px 16px",
  borderRadius: "8px",
  fontWeight: 900,
  fontSize: "15px",
  cursor: "pointer",
};

const dispatchPanelStyle = {
  background: "white",
  border: "1px solid #e4e7ec",
  borderRadius: "8px",
  padding: "24px",
  boxShadow: "0 18px 42px rgba(15, 23, 42, 0.08)",
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
  gap: "12px",
};

const platformTileStyle = {
  textAlign: "left",
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  borderRadius: "8px",
  padding: "16px",
  cursor: "pointer",
  display: "grid",
  gap: "6px",
  color: "#111827",
};

const emergencyPanelStyle = {
  marginTop: "16px",
  border: "1px solid #fecaca",
  background: "#fff5f5",
  color: "#7f1d1d",
  borderRadius: "8px",
  padding: "14px",
  display: "grid",
  gap: "12px",
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
  borderRadius: "8px",
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
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: "999px",
  padding: "10px 14px",
  color: "#334155",
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

const topBarStyle = {
  background: "#111827",
  color: "white",
  padding: "12px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.16)",
};

const topTitleStyle = {
  margin: 0,
  fontSize: "18px",
  color: "white",
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
  color: "white",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  padding: "10px 12px",
  borderRadius: "8px",
  fontWeight: 900,
  cursor: "pointer",
};

const safetyDropdownStyle = {
  position: "absolute",
  top: "48px",
  right: 0,
  zIndex: 50,
  width: "260px",
  background: "white",
  border: "1px solid #fecaca",
  borderRadius: "12px",
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
  gap: "12px",
  minHeight: "44px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#fff5f5",
  color: "#991b1b",
  fontWeight: 900,
  textDecoration: "none",
  marginTop: "8px",
};

const topButtonStyle = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#f9fafb",
  border: "1px solid rgba(255, 255, 255, 0.14)",
  padding: "10px 14px",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
};

const logoutButtonStyle = {
  background: "rgba(248, 113, 113, 0.16)",
  color: "#fecaca",
  border: "1px solid rgba(254, 202, 202, 0.24)",
  padding: "10px 14px",
  borderRadius: "8px",
  fontWeight: "bold",
  cursor: "pointer",
};

const setupPageStyle = {
  minHeight: "100vh",
  background: "#f9fafb",
  padding: "30px",
  fontFamily: "Arial, sans-serif",
};

const setupCardStyle = {
  maxWidth: "900px",
  margin: "0 auto",
  background: "white",
  padding: "30px",
  borderRadius: "8px",
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
  background: "#111827",
  color: "white",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "16px",
  cursor: "pointer",
};

export default App;
