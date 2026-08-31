import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "yala_admin_theme";
const AdminThemeContext = createContext(null);

function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode) {
  if (mode === "system") return getSystemTheme();
  return mode === "light" ? "light" : "dark";
}

export function AdminThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem(STORAGE_KEY) || "dark");
  const [resolved, setResolved] = useState(() => resolveTheme(localStorage.getItem(STORAGE_KEY) || "dark"));

  const setMode = useCallback((next) => {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    setResolved(resolveTheme(next));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-admin-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    if (mode !== "system") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(getSystemTheme());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>;
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error("useAdminTheme must be used within AdminThemeProvider");
  return ctx;
}
