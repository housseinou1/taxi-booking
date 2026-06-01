import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";
import { useDriverContext } from "./context/DriverContext";
import LevelBadge from "./components/LevelBadge";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
};

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriverProfile() {
  const token = localStorage.getItem("access");
  const { state } = useDriverContext();

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const fetchProfileData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const [profileRes, statsRes, earningsRes] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/profile/`, authHeaders),
        axios.get(`${API_URL}/drivers/me/stats/`, authHeaders),
        axios.get(`${API_URL}/drivers/me/earnings/`, authHeaders),
      ]);

      setProfile(profileRes.data);
      setStats(statsRes.data);
      setEarnings(earningsRes.data);
    } catch (err) {
      setError("Failed to load profile data. Please try again.");
      console.error("Profile fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <span style={loadingSpinnerStyle}>⏳</span>
          <p style={loadingTextStyle}>Loading profile...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorCardStyle}>
          <p style={errorTextStyle}>{error}</p>
          <button style={retryButtonStyle} onClick={fetchProfileData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const driverLevel = profile?.driver_level || profile?.driver_category || "bronze";
  const isOnline = profile?.is_available ?? state.isOnline;
  const fullName = profile?.full_name || profile?.first_name || "Driver";
  const photo = profile?.profile_picture || profile?.driver_photo || null;

  // Vehicle details
  const vehicle = {
    make: profile?.vehicle_make || profile?.car_make || "—",
    model: profile?.vehicle_model || profile?.car_model || "—",
    color: profile?.vehicle_color || profile?.car_color || "—",
    plateNumber: profile?.plate_number || profile?.car_plate || "—",
  };

  // Stats
  const totalRides = stats?.total_rides ?? stats?.total_rides_completed ?? 0;
  const averageRating = stats?.average_rating ?? profile?.average_rating ?? 0;
  const yearsDriving = stats?.years_driving ?? 0;
  const acceptanceRate = stats?.acceptance_rate ?? 0;
  const completionRate = stats?.completion_rate ?? 0;
  const cancellationRate = stats?.cancellation_rate ?? 0;

  // Earnings
  const lifetimeEarnings = earnings?.lifetime ?? earnings?.total_earnings ?? 0;
  const monthlyEarnings = earnings?.monthly ?? earnings?.month_earnings ?? 0;
  const weeklyEarnings = earnings?.weekly ?? earnings?.week_earnings ?? 0;

  return (
    <div style={containerStyle}>
      {/* Mauritania accent bar */}
      <div style={mauritaniaAccentBarStyle} aria-hidden="true" />

      {/* Header Section: Photo, Name, Level, Status */}
      <div style={headerSectionStyle}>
        <div style={photoContainerStyle}>
          {photo ? (
            <img
              src={photo}
              alt={fullName}
              style={profilePhotoStyle}
            />
          ) : (
            <div style={profilePhotoPlaceholderStyle}>
              {fullName[0].toUpperCase()}
            </div>
          )}
          {/* Online status indicator */}
          <span
            style={{
              ...onlineIndicatorStyle,
              backgroundColor: isOnline ? COLORS.primaryGreen : "#6B7280",
            }}
            aria-label={isOnline ? "Online" : "Offline"}
          />
        </div>

        <h1 style={nameStyle}>{fullName}</h1>
        <LevelBadge level={driverLevel} size="medium" showIcon />

        <span style={statusTextStyle}>
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {/* Vehicle Details */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>🚗 Vehicle Details</h2>
        <div style={cardStyle}>
          <div style={vehicleGridStyle}>
            <VehicleDetail label="Make" value={vehicle.make} />
            <VehicleDetail label="Model" value={vehicle.model} />
            <VehicleDetail label="Color" value={vehicle.color} />
            <VehicleDetail label="Plate Number" value={vehicle.plateNumber} />
          </div>
        </div>
      </div>

      {/* Performance Stats */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>📊 Performance Stats</h2>
        <div style={cardStyle}>
          <div style={statsGridStyle}>
            <StatItem label="Total Rides" value={totalRides} />
            <StatItem
              label="Average Rating"
              value={averageRating > 0 ? `${Number(averageRating).toFixed(1)} ⭐` : "N/A"}
            />
            <StatItem
              label="Years Driving"
              value={yearsDriving > 0 ? yearsDriving : "< 1"}
            />
            <StatItem
              label="Acceptance Rate"
              value={`${Number(acceptanceRate).toFixed(1)}%`}
            />
            <StatItem
              label="Completion Rate"
              value={`${Number(completionRate).toFixed(1)}%`}
            />
            <StatItem
              label="Cancellation Rate"
              value={`${Number(cancellationRate).toFixed(1)}%`}
            />
          </div>
        </div>
      </div>

      {/* Earnings Summary */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>💰 Earnings Summary</h2>
        <div style={cardStyle}>
          <div style={earningsGridStyle}>
            <EarningsItem label="Lifetime" amount={lifetimeEarnings} highlight />
            <EarningsItem label="This Month" amount={monthlyEarnings} />
            <EarningsItem label="This Week" amount={weeklyEarnings} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function VehicleDetail({ label, value }) {
  return (
    <div style={vehicleDetailStyle}>
      <span style={vehicleDetailLabelStyle}>{label}</span>
      <span style={vehicleDetailValueStyle}>{value}</span>
    </div>
  );
}

function StatItem({ label, value }) {
  return (
    <div style={statItemStyle}>
      <span style={statValueStyle}>{value}</span>
      <span style={statLabelStyle}>{label}</span>
    </div>
  );
}

function EarningsItem({ label, amount, highlight }) {
  return (
    <div style={earningsItemStyle}>
      <span style={earningsLabelStyle}>{label}</span>
      <span
        style={{
          ...earningsAmountStyle,
          color: highlight ? COLORS.goldAccent : COLORS.white,
        }}
      >
        {formatMoney(amount)}
      </span>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "24px 16px 80px",
  overflowY: "auto",
};

const mauritaniaAccentBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  background: `linear-gradient(90deg, ${COLORS.primaryGreen} 0%, ${COLORS.goldAccent} 50%, ${COLORS.primaryGreen} 100%)`,
};

// ─── Loading & Error ────────────────────────────────────────────────────────

const loadingStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
};

const loadingSpinnerStyle = {
  fontSize: "32px",
  marginBottom: "12px",
};

const loadingTextStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
};

const errorCardStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  gap: "16px",
};

const errorTextStyle = {
  color: "#EF4444",
  fontSize: "14px",
  textAlign: "center",
};

const retryButtonStyle = {
  padding: "10px 24px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

// ─── Header ─────────────────────────────────────────────────────────────────

const headerSectionStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "8px",
  marginBottom: "28px",
  paddingTop: "12px",
};

const photoContainerStyle = {
  position: "relative",
  marginBottom: "4px",
};

const profilePhotoStyle = {
  width: "88px",
  height: "88px",
  borderRadius: "50%",
  objectFit: "cover",
  border: `3px solid ${COLORS.goldAccent}`,
};

const profilePhotoPlaceholderStyle = {
  width: "88px",
  height: "88px",
  borderRadius: "50%",
  backgroundColor: COLORS.primaryGreen,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: COLORS.white,
  fontWeight: 900,
  fontSize: "32px",
  border: `3px solid ${COLORS.goldAccent}`,
};

const onlineIndicatorStyle = {
  position: "absolute",
  bottom: "4px",
  right: "4px",
  width: "16px",
  height: "16px",
  borderRadius: "50%",
  border: `3px solid ${COLORS.darkNavy}`,
};

const nameStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
  margin: 0,
};

const statusTextStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  fontWeight: 600,
};

// ─── Sections ───────────────────────────────────────────────────────────────

const sectionStyle = {
  marginBottom: "20px",
};

const sectionTitleStyle = {
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: 800,
  marginBottom: "10px",
};

const cardStyle = {
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "16px",
  padding: "18px",
  backdropFilter: "blur(8px)",
};

// ─── Vehicle Details ────────────────────────────────────────────────────────

const vehicleGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "14px",
};

const vehicleDetailStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const vehicleDetailLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
};

const vehicleDetailValueStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
};

// ─── Stats ──────────────────────────────────────────────────────────────────

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "16px",
};

const statItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "4px",
};

const statValueStyle = {
  color: COLORS.white,
  fontSize: "18px",
  fontWeight: 900,
};

const statLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
  fontWeight: 600,
  textAlign: "center",
};

// ─── Earnings ───────────────────────────────────────────────────────────────

const earningsGridStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const earningsItemStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 0",
  borderBottom: `1px solid ${COLORS.cardBorder}`,
};

const earningsLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  fontWeight: 600,
};

const earningsAmountStyle = {
  fontSize: "16px",
  fontWeight: 900,
};
