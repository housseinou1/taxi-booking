import React from "react";
import ReactDOM from "react-dom/client";
import "./design-system";
import "./index.css";
import "./rider/lyft-rider.css";
import "./i18n";
import App from "./App";
import { ThemeProvider as YalaThemeProvider } from "./design-system";
import { initFrontendSentry } from "./monitoring/sentry";
import {
  getAppType,
  initNativeAppType,
  isDeliveryAppInstall,
  isDeliveryNativeApp,
  isNative,
  isTaxiDriverContext,
} from "./native/platform";

const rootElement = document.getElementById("root");
const root = ReactDOM.createRoot(rootElement);

function renderApp() {
  root.render(
    <React.StrictMode>
      <YalaThemeProvider>
        <App />
      </YalaThemeProvider>
    </React.StrictMode>
  );
}

function showBootSplash(message) {
  rootElement.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B1220;color:#fff;font-family:'Plus Jakarta Sans',sans-serif;padding:24px;text-align:center;">
      <div>
        <div style="font-size:28px;font-weight:700;margin-bottom:8px;">Yala</div>
        <div style="opacity:0.8;font-size:15px;">${message}</div>
      </div>
    </main>
  `;
}

async function loadAppTheme() {
  const appType = getAppType();

  if (isDeliveryNativeApp() || isDeliveryAppInstall()) {
    await import("./delivery/delivery-uber.css");
    document.documentElement.classList.add("yala-app--delivery");
    return;
  }

  if (appType === "driver" || isTaxiDriverContext()) {
    await import("./driver/lyft-driver.css");
    document.documentElement.classList.add("yala-app--driver");
    return;
  }

  document.documentElement.classList.add("yala-app--rider");
}

async function bootstrap() {
  await initFrontendSentry();

  if (isNative()) {
    showBootSplash("Starting Yala...");
    await initNativeAppType();
  }

  await loadAppTheme();
  renderApp();

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "";

  // Only register service worker in browser/PWA mode, not local development or Capacitor native apps.
  if ("serviceWorker" in navigator && !isNative() && !isLocalhost) {
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => {
              const scriptUrl = registration.active?.scriptURL || "";
              return scriptUrl.includes("/sw.js") && !scriptUrl.includes("v5");
            })
            .map((registration) => registration.unregister())
        );
        await navigator.serviceWorker.register("/sw.js?v=5");
      } catch (error) {
        console.log("Service worker registration failed:", error);
      }
    });
  } else if ("serviceWorker" in navigator) {
    // Unregister stale service workers in native and local development contexts.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
  }
}

bootstrap();
