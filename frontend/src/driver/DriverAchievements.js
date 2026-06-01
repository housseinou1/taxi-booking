import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { useDriverContext } from "./context/DriverContext";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  cardBg: "#111827",
  textMuted: "#9CA3AF",
};

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriverAchievements() {
  const token = localStorage.getItem("access");
  const { state } = useDriverContext();
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
      setAchievements(Array.isArray(achievementsRes.data) ? achievementsRes.data : []);
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
    <div style={containerStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>Achievements & Rewards</h1>
        <div style={pointsBadgeStyle}>
          <span style={pointsLabelStyle}>Reward Points</span>
          <span style={pointsValueStyle}>{rewardPoints}</span>
        </div>
      </header>

      {loading ? (
        <div style={loadingStyle}>Loading achievements...</div>
      ) : achievements.length === 0 ? (
        <div style={emptyStyle}>
          <span style={emptyIconStyle}>🏆</span>
          <p style={emptyTextStyle}>No achievements earned yet.</p>
          <p style={emptySubtextStyle}>Complete rides and maintain high ratings to unlock achievements.</p>
        </div>
      ) : (
        <div style={gridStyle}>
          {achievements.map((achievement) => (
            <div key={achievement.id} style={cardStyle}>
              <span style={badgeIconStyle}>{achievement.icon || "🏅"}</span>
              <h3 style={cardTitleStyle}>{achievement.name}</h3>
              <p style={cardDateStyle}>
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

// ─── Styles ─────────────────────────────────────────────────────────────────
const containerStyle = {
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "20px 16px 100px",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "24px",
  flexWrap: "wrap",
  gap: "12px",
};

const titleStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: "800",
  margin: 0,
};

const pointsBadgeStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 16px",
  borderRadius: "12px",
  background: `linear-gradient(135deg, ${COLORS.goldAccent}22, ${COLORS.goldAccent}44)`,
  border: `1px solid ${COLORS.goldAccent}66`,
};

const pointsLabelStyle = {
  color: COLORS.goldAccent,
  fontSize: "11px",
  fontWeight: "600",
  textTransform: "uppercase",
};

const pointsValueStyle = {
  color: COLORS.white,
  fontSize: "18px",
  fontWeight: "900",
};

const loadingStyle = {
  color: COLORS.textMuted,
  textAlign: "center",
  padding: "60px 20px",
  fontSize: "15px",
};

const emptyStyle = {
  textAlign: "center",
  padding: "60px 20px",
};

const emptyIconStyle = {
  fontSize: "48px",
  display: "block",
  marginBottom: "16px",
};

const emptyTextStyle = {
  color: COLORS.white,
  fontSize: "16px",
  fontWeight: "600",
  margin: "0 0 8px",
};

const emptySubtextStyle = {
  color: COLORS.textMuted,
  fontSize: "14px",
  margin: 0,
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
  gap: "12px",
};

const cardStyle = {
  background: COLORS.cardBg,
  borderRadius: "14px",
  padding: "20px 12px",
  textAlign: "center",
  border: "1px solid rgba(255,255,255,0.08)",
};

const badgeIconStyle = {
  fontSize: "36px",
  display: "block",
  marginBottom: "10px",
};

const cardTitleStyle = {
  color: COLORS.white,
  fontSize: "13px",
  fontWeight: "700",
  margin: "0 0 6px",
};

const cardDateStyle = {
  color: COLORS.textMuted,
  fontSize: "11px",
  margin: 0,
};
