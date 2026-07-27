import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
  theme: "light",
  app: "rider",
  lang: "en",
  dir: "ltr",
  contrast: "normal",
  setTheme: () => {},
  setLang: () => {},
  setContrast: () => {},
});

export function useYalaTheme() {
  return useContext(ThemeContext);
}

function readAppType() {
  const fromAttr = document.documentElement.getAttribute("data-yala-app");
  if (fromAttr) return fromAttr;
  const cls = document.documentElement.className || "";
  if (cls.includes("yala-app--driver")) return "driver";
  if (cls.includes("yala-app--delivery")) return "delivery";
  return "rider";
}

function prefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function YalaThemeProvider({
  app = readAppType(),
  defaultTheme = "system",
  defaultLang = "en",
  defaultContrast = "normal",
  children,
}) {
  const [theme, setTheme] = useState(defaultTheme);
  const [lang, setLang] = useState(defaultLang);
  const [contrast, setContrast] = useState(defaultContrast);

  const dir = ["ar", "ur", "he"].includes(lang) ? "rtl" : "ltr";
  const effectiveTheme =
    theme === "system" ? (prefersDark() ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-yala-app", app);
    root.setAttribute("data-yala-theme", effectiveTheme);
    root.setAttribute("data-yala-contrast", contrast);
    root.setAttribute("lang", lang);
    root.setAttribute("dir", dir);
  }, [app, effectiveTheme, contrast, lang, dir]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        app,
        lang,
        dir,
        contrast,
        effectiveTheme,
        setTheme,
        setLang,
        setContrast,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
