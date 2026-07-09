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
  const [dashboard, setDashboard] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAchievements = useCallback(async () => {
    try {
      const [achievementsRes, rewardsRes, dashboardRes, challengesRes] = await Promise.all([
        axios.get(`${API_URL}/drivers/me/achievements/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/drivers/me/rewards/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/drivers/me/rewards/dashboard/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_URL}/drivers/me/challenges/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setAchievements(
        Array.isArray(achievementsRes.data?.achievements)
          ? achievementsRes.data.achievements
          : [],
      );
      setRewardPoints(rewardsRes.data?.points_balance || 0);
      setDashboard(dashboardRes.data || null);
      setChallenges(
        Array.isArray(challengesRes.data?.challenges)
          ? challengesRes.data.challenges
          : [],
      );
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

      )}

      {dashboard && (
        <section style={{ marginBottom: 20, background: styles.cardStyle.background, borderRadius: 14, padding: 16, border: styles.cardStyle.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ color: styles.pointsLabelStyle.color, fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>Current Level</div>
              <div style={{ color: styles.titleStyle.color, fontSize: 22, fontWeight: 900 }}>{dashboard.current_level}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: styles.pointsLabelStyle.color, fontSize: 11 }}>Total Points</div>
              <div style={{ color: styles.pointsValueStyle.color, fontSize: 20, fontWeight: 900 }}>{dashboard.total_points}</div>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${dashboard.progress_percent || 0}%`, height: "100%", background: "linear-gradient(90deg,#00A651,#fbbf24)" }} />
          </div>
          <div style={{ color: styles.cardDateStyle.color, fontSize: 12, marginBottom: 12 }}>
            {dashboard.points_to_next_level > 0
              ? `${dashboard.points_to_next_level} points to ${dashboard.next_level || "next level"}`
              : "Maximum tier reached"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, fontSize: 12 }}>
            <div><strong>{dashboard.today_trips}</strong><br />Today trips</div>
            <div><strong>{dashboard.weekly_trips}</strong><br />Week trips</div>
            <div><strong>{dashboard.monthly_trips}</strong><br />Month trips</div>
            <div><strong>{dashboard.today_earnings}</strong><br />Today MRU</div>
            <div><strong>{dashboard.weekly_earnings}</strong><br />Week MRU</div>
            <div><strong>{dashboard.monthly_earnings}</strong><br />Month MRU</div>
          </div>
        </section>
      )}

      {challenges.length > 0 && (
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ ...styles.titleStyle, fontSize: 16, marginBottom: 10 }}>Weekly Challenges</h2>
          {challenges.map((c) => (
            <div key={c.id} style={{ ...styles.cardStyle, marginBottom: 8, textAlign: "left", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: styles.cardTitleStyle.color }}>{c.name}</strong>
                <span style={{ color: styles.cardDateStyle.color, fontSize: 11 }}>{c.status}</span>
              </div>
              <div style={{ color: styles.cardDateStyle.color, fontSize: 12, margin: "6px 0" }}>{c.description}</div>
              <div style={{ height: 6, borderRadius: 999, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                <div style={{ width: `${c.progress_percent || 0}%`, height: "100%", background: "#00A651" }} />
              </div>
              <div style={{ fontSize: 11, color: styles.cardDateStyle.color, marginTop: 4 }}>
                {c.current_value}/{c.target_value} · +{c.reward_points} pts · {c.reward_amount} MRU
              </div>
            </div>
          ))}
        </section>
      )}

      <h2 style={{ ...styles.titleStyle, fontSize: 16, marginBottom: 10 }}>Achievement Badges</h2>

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
