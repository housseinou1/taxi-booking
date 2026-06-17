import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App";
import { isNative } from "./native/platform";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Only register service worker in browser/PWA mode, not in Capacitor native apps
if ("serviceWorker" in navigator && !isNative()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.log("Service worker registration failed:", error));
  });
} else if ("serviceWorker" in navigator && isNative()) {
  // Unregister any previously registered service workers in native context
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
