/**
 * Canonical YALA color tokens (JS).
 * Keep in sync with tokens/index.css
 */
export const YALA_COLORS = {
  primary: "#00a651",
  primaryStrong: "#009248",
  primaryDeep: "#087a45",
  primaryDark: "#034f2f",
  primarySoft: "rgba(0, 166, 81, 0.12)",
  primarySoftStrong: "rgba(0, 166, 81, 0.2)",
  lime: "#31d565",
  gold: "#f5b719",
  goldStrong: "#7c4a03",
  blue: "#3b82f6",
  purple: "#8b5cf6",
  coral: "#ff6b6b",
  success: "#059669",
  warn: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
  ink: "#0f172a",
  inkSoft: "rgba(15, 23, 42, 0.72)",
  muted: "#64748b",
  canvas: "#f3f7f5",
  card: "#ffffff",
  line: "rgba(15, 23, 42, 0.08)",
  lineStrong: "rgba(15, 23, 42, 0.14)",
  onPrimary: "#ffffff",
};

/** @deprecated Use YALA_SEMANTIC_COLORS for role-based naming */
export function getYalaColors() {
  return YALA_COLORS;
}
