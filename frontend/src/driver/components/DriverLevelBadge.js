import React from "react";

const TIER_CONFIG = {
  bronze: {
    name: "Bronze Driver",
    color: "var(--level-bronze, #CD7F32)",
    softBg: "var(--level-bronze-soft, #fff3e8)",
    code: "B",
  },
  silver: {
    name: "Silver Driver",
    color: "var(--level-silver, #6b7280)",
    softBg: "var(--level-silver-soft, #f1f5f9)",
    code: "S",
  },
  gold: {
    name: "Gold Driver",
    color: "var(--level-gold, #b7791f)",
    softBg: "var(--level-gold-soft, #fff8db)",
    code: "G",
  },
  platinum: {
    name: "Platinum Driver",
    color: "var(--level-platinum, #2563eb)",
    softBg: "var(--level-platinum-soft, #eaf1ff)",
    code: "P",
  },
};

/**
 * DriverLevelBadge - Shows driver tier, points progress, and progress bar.
 *
 * Props:
 * - level: string ('bronze'|'silver'|'gold'|'platinum')
 * - points: number - current points
 * - nextLevelPoints: number - points required for next level
 */
export default function DriverLevelBadge({
  level = "bronze",
  points = 0,
  nextLevelPoints = 2000,
}) {
  const tier = TIER_CONFIG[level] || TIER_CONFIG.bronze;
  const progress = nextLevelPoints > 0
    ? Math.min(100, Math.round((points / nextLevelPoints) * 100))
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={{ ...styles.levelMark, background: tier.softBg, color: tier.color }}>
          {tier.code}
        </span>
        <div style={styles.info}>
          <strong style={{ ...styles.levelName, color: tier.color }}>
            {tier.name}
          </strong>
          <span style={styles.points}>
            {points.toLocaleString()} / {nextLevelPoints.toLocaleString()} points
          </span>
        </div>
      </div>
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${progress}%`,
            background: tier.color,
          }}
        />
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: "14px 16px",
    borderRadius: 16,
    background: "#ffffff",
    border: "1px solid #e5e2e5",
    boxShadow: "0 8px 24px rgba(15,23,42,0.06)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  levelMark: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    fontSize: 14,
    fontWeight: 950,
  },
  info: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  levelName: {
    fontSize: 14,
    fontWeight: 900,
  },
  points: {
    fontSize: 12,
    color: "#706972",
    marginTop: 2,
    fontWeight: 700,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    background: "#ede9ed",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 300ms ease-out",
  },
};
