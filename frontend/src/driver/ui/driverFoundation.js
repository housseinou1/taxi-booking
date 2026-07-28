/**
 * Minimal shared Driver UI foundations (Mission 2 Phase 0).
 * Not the final design system — centralizes values repeated across active screens.
 * Prefer these over ad-hoc hex / magic numbers when touching Driver UI.
 */
export const DRIVER_UI = Object.freeze({
  color: Object.freeze({
    primary: "#00a651",
    primaryStrong: "#009248",
    primaryDeep: "#087a45",
    ink: "#0f172a",
    inkSoft: "rgba(15, 23, 42, 0.72)",
    muted: "#64748b",
    canvas: "#f3f7f5",
    card: "#ffffff",
    line: "rgba(15, 23, 42, 0.08)",
    lineStrong: "rgba(15, 23, 42, 0.14)",
    danger: "#dc2626",
    warn: "#d97706",
    success: "#059669",
    onPrimary: "#ffffff",
    offline: "#64748b",
  }),
  space: Object.freeze({
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
  }),
  radius: Object.freeze({
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    pill: 9999,
  }),
  shadow: Object.freeze({
    sm: "0 2px 8px rgba(15, 23, 42, 0.06)",
    md: "0 8px 22px rgba(15, 23, 42, 0.08)",
    lg: "0 14px 34px rgba(15, 23, 42, 0.12)",
  }),
  touchMin: 48,
  fontFamily:
    '"Plus Jakarta Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export default DRIVER_UI;
