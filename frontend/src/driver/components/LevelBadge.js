import React from "react";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
};

// ─── Level Configuration ────────────────────────────────────────────────────
export const LEVEL_CONFIG = {
  bronze: {
    label: "Bronze",
    color: "#CD7F32",
    textColor: COLORS.white,
    icon: "🥉",
  },
  silver: {
    label: "Silver",
    color: "#C0C0C0",
    textColor: COLORS.darkNavy,
    icon: "🥈",
  },
  gold: {
    label: "Gold",
    color: "#D4AF37",
    textColor: COLORS.darkNavy,
    icon: "🥇",
  },
  platinum: {
    label: "Platinum",
    color: "#E5E4E2",
    textColor: COLORS.darkNavy,
    icon: "💎",
  },
  elite: {
    label: "Elite",
    color: "#00A651",
    textColor: COLORS.white,
    icon: "👑",
  },
};

/**
 * Returns the configuration for a given level.
 * Falls back to bronze if level is unknown.
 *
 * @param {string} level - The driver level (bronze, silver, gold, platinum, elite)
 * @returns {{ label: string, color: string, textColor: string, icon: string }}
 */
export function getLevelConfig(level) {
  const normalized = (level || "bronze").toLowerCase();
  return LEVEL_CONFIG[normalized] || LEVEL_CONFIG.bronze;
}

/**
 * Calculates the progress percentage toward the next level.
 * Returns 100 for Elite level drivers.
 * Progress is the minimum percentage across all four metrics.
 *
 * @param {Object} metrics - Driver's current metrics
 * @param {number} metrics.totalRides - Total completed rides
 * @param {number} metrics.averageRating - Average rating (1.0-5.0)
 * @param {number} metrics.acceptanceRate - Acceptance rate (0-100)
 * @param {number} metrics.completionRate - Completion rate (0-100)
 * @param {string} currentLevel - Current driver level
 * @returns {number} Progress percentage (0-100)
 */
export function calculateLevelProgress(metrics, currentLevel) {
  const normalized = (currentLevel || "bronze").toLowerCase();

  // Elite is always 100%
  if (normalized === "elite") return 100;

  const THRESHOLDS = {
    bronze: { rides: 50, rating: 4.5, acceptance: 70, completion: 85 },
    silver: { rides: 200, rating: 4.7, acceptance: 80, completion: 90 },
    gold: { rides: 350, rating: 4.8, acceptance: 85, completion: 93 },
    platinum: { rides: 500, rating: 4.9, acceptance: 90, completion: 95 },
  };

  const nextThreshold = THRESHOLDS[normalized];
  if (!nextThreshold || !metrics) return 0;

  const ridesProgress = Math.min(
    100,
    ((metrics.totalRides || 0) / nextThreshold.rides) * 100
  );
  const ratingProgress = Math.min(
    100,
    ((metrics.averageRating || 0) / nextThreshold.rating) * 100
  );
  const acceptanceProgress = Math.min(
    100,
    ((metrics.acceptanceRate || 0) / nextThreshold.acceptance) * 100
  );
  const completionProgress = Math.min(
    100,
    ((metrics.completionRate || 0) / nextThreshold.completion) * 100
  );

  // Overall progress is the minimum of all metrics (all must be met)
  const overallProgress = Math.min(
    ridesProgress,
    ratingProgress,
    acceptanceProgress,
    completionProgress
  );

  return Math.max(0, Math.min(100, Math.round(overallProgress)));
}

/**
 * LevelBadge - Visual badge displaying the driver's current level.
 *
 * Displays the level name with level-specific colors:
 * - Bronze: #CD7F32
 * - Silver: #C0C0C0
 * - Gold: #D4AF37
 * - Platinum: #E5E4E2
 * - Elite: #00A651
 *
 * Requirements: 6.2
 *
 * @param {Object} props
 * @param {string} props.level - Driver level (bronze, silver, gold, platinum, elite)
 * @param {"small"|"medium"|"large"} [props.size="small"] - Badge size variant
 * @param {boolean} [props.showIcon=false] - Whether to show the level icon
 * @param {Object} [props.style] - Additional inline styles
 */
export default function LevelBadge({ level, size = "small", showIcon = false, style }) {
  const config = getLevelConfig(level);

  const sizeStyles = {
    small: { padding: "2px 8px", fontSize: "10px", borderRadius: "999px" },
    medium: { padding: "4px 12px", fontSize: "12px", borderRadius: "999px" },
    large: { padding: "6px 16px", fontSize: "14px", borderRadius: "12px" },
  };

  const badgeStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontWeight: 900,
    textTransform: "uppercase",
    backgroundColor: config.color,
    color: config.textColor,
    transition: "transform 0.2s ease",
    ...sizeStyles[size],
    ...style,
  };

  return (
    <span
      style={badgeStyle}
      aria-label={`Driver level: ${config.label}`}
      role="status"
    >
      {showIcon && <span aria-hidden="true">{config.icon}</span>}
      {config.label}
    </span>
  );
}

/**
 * LevelProgressBar - Progress bar showing advancement toward next level.
 * Shows 100% for Elite level drivers.
 *
 * Requirements: 6.3
 *
 * @param {Object} props
 * @param {number} props.progress - Progress percentage (0-100)
 * @param {string} props.level - Current driver level
 * @param {boolean} [props.showLabel=true] - Whether to show the percentage label
 */
export function LevelProgressBar({ progress, level, showLabel = true }) {
  const config = getLevelConfig(level);
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div style={progressContainerStyle}>
      {showLabel && (
        <div style={progressLabelRowStyle}>
          <span style={progressLabelStyle}>
            {level?.toLowerCase() === "elite"
              ? "Max Level Reached"
              : "Progress to next level"}
          </span>
          <span style={progressPercentStyle}>{clampedProgress}%</span>
        </div>
      )}
      <div
        style={progressTrackStyle}
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level progress: ${clampedProgress}%`}
      >
        <div
          style={{
            ...progressFillStyle,
            width: `${clampedProgress}%`,
            backgroundColor: config.color,
          }}
        />
      </div>
    </div>
  );
}

/**
 * DemotionWarning - Notification shown when driver's metrics drop below threshold.
 *
 * Requirements: 6.6
 *
 * @param {Object} props
 * @param {string[]} props.belowMetrics - List of metrics that are below threshold
 * @param {number} [props.daysBelow] - Number of days metrics have been below threshold
 * @param {Function} [props.onDismiss] - Callback when warning is dismissed
 */
export function DemotionWarning({ belowMetrics, daysBelow, onDismiss }) {
  if (!belowMetrics || belowMetrics.length === 0) return null;

  const isUrgent = daysBelow >= 7;

  return (
    <div
      style={{
        ...demotionContainerStyle,
        borderColor: isUrgent ? "#EF4444" : "#F59E0B",
        backgroundColor: isUrgent
          ? "rgba(239, 68, 68, 0.1)"
          : "rgba(245, 158, 11, 0.1)",
      }}
      role="alert"
      aria-live="assertive"
    >
      <div style={demotionHeaderStyle}>
        <span style={demotionIconStyle}>{isUrgent ? "⚠️" : "📉"}</span>
        <span
          style={{
            ...demotionTitleStyle,
            color: isUrgent ? "#EF4444" : "#F59E0B",
          }}
        >
          {isUrgent ? "Demotion Warning" : "Performance Alert"}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={demotionDismissStyle}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        )}
      </div>
      <p style={demotionTextStyle}>
        {isUrgent
          ? `Your metrics have been below threshold for ${daysBelow} days. Maintain your performance to avoid level demotion.`
          : "Some of your metrics are below the threshold for your current level."}
      </p>
      <div style={demotionMetricsStyle}>
        {belowMetrics.map((metric) => (
          <span key={metric} style={demotionMetricTagStyle}>
            {metric}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const progressContainerStyle = {
  width: "100%",
};

const progressLabelRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "6px",
};

const progressLabelStyle = {
  fontSize: "12px",
  fontWeight: 700,
  color: "rgba(255, 255, 255, 0.7)",
};

const progressPercentStyle = {
  fontSize: "12px",
  fontWeight: 900,
  color: COLORS.white,
};

const progressTrackStyle = {
  width: "100%",
  height: "8px",
  borderRadius: "4px",
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  overflow: "hidden",
};

const progressFillStyle = {
  height: "100%",
  borderRadius: "4px",
  transition: "width 0.4s ease",
};

const demotionContainerStyle = {
  padding: "14px 16px",
  borderRadius: "14px",
  border: "1px solid",
  marginBottom: "12px",
};

const demotionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "8px",
};

const demotionIconStyle = {
  fontSize: "16px",
};

const demotionTitleStyle = {
  fontSize: "13px",
  fontWeight: 900,
  flex: 1,
};

const demotionDismissStyle = {
  background: "none",
  border: "none",
  color: "rgba(255, 255, 255, 0.5)",
  fontSize: "14px",
  cursor: "pointer",
  padding: "4px",
};

const demotionTextStyle = {
  fontSize: "12px",
  color: "rgba(255, 255, 255, 0.7)",
  lineHeight: 1.4,
  margin: "0 0 10px",
};

const demotionMetricsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

const demotionMetricTagStyle = {
  padding: "3px 10px",
  borderRadius: "999px",
  fontSize: "11px",
  fontWeight: 700,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  color: "rgba(255, 255, 255, 0.8)",
  textTransform: "capitalize",
};
