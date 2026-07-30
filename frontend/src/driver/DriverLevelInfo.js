import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { useDriverContext } from "./context/DriverContext";
import "./DriverLevelInfo.css";
import LevelBadge, {
  LevelProgressBar,
  DemotionWarning,
  calculateLevelProgress,
  getLevelConfig,
  LEVEL_CONFIG,
} from "./components/LevelBadge";

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

// ─── Level Thresholds ───────────────────────────────────────────────────────
const LEVEL_THRESHOLDS = {
  bronze: { rides: 0, rating: 0, acceptance: 0, completion: 0 },
  silver: { rides: 50, rating: 4.5, acceptance: 70, completion: 85 },
  gold: { rides: 200, rating: 4.7, acceptance: 80, completion: 90 },
  platinum: { rides: 350, rating: 4.8, acceptance: 85, completion: 93 },
  elite: { rides: 500, rating: 4.9, acceptance: 90, completion: 95 },
};

// ─── Level Benefits ─────────────────────────────────────────────────────────
const LEVEL_BENEFITS = {
  bronze: [
    "Access to standard ride requests",
    "Basic support access",
    "Standard earnings rate",
  ],
  silver: [
    "Priority ride matching over Bronze",
    "Access to bonus ride challenges",
    "Weekly performance insights",
  ],
  gold: [
    "Higher priority ride matching",
    "1.1x bonus multiplier on peak hours",
    "Monthly performance reports",
    "Access to premium zones",
  ],
  platinum: [
    "Enhanced ride matching priority",
    "1.25x bonus multiplier",
    "Priority support access",
    "Exclusive incentive programs",
    "Premium zone access",
  ],
  elite: [
    "Highest priority ride matching",
    "1.5x bonus multiplier",
    "Premium support access (24/7)",
    "Exclusive reward eligibility",
    "VIP rider matching",
    "Elite driver badge visibility to riders",
  ],
};

const LEVELS_ORDER = ["bronze", "silver", "gold", "platinum", "elite"];

/**
 * DriverLevelInfo - Dedicated screen showing level system details.
 *
 * Displays:
 * - Current level badge with progress bar toward next level
 * - Benefits for each level
 * - Requirements (thresholds) for each level
 * - Demotion warning when metrics drop below threshold
 *
 * Requirements: 6.2, 6.3, 6.5, 6.6, 6.7
 */
export default function DriverLevelInfo() {
  const token = localStorage.getItem("access");
  const { state } = useDriverContext();

  const [levelData, setLevelData] = useState(null);
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  const fetchLevelData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const [levelRes, reqRes] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/level/`, authHeaders),
        axios.get(`${API_URL}/drivers/me/level/requirements/`, authHeaders),
      ]);

      setLevelData(levelRes.data);
      setRequirements(reqRes.data);
    } catch (err) {
      setError("Failed to load level information. Please try again.");
      console.error("Level info fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

  useEffect(() => {
    fetchLevelData();
  }, [fetchLevelData]);

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <span style={loadingSpinnerStyle}>⏳</span>
          <p style={loadingTextStyle}>Loading level info...</p>
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
          <button style={retryButtonStyle} onClick={fetchLevelData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const currentLevel = levelData?.level || state.driverLevel?.level || "bronze";
  const progress = levelData?.progress ?? state.driverLevel?.progress ?? calculateLevelProgress(
    {
      totalRides: levelData?.total_rides_completed || 0,
      averageRating: levelData?.average_rating || 0,
      acceptanceRate: levelData?.acceptance_rate || 0,
      completionRate: levelData?.completion_rate || 0,
    },
    currentLevel
  );

  // Demotion warning data
  const belowMetrics = levelData?.below_metrics || [];
  const daysBelow = levelData?.days_below_threshold || 0;
  const demotionWarningSent = levelData?.demotion_warning_sent || false;

  const currentLevelIndex = LEVELS_ORDER.indexOf(currentLevel.toLowerCase());
  const nextLevel = currentLevelIndex < LEVELS_ORDER.length - 1
    ? LEVELS_ORDER[currentLevelIndex + 1]
    : null;

  return (
    <div style={containerStyle}>
      {/* Mauritania accent bar */}
      <div style={mauritaniaAccentBarStyle} aria-hidden="true" />

      {/* Page Header */}
      <div style={headerStyle}>
        <h1 style={pageTitleStyle}>Driver Level</h1>
        <p style={pageSubtitleStyle}>
          Earn rewards and unlock benefits by maintaining great performance
        </p>
      </div>

      {/* Demotion Warning */}
      {(belowMetrics.length > 0 || demotionWarningSent) && (
        <DemotionWarning
          belowMetrics={belowMetrics}
          daysBelow={daysBelow}
        />
      )}

      {/* Current Level Card */}
      <div style={currentLevelCardStyle}>
        <div style={currentLevelHeaderStyle}>
          <span style={currentLevelLabelStyle}>Your Current Level</span>
          <LevelBadge level={currentLevel} size="large" showIcon />
        </div>

        {/* Progress Bar */}
        <div style={progressSectionStyle}>
          <LevelProgressBar
            progress={progress}
            level={currentLevel}
            showLabel
          />
          {nextLevel && (
            <p style={nextLevelHintStyle}>
              Next: {getLevelConfig(nextLevel).icon} {getLevelConfig(nextLevel).label}
            </p>
          )}
        </div>

        {/* Current Metrics */}
        {levelData && (
          <div className="dli-metrics-grid" style={metricsGridStyle}>
            <MetricItem
              label="Rides"
              value={levelData.total_rides_completed ?? 0}
              target={nextLevel ? LEVEL_THRESHOLDS[nextLevel]?.rides : null}
            />
            <MetricItem
              label="Rating"
              value={Number(levelData.average_rating || 0).toFixed(1)}
              target={nextLevel ? LEVEL_THRESHOLDS[nextLevel]?.rating : null}
            />
            <MetricItem
              label="Acceptance"
              value={`${Number(levelData.acceptance_rate || 0).toFixed(0)}%`}
              target={nextLevel ? `${LEVEL_THRESHOLDS[nextLevel]?.acceptance}%` : null}
            />
            <MetricItem
              label="Completion"
              value={`${Number(levelData.completion_rate || 0).toFixed(0)}%`}
              target={nextLevel ? `${LEVEL_THRESHOLDS[nextLevel]?.completion}%` : null}
            />
          </div>
        )}
      </div>

      {/* All Levels - Benefits & Requirements */}
      <div style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Levels & Benefits</h2>
        {LEVELS_ORDER.map((level) => (
          <LevelCard
            key={level}
            level={level}
            isCurrent={level === currentLevel.toLowerCase()}
            isUnlocked={LEVELS_ORDER.indexOf(level) <= currentLevelIndex}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function MetricItem({ label, value, target }) {
  return (
    <dl style={metricItemStyle} className="dli-metric">
      <dd style={metricValueStyle} className="dli-metric-value">{value}</dd>
      <dt style={metricLabelStyle} className="dli-metric-label">{label}</dt>
      {target !== null && target !== undefined && (
        <dd style={metricTargetStyle} className="dli-metric-target">Need: {target}</dd>
      )}
    </dl>
  );
}

function LevelCard({ level, isCurrent, isUnlocked }) {
  const config = getLevelConfig(level);
  const thresholds = LEVEL_THRESHOLDS[level];
  const benefits = LEVEL_BENEFITS[level] || [];

  return (
    <div
      style={{
        ...levelCardStyle,
        borderColor: isCurrent ? config.color : COLORS.cardBorder,
        opacity: isUnlocked ? 1 : 0.7,
      }}
    >
      {/* Level Header */}
      <div style={levelCardHeaderStyle}>
        <div style={levelCardTitleRowStyle}>
          <LevelBadge level={level} size="medium" showIcon />
          {isCurrent && (
            <span style={currentTagStyle}>Current</span>
          )}
          {!isUnlocked && (
            <span style={lockedTagStyle}>🔒 Locked</span>
          )}
        </div>
      </div>

      {/* Requirements */}
      {level !== "bronze" && (
        <div style={requirementsSectionStyle}>
          <span style={requirementsLabelStyle}>Requirements</span>
          <div className="dli-requirements-grid" style={requirementsGridStyle}>
            <RequirementItem label="Rides" value={`${thresholds.rides}+`} />
            <RequirementItem label="Rating" value={`${thresholds.rating}+`} />
            <RequirementItem label="Acceptance" value={`${thresholds.acceptance}%+`} />
            <RequirementItem label="Completion" value={`${thresholds.completion}%+`} />
          </div>
        </div>
      )}

      {/* Benefits */}
      <div style={benefitsSectionStyle}>
        <span style={benefitsLabelStyle}>Benefits</span>
        <ul style={benefitsListStyle}>
          {benefits.map((benefit, idx) => (
            <li key={idx} style={benefitItemStyle}>
              <span style={benefitBulletStyle}>✓</span>
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RequirementItem({ label, value }) {
  return (
    <dl style={requirementItemStyle} className="dli-metric">
      <dd style={requirementValueStyle} className="dli-metric-value">{value}</dd>
      <dt style={requirementItemLabelStyle} className="dli-metric-label">{label}</dt>
    </dl>
  );
}


// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "24px 16px 80px",
  overflowY: "auto",
  fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  borderRadius: "999px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

// ─── Header ─────────────────────────────────────────────────────────────────

const headerStyle = {
  marginBottom: "24px",
  paddingTop: "12px",
};

const pageTitleStyle = {
  color: COLORS.white,
  fontSize: "26px",
  fontWeight: 800,
  margin: "0 0 6px",
};

const pageSubtitleStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
  fontWeight: 500,
  margin: 0,
  lineHeight: 1.4,
};

// ─── Current Level Card ─────────────────────────────────────────────────────

const currentLevelCardStyle = {
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.goldAccent}`,
  borderRadius: "20px",
  padding: "20px",
  marginBottom: "24px",
  backdropFilter: "blur(8px)",
};

const currentLevelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "18px",
};

const currentLevelLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  fontWeight: 700,
};

const progressSectionStyle = {
  marginBottom: "18px",
};

const nextLevelHintStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
  marginTop: "8px",
  textAlign: "right",
};

// ─── Metrics Grid ───────────────────────────────────────────────────────────

const metricsGridStyle = {
  paddingTop: "14px",
  borderTop: `1px solid ${COLORS.cardBorder}`,
};

const metricItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2px",
};

const metricValueStyle = {
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: 900,
};

const metricLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "10px",
  fontWeight: 600,
  textAlign: "center",
};

const metricTargetStyle = {
  color: COLORS.goldAccent,
  fontSize: "9px",
  fontWeight: 600,
};

// ─── Section ────────────────────────────────────────────────────────────────

const sectionStyle = {
  marginBottom: "20px",
};

const sectionTitleStyle = {
  color: COLORS.white,
  fontSize: "19px",
  fontWeight: 800,
  marginBottom: "14px",
};

// ─── Level Card ─────────────────────────────────────────────────────────────

const levelCardStyle = {
  backgroundColor: COLORS.cardBg,
  border: "1px solid",
  borderRadius: "16px",
  padding: "18px",
  marginBottom: "12px",
  backdropFilter: "blur(8px)",
  transition: "border-color 0.3s ease",
};

const levelCardHeaderStyle = {
  marginBottom: "14px",
};

const levelCardTitleRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
};

const currentTagStyle = {
  padding: "2px 8px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 800,
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
};

const lockedTagStyle = {
  fontSize: "11px",
  color: COLORS.lightGray,
  fontWeight: 600,
};

// ─── Requirements ───────────────────────────────────────────────────────────

const requirementsSectionStyle = {
  marginBottom: "14px",
};

const requirementsLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  fontWeight: 700,
  display: "block",
  marginBottom: "8px",
};

const requirementsGridStyle = {
  gap: "8px",
};

const requirementItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2px",
  padding: "8px 4px",
  borderRadius: "10px",
  backgroundColor: "rgba(255, 255, 255, 0.04)",
};

const requirementValueStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: 800,
};

const requirementItemLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "10px",
  fontWeight: 600,
};

// ─── Benefits ───────────────────────────────────────────────────────────────

const benefitsSectionStyle = {};

const benefitsLabelStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  fontWeight: 700,
  display: "block",
  marginBottom: "8px",
};

const benefitsListStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
};

const benefitItemStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "8px",
  color: "rgba(255, 255, 255, 0.85)",
  fontSize: "12px",
  fontWeight: 600,
  lineHeight: 1.5,
  marginBottom: "6px",
};

const benefitBulletStyle = {
  color: COLORS.primaryGreen,
  fontWeight: 900,
  flexShrink: 0,
};
