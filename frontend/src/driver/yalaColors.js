import { isDriverYalaUI } from "../native/platform";

const DRIVER_COLORS_DARK = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  barDefault: "#00A651",
  barZero: "rgba(255, 255, 255, 0.15)",
  errorRed: "#EF4444",
  emergencyRed: "#DC2626",
  chatBlue: "#3B82F6",
  successGreen: "#10B981",
  onPrimary: "#FFFFFF",
  starYellow: "#FBBF24",
};

const DRIVER_COLORS_YALA = {
  primaryGreen: "#00A651",
  goldAccent: "#111827",
  darkNavy: "#f3f4f6",
  white: "#111827",
  lightGray: "#6b7280",
  cardBg: "#ffffff",
  cardBorder: "#e5e7eb",
  textMuted: "#6b7280",
  barDefault: "#00A651",
  barZero: "#e5e7eb",
  errorRed: "#EF4444",
  emergencyRed: "#DC2626",
  chatBlue: "#3B82F6",
  successGreen: "#10B981",
  onPrimary: "#FFFFFF",
  starYellow: "#FBBF24",
};

export function getDriverColors() {
  return isDriverYalaUI() ? DRIVER_COLORS_YALA : DRIVER_COLORS_DARK;
}

export { isDriverYalaUI };
