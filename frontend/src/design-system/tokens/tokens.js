/**
 * Canonical YALA design tokens for JavaScript consumers.
 *
 * CSS remains the rendering source of truth. These values mirror the public
 * custom properties in index.css for charts, native bridges and testable
 * configuration that cannot consume CSS variables directly.
 */
export const colors = Object.freeze({
  primary: "#00a651",
  primaryVariant: "#009248",
  secondary: "#31d565",
  success: "#059669",
  warning: "#d97706",
  error: "#dc2626",
  info: "#2563eb",
  online: "#059669",
  offline: "#64748b",
  pending: "#d97706",
  approved: "#059669",
  rejected: "#dc2626",
  expired: "#ff6b6b",
});

export const themes = Object.freeze({
  light: Object.freeze({
    background: "#f3f7f5",
    surface: "#ffffff",
    card: "#ffffff",
    divider: "rgba(15, 23, 42, 0.08)",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    disabled: "#94a3b8",
    onPrimary: "#ffffff",
  }),
  dark: Object.freeze({
    background: "#0b1220",
    surface: "#111827",
    card: "#111827",
    divider: "rgba(248, 250, 252, 0.1)",
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    disabled: "#64748b",
    onPrimary: "#ffffff",
  }),
});

export const typography = Object.freeze({
  family: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  display: Object.freeze({ size: 32, weight: 800, lineHeight: 1.2 }),
  headline: Object.freeze({ size: 24, weight: 700, lineHeight: 1.3 }),
  title: Object.freeze({ size: 20, weight: 600, lineHeight: 1.3 }),
  subtitle: Object.freeze({ size: 18, weight: 600, lineHeight: 1.4 }),
  body: Object.freeze({ size: 16, weight: 400, lineHeight: 1.5 }),
  caption: Object.freeze({ size: 14, weight: 400, lineHeight: 1.5 }),
  button: Object.freeze({ size: 16, weight: 600, lineHeight: 1.25 }),
  label: Object.freeze({ size: 14, weight: 500, lineHeight: 1.4 }),
});

export const spacing = Object.freeze({
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
});

export const radii = Object.freeze({
  small: 12,
  medium: 16,
  large: 20,
  extraLarge: 24,
  modal: 32,
  pill: 9999,
});

export const elevation = Object.freeze({
  none: "none",
  low: "0 2px 8px rgba(15, 23, 42, 0.06)",
  medium: "0 8px 22px rgba(15, 23, 42, 0.08)",
  high: "0 14px 34px rgba(15, 23, 42, 0.12)",
  sheet: "0 -8px 32px rgba(15, 23, 42, 0.11)",
});

export const iconSizes = Object.freeze({
  extraSmall: 16,
  small: 20,
  medium: 24,
  large: 32,
  extraLarge: 40,
});

export const motion = Object.freeze({
  fast: 150,
  normal: 250,
  slow: 350,
  enter: 250,
  exit: 200,
  easing: "cubic-bezier(0.4, 0, 0.2, 1)",
});

export const breakpoints = Object.freeze({
  small: 480,
  medium: 768,
  large: 1024,
  extraLarge: 1280,
});

export const componentTokens = Object.freeze({
  minimumTouchTarget: 48,
  button: Object.freeze({ small: 40, medium: 48, large: 52 }),
  input: Object.freeze({ height: 48 }),
  search: Object.freeze({ height: 48 }),
  avatar: Object.freeze({ small: 32, medium: 48, large: 72 }),
  chip: Object.freeze({ height: 28 }),
  progress: Object.freeze({ height: 6 }),
});

export const yalaTokens = Object.freeze({
  colors,
  themes,
  typography,
  spacing,
  radii,
  elevation,
  iconSizes,
  motion,
  breakpoints,
  components: componentTokens,
});

export default yalaTokens;
