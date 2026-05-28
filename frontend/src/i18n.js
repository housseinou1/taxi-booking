import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/translation.json";
import fr from "./locales/fr/translation.json";
import ar from "./locales/ar/translation.json";

export const LANGUAGE_STORAGE_KEY = "sx_language_code";

export const languageOptions = [
  { code: "en", labelKey: "settings.english", nativeName: "English" },
  { code: "fr", labelKey: "settings.french", nativeName: "Francais" },
  { code: "ar", labelKey: "settings.arabic", nativeName: "العربية" },
];

export function normalizeLanguageCode(value) {
  if (["en", "fr", "ar"].includes(value)) return value;

  const normalized = String(value || "").toLowerCase();
  if (normalized.startsWith("fr") || normalized === "french") return "fr";
  if (normalized.startsWith("ar") || normalized === "arabic") return "ar";
  return "en";
}

export function applyDocumentLanguage(languageCode) {
  const code = normalizeLanguageCode(languageCode);
  document.documentElement.lang = code;
  document.documentElement.dir = code === "ar" ? "rtl" : "ltr";
  document.body.dir = code === "ar" ? "rtl" : "ltr";
  document.body.classList.toggle("sx-rtl", code === "ar");
}

const urlLanguage = new URLSearchParams(window.location.search).get("lang");
const initialLanguage = normalizeLanguageCode(
  urlLanguage ||
    localStorage.getItem(LANGUAGE_STORAGE_KEY) ||
    localStorage.getItem("sx_language") ||
    window.navigator.language
);

if (urlLanguage) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, initialLanguage);
  localStorage.setItem(
    "sx_language",
    initialLanguage === "fr" ? "French" : initialLanguage === "ar" ? "Arabic" : "English"
  );
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      ar: { translation: ar },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });

applyDocumentLanguage(initialLanguage);

i18n.on("languageChanged", (languageCode) => {
  const code = normalizeLanguageCode(languageCode);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  localStorage.setItem(
    "sx_language",
    code === "fr" ? "French" : code === "ar" ? "Arabic" : "English"
  );
  applyDocumentLanguage(code);
});

export default i18n;
