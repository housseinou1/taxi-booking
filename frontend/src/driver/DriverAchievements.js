import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { bindDriverTheme } from "./themeRefresh";

function buildStyles(COLORS) {
  return {
    containerStyle: {
      minHeight: "100vh",
      backgroundColor: COLORS.darkNavy,
      padding: "20px 16px 100px",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    headerStyle: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
      flexWrap: "wrap",
      gap: "12px",
    },
    titleStyle: {
      color: COLORS.white,
      fontSize: "22px",
      fontWeight: "800",
      margin: 0,
    },
    pointsBadgeStyle: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "8px 16px",
      borderRadius: "12px",
      background: `linear-gradient(135deg, ${COLORS.goldAccent}22, ${COLORS.goldAccent}44)`,
      border: `1px solid ${COLORS.goldAccent}66`,
    },
    headerActionsStyle: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    hallButtonStyle: {
      minHeight: "44px",
      border: `1px solid ${COLORS.goldAccent}`,
      borderRadius: "999px",
      background: COLORS.goldAccent,
      color: COLORS.onPrimary === "#FFFFFF" ? "#111827" : COLORS.onPrimary,
      padding: "0 14px",
      fontWeight: "900",
      cursor: "pointer",
    },
    pointsLabelStyle: {
      color: COLORS.goldAccent,
      fontSize: "11px",
      fontWeight: "600",
      textTransform: "uppercase",
    },
    pointsValueStyle: {
      color: COLORS.white,
      fontSize: "18px",
      fontWeight: "900",
    },
    loadingStyle: {
      color: COLORS.textMuted,
      textAlign: "center",
      padding: "60px 20px",
      fontSize: "15px",
    },
    emptyStyle: {
      textAlign: "center",
      padding: "60px 20px",
    },
    emptyIconStyle: {
      fontSize: "48px",
      display: "block",
      marginBottom: "16px",
    },
    emptyTextStyle: {
      color: COLORS.white,
      fontSize: "16px",
      fontWeight: "600",
      margin: "0 0 8px",
    },
    emptySubtextStyle: {
      color: COLORS.textMuted,
      fontSize: "14px",
      margin: 0,
    },
    gridStyle: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
      gap: "12px",
    },
    cardStyle: {
      background: COLORS.cardBg,
      borderRadius: "14px",
      padding: "20px 12px",
      textAlign: "center",
      border: `1px solid ${COLORS.cardBorder}`,
    },
    badgeIconStyle: {
      fontSize: "36px",
      display: "block",
      marginBottom: "10px",
    },
    cardTitleStyle: {
      color: COLORS.white,
      fontSize: "13px",
      fontWeight: "700",
      margin: "0 0 6px",
    },
    cardDateStyle: {
      color: COLORS.textMuted,
      fontSize: "11px",
      margin: 0,
    },
  };
}

const { bag: driverTheme, syncDriverTheme } = bindDriverTheme(buildStyles);

export default function DriverAchievements() {
  const { lyftUI } = syncDriverTheme();
  const styles = driverTheme.styles;
  const token = localStorage.getItem("access");
  const [achievements, setAchievements] = useState([]);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAchievements = useCallback(async () => {
    try {
      const [achievementsRes, rewardsRes] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/achievements/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/drivers/me/rewards/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setAchievements(
        Array.isArray(achievementsRes.data?.achievements)
          ? achievementsRes.data.achievements
          : [],
      );
      setRewardPoints(rewardsRes.data?.points_balance || 0);
    } catch (error) {
      console.log("Achievements fetch error:", error.response?.data || error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAchievements();
  }, [fetchAchievements]);

  return (
    <div
      className={lyftUI ? "driver-page--lyft" : undefined}
      style={{
        ...styles.containerStyle,
        ...(lyftUI ? { minHeight: "auto", paddingTop: 12 } : null),
      }}
    >
      {!lyftUI && (
        <header style={styles.headerStyle}>
          <h1 style={styles.titleStyle}>Achievements & Rewards</h1>
          <div style={styles.headerActionsStyle}>
            <button style={styles.hallButtonStyle} onClick={() => (window.location.href = "/driver/hall-of-fame")}>
              Hall of Fame
            </button>
            <div style={styles.pointsBadgeStyle}>
              <span style={styles.pointsLabelStyle}>Reward Points</span>
              <span style={styles.pointsValueStyle}>{rewardPoints}</span>
            </div>
          </div>
        </header>
      )}

      {lyftUI && (
        <div style={{ ...styles.headerActionsStyle, marginBottom: 16, justifyContent: "space-between" }}>
          <button style={styles.hallButtonStyle} onClick={() => (window.location.href = "/driver/hall-of-fame")}>
            Hall of Fame
          </button>
          <div style={styles.pointsBadgeStyle}>
            <span style={styles.pointsLabelStyle}>Reward Points</span>
            <span style={styles.pointsValueStyle}>{rewardPoints}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div style={styles.loadingStyle}>Loading achievements...</div>
      ) : achievements.length === 0 ? (
        <div style={styles.emptyStyle}>
          <span style={styles.emptyIconStyle}>🏆</span>
          <p style={styles.emptyTextStyle}>No achievements earned yet.</p>
          <p style={styles.emptySubtextStyle}>Complete rides and maintain high ratings to unlock achievements.</p>
        </div>
      ) : (
        <div style={styles.gridStyle}>
          {achievements.map((achievement) => (
            <div key={achievement.id} style={styles.cardStyle}>
              <span style={styles.badgeIconStyle}>{achievement.icon || "🏅"}</span>
              <h3 style={styles.cardTitleStyle}>{achievement.name}</h3>
              <p style={styles.cardDateStyle}>
                {achievement.earned_at
                  ? new Date(achievement.earned_at).toLocaleDateString()
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
