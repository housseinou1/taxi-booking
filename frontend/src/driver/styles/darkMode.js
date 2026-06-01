import { useCallback, useEffect, useState } from "react";

/**
 * Dark Mode Theme System for Yala Driver App.
 *
 * Provides CSS variables, theme switching logic, and a React hook.
 * Persists preference via localStorage key `yala_dark_mode`.
 * Applies theme via data-theme attribute on document body.
 */

const STORAGE_KEY = "yala_dark_mode";

// ─── Theme Color Definitions ────────────────────────────────────────────────

export const darkTheme = {
  bgPrimary: "#0B1220",
  bgSecondary: "rgba(255,255,255,0.06)",
  bgCard: "rgba(255,255,255,0.06)",
  textPrimary: "#FFFFFF",
  textSecondary: "rgba(255,255,255,0.7)",
  borderColor: "rgba(255,255,255,0.1)",
  accentGreen: "#00A651",
  accentGold: "#D4AF37",
};

export const lightTheme = {
  bgPrimary: "#FFFFFF",
  bgSecondary: "#F5F7FA",
  bgCard: "#FFFFFF",
  textPrimary: "#0B1220",
  textSecondary: "rgba(11,18,32,0.7)",
  borderColor: "rgba(11,18,32,0.1)",
  accentGreen: "#00A651",
  accentGold: "#D4AF37",
};

// ─── Theme Utilities ────────────────────────────────────────────────────────

/**
 * Get the stored dark mode preference from localStorage.
 * Defaults to true (dark mode) since the driver app is dark-themed.
 * @returns {boolean}
 */
function getStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return true; // Default to dark mode
    return stored === "true";
  } catch {
    return true;
  }
}

/**
 * Apply theme to the document body via data-theme attribute.
 * @param {boolean} isDark
 */
function applyThemeToDOM(isDark) {
  if (typeof document !== "undefined") {
    document.body.setAttribute("data-theme", isDark ? "dark" : "light");
  }
}

/**
 * Get the current theme colors based on dark mode state.
 * @param {boolean} isDark
 * @returns {Object} Theme color object
 */
export function getThemeColors(isDark) {
  return isDark ? darkTheme : lightTheme;
}

// ─── useDarkMode Hook ───────────────────────────────────────────────────────

/**
 * React hook for dark mode theme management.
 *
 * Reads preference from localStorage on mount, applies to DOM,
 * and provides toggle functionality.
 *
 * @returns {{ isDark: boolean, toggleDark: function, theme: Object }}
 */
export function useDarkMode() {
  const [isDark, setIsDark] = useState(getStoredPreference);

  // Apply theme on mount and when isDark changes
  useEffect(() => {
    applyThemeToDOM(isDark);
  }, [isDark]);

  const toggleDark = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable, still toggle in-memory
      }
      return next;
    });
  }, []);

  const theme = isDark ? darkTheme : lightTheme;

  return { isDark, toggleDark, theme };
}

export default useDarkMode;
