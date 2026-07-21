import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useTranslation } from "react-i18next";

import Login from "./auth/Login";
import Register from "./auth/Register";
import { canAccessPage, getDashboardPath, getSafeRedirectPath, getUserRole, isPublicPage } from "./auth/roleRouting";
import {
  clearAuthSession,
  getRequiredRoleForApp,
  getStoredUser,
  hasStoredAuthCredentials,
  isDriverAccount,
  restoreAuthSession,
} from "./auth/session";

import RiderApp from "./rider/RiderApp";
import RiderReviews from "./rider/RiderReviews";
import SavedPlaces from "./rider/SavedPlaces";

import DriverSignup from "./driver/DriverSignup";
import DriverLegalSignRoute from "./driver/DriverLegalSignRoute";
import RiderLegalAcceptRoute from "./rider/RiderLegalAcceptRoute";
import { DriverProvider } from "./driver/context/DriverContext";

import AdminDashboard from "./admin/AdminDashboard";
import ExecutiveDashboard from "./admin/executive/ExecutiveDashboard";
import InstallAppButton from "./InstallAppButton";
import NotificationCenter from "./components/NotificationCenter";
import YalaAIAssistant from "./components/YalaAIAssistant";
import SettingsPageView from "./settings/SettingsPage";
import SharedTripPage from "./safety/SharedTripPage";

import AddPaymentMethod from "./payments/AddPaymentMethod";
import SavedPaymentMethods from "./payments/SavedPaymentMethods";
import RiderPayments from "./payments/PaymentPage";
import { DriverProfilePage, RiderProfilePage } from "./profile/ProfilePages";
import SupportCenter from "./support/SupportCenter";
import LandingPage from "./landing/LandingPage";
import RiderRideHistory from "./rider/components/RideHistory";
import RiderShell from "./rider/components/RiderShell";
import DriverShell from "./driver/components/DriverShell";
import PostRidePayRate from "./rider/components/PostRidePayRate";
import { ShareBookingFlow, ShareRideScreen, ShareRideComplete, ShareAdminDashboard } from './components/share';
import DeliveryCustomerApp from "./delivery/DeliveryCustomerApp";
import DeliveryDashboard from "./delivery/DeliveryDashboard";
import DeliveryCourierProfileSetup from "./delivery/DeliveryCourierProfileSetup";
import DeliveryCourierTermsRoute from "./delivery/DeliveryCourierTermsRoute";
import DeliveryCourierLegalSignRoute from "./delivery/DeliveryCourierLegalSignRoute";
import MerchantLegalSignRoute from "./merchant/MerchantLegalSignRoute";
import DeliveryCustomerTermsRoute from "./delivery/DeliveryCustomerTermsRoute";
import DeliveryCustomerSettings from "./delivery/DeliveryCustomerSettings";
import DeliveryCourierProfile from "./delivery/DeliveryCourierProfile";
import DeliveryWallet from "./delivery/DeliveryWallet";
import DeliveryEarnings from "./delivery/DeliveryEarnings";
import DeliveryDocuments from "./delivery/DeliveryDocuments";
import DeliveryHistory from "./delivery/DeliveryHistory";
import DeliveryCourierProfileEdit from "./delivery/DeliveryCourierProfileEdit";
import DeliveryCourierSupport from "./delivery/DeliveryCourierSupport";
import DeliveryCourierSettings from "./delivery/DeliveryCourierSettings";
import MerchantApp from "./merchant/MerchantApp";
import MerchantRegister from "./merchant/MerchantRegister";
import WalletPage from "./payments/WalletPage";
import AdminPaymentDashboard from "./admin/AdminPaymentDashboard";
import LaunchServices from "./services/LaunchServices";
import { API_URL } from "./apiConfig";
import { MARKET } from "./marketConfig";
import riderApi from "./rider/services/authenticatedApi";
import {
  getAppHomePath,
  getAppType,
  isDeliveryCourierApp,
  isDeliveryCourierPath,
  isDeliveryNativeApp,
  isTaxiDriverContext,
  markDeliveryCourierSession,
  shouldShowInstallButton,
} from './native/platform';
import { initDeepLinkListener } from './native/deeplink';
import {
  getRouteFromNotification,
  initPushNotifications,
  unregisterPushNotifications,
} from './native/push';

const LOGO_SRC = "/yala-logo.png";
const DELIVERY_LOGO_SRC = "/yala-delivery-logo.png";

function getBrandLogoSrc() {
  return getAppType() === "delivery" ? DELIVERY_LOGO_SRC : LOGO_SRC;
}

// Route filtering for native apps — only show relevant routes per app type
const RIDER_ROUTES = ['/rider', '/rider-dashboard', '/rider/legal', '/rider-history', '/history', '/rider-reviews', '/saved-places', '/rider-profile', '/rider-payments', '/wallet', '/ride/share', '/delivery', '/merchant', '/merchant/register', '/services', '/login', '/register', '/settings', '/support', '/terms', '/privacy'];
const DRIVER_ROUTES = ['/driver', '/driver/sign', '/driver/profile', '/driver/profile/edit', '/driver/documents', '/driver/code', '/driver/earnings', '/driver/wallet', '/driver/feedback', '/driver/support', '/driver/achievements', '/driver/hall-of-fame', '/driver/history', '/services', '/login', '/register', '/settings', '/support', '/terms', '/privacy', '/payment-setup', '/driver-vehicle-setup'];
const DELIVERY_ROUTES = ['/delivery/courier', '/delivery/account', '/delivery/bank', '/delivery/wallet', '/delivery/history', '/delivery/profile-setup', '/delivery/vehicle-setup', '/delivery/earnings', '/delivery/documents', '/delivery/profile/edit', '/delivery/support', '/delivery/settings', '/delivery/courier/terms', '/delivery/courier/sign', '/delivery/customer/terms', '/delivery/customer/settings', '/driver/deliveries', '/login', '/register', '/settings', '/support', '/terms', '/privacy'];

const TAXI_DRIVER_ONLY_PAGES = new Set([
  "driver",
  "driver-profile",
  "driver-account",
  "driver-premium-profile",
  "driver-profile-edit",
  "driver-documents",
  "driver-code",
  "driver-earnings",
  "driver-wallet",
  "driver-wallet-withdraw",
  "driver-feedback",
  "driver-support",
  "driver-achievements",
  "driver-hall-of-fame",
  "driver-history",
  "driver-vehicle-setup",
]);

function isRoleAllowedForAppType(role, appType) {
  if (appType === "web") return true;
  if (appType === "rider") return role === "rider";
  if (appType === "driver") return role === "driver";
  if (appType === "delivery") return role === "driver";
  if (appType === "admin") return role === "admin";
  return true;
}

function normalizeRouteContext(value) {
  if (!value) return "";

  try {
    const decoded = decodeURIComponent(String(value));
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      return new URL(decoded).pathname.toLowerCase();
    }
    return decoded.toLowerCase();
  } catch (error) {
    return String(value).toLowerCase();
  }
}

function getRouteAppType() {
  if (isDeliveryNativeApp()) return "delivery";
  const builtAppType = getAppType();
  if (builtAppType === "rider" || builtAppType === "driver" || builtAppType === "delivery" || builtAppType === "admin") {
    return builtAppType;
  }

  const params = new URLSearchParams(window.location.search || "");
  const pathname = normalizeRouteContext(window.location.pathname);
  // Prefer the URL the user actually opened over a stale login redirect
  // (e.g. leftover /driver must not force Driver branding on /admin).
  const route = normalizeRouteContext(
    params.get("next") ||
      (pathname && pathname !== "/" && pathname !== "/login" && pathname !== "/register"
        ? pathname
        : "") ||
      localStorage.getItem("sx_login_redirect") ||
      pathname
  );

  if (route === "/delivery/courier" || route.startsWith("/delivery/courier")) return "delivery";
  if (isDeliveryCourierPath(route)) return "delivery";
  if (route === "/driver" || route.startsWith("/driver/")) return "driver";
  if (
    route === "/admin" ||
    route === "/admin-dashboard" ||
    route.startsWith("/admin/")
  ) {
    return "web";
  }
  if (
    route === "/rider" ||
    route === "/rider-dashboard" ||
    route.startsWith("/rider-") ||
    route.startsWith("/ride/")
  ) {
    return "rider";
  }

  return getAppType();
}

function isRouteAllowed(path) {
  const appType = getAppType();
  if (appType === 'web') return true;
  const routes =
    appType === 'rider' ? RIDER_ROUTES : appType === 'delivery' ? DELIVERY_ROUTES : DRIVER_ROUTES;
  return routes.some(route => path === route || path.startsWith(route + '/'));
}

// Lazy-loaded driver screens (excluded from initial dashboard bundle)
const LazyDriverEarnings = React.lazy(() => import("./driver/DriverEarnings"));
const LazyDriverFeedback = React.lazy(() => import("./driver/DriverFeedback"));
const LazyDriverSupport = React.lazy(() => import("./driver/DriverSupport"));
const LazyDriverAchievements = React.lazy(() => import("./driver/DriverAchievements"));
const LazyDriverHallOfFame = React.lazy(() => import("./driver/DriverHallOfFame"));
const LazyDriverRideHistory = React.lazy(() => import("./driver/DriverRideHistory"));
const LazyDriverSettings = React.lazy(() => import("./driver/DriverSettings"));
const LazyDriverCodePage = React.lazy(() => import("./driver/DriverCodePage"));
const LazyDriverDashboardNew = React.lazy(() => import("./driver/DriverDashboardNew"));
const LazyDriverProfilePage = React.lazy(() => import("./driver/DriverProfilePage"));
const LazyDriverProfileEditPage = React.lazy(() => import("./driver/DriverProfileEditPage"));
const LazyDriverWallet = React.lazy(() => import("./driver/DriverWallet"));

const driverPageFallback = (
  <div className="driver-shell-loading">Loading...</div>
);

function wrapDriverSecondaryPage(title, node, { backTo = "/driver", withProvider = true } = {}) {
  const body = withProvider ? <DriverProvider>{node}</DriverProvider> : node;
  const content = <Suspense fallback={driverPageFallback}>{body}</Suspense>;

  return (
    <DriverShell title={title} backTo={backTo}>
      {content}
    </DriverShell>
  );
}

function App() {
  const [navCounter, setNavCounter] = useState(0);
  const currentPath = useMemo(() => {
    void navCounter;
    return (window.location.pathname || "/").replace(/\/+$/, "") || "/";
  }, [navCounter]);

  const [page, setPage] = useState("home");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [refreshCards, setRefreshCards] = useState(0);
  const [selectedRide, setSelectedRide] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [, forceUpdate] = useState(0);

  // Listen for pushState-based navigation (SPA tab switches)
  useEffect(() => {
    const handlePopState = () => setNavCounter((n) => n + 1);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isDeliveryCourierApp()) return;
    if (TAXI_DRIVER_ONLY_PAGES.has(page)) {
      window.location.replace("/delivery/courier");
    }
  }, [page]);

  useEffect(() => {
    if (isDeliveryCourierApp()) {
      markDeliveryCourierSession();
      document.title = "Yala Delivery";
      return;
    }
    if (getAppType() === "driver") {
      document.title = "Yala Driver";
      return;
    }
    if (getAppType() === "rider") {
      document.title = "Yala Rider";
    }
  }, [currentPath]);

  useEffect(() => {
    const builtAppType = getAppType();
    if (builtAppType === "rider" || builtAppType === "driver" || builtAppType === "delivery" || builtAppType === "admin") {
      localStorage.removeItem("sx_login_redirect");
    }

    initDeepLinkListener((route) => {
      if (route) {
        window.location.href = route;
      }
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    initPushNotifications((data) => {
      const route = getRouteFromNotification(data, getAppType());
      if (!route) return;
      const currentPath = window.location.pathname;
      if (
        route === "/driver" &&
        (currentPath === "/driver" || currentPath === "/")
      ) {
        window.dispatchEvent(
          new CustomEvent("yala:driver-focus-ride", { detail: data })
        );
        return;
      }
      if (currentPath === route) return;
      window.location.href = route;
    }, API_URL);
  }, [isAuthenticated]);

  useLayoutEffect(() => {
    if (currentPath === "/driver/deliveries") {
      window.location.replace("/delivery/courier");
      return;
    }

    const builtAppType = getAppType();
    if (builtAppType !== "web" && currentPath === "/") {
      const homePath = getAppHomePath();
      if (homePath !== "/") {
        window.history.replaceState(null, "", homePath);
        setNavCounter((n) => n + 1);
        return;
      }
    }

    if (isDeliveryNativeApp()) {
      markDeliveryCourierSession();
      const isTaxiDriverPath =
        currentPath === "/" ||
        currentPath === "/driver" ||
        currentPath === "/driver-profile" ||
        currentPath.startsWith("/driver/");
      if (isTaxiDriverPath) {
        if (currentPath !== "/delivery/courier") {
          window.history.replaceState(null, "", "/delivery/courier");
        }
        setPage("delivery-driver");
        return;
      }
    }

    // Route filtering for native apps — redirect to default if route not allowed
    // Route filtering disabled — all routes allowed for website deployment

    if (currentPath === "/payment-setup") setPage("payment-setup");
    else if (currentPath === "/driver-vehicle-setup") setPage("driver-vehicle-setup");
    else if (currentPath === "/driver/sign") setPage("driver-legal-sign");
    else if (currentPath === "/rider/legal") setPage("rider-legal-accept");
    else if (currentPath === "/rider-dashboard") setPage("rider-dashboard");
    else if (currentPath === "/rider-history" || currentPath === "/history") setPage("rider-ride-history");
    else if (currentPath === "/rider-reviews") setPage("rider-reviews");
    else if (currentPath === "/saved-places") setPage("saved-places");
    else if (currentPath === "/rider-profile") setPage("rider-profile");
    else if (currentPath === "/rider-payments") setPage("rider-payments");
    else if (currentPath === "/wallet") setPage("wallet");
    else if (currentPath === "/delivery/courier" || currentPath === "/driver/deliveries") setPage("delivery-driver");
    else if (currentPath === "/delivery/profile-setup") setPage("delivery-profile-setup");
    else if (currentPath === "/delivery/vehicle-setup") setPage("delivery-vehicle-setup");
    else if (currentPath === "/delivery/account") setPage("delivery-account");
    else if (currentPath === "/delivery/bank") setPage("delivery-bank");
    else if (currentPath === "/delivery/wallet") setPage("delivery-wallet");
    else if (currentPath === "/delivery/earnings") setPage("delivery-earnings");
    else if (currentPath === "/delivery/history") setPage("delivery-history");
    else if (currentPath === "/delivery/documents") setPage("delivery-documents");
    else if (currentPath === "/delivery/profile/edit") setPage("delivery-profile-edit");
    else if (currentPath === "/delivery/support") setPage("delivery-support");
    else if (currentPath === "/delivery/settings") setPage("delivery-settings");
    else if (currentPath === "/delivery/courier/terms") setPage("delivery-courier-terms");
    else if (currentPath === "/delivery/courier/sign") setPage("delivery-courier-legal-sign");
    else if (currentPath === "/delivery/customer/terms") setPage("delivery-customer-terms");
    else if (currentPath === "/delivery/customer/settings") setPage("delivery-customer-settings");
    else if (currentPath === "/delivery/terms") {
      window.history.replaceState(null, "", "/delivery/courier/terms");
      setPage("delivery-courier-terms");
    }
    else if (currentPath === "/terms" && isDeliveryCourierApp()) {
      window.history.replaceState(null, "", "/delivery/courier/terms");
      setPage("delivery-courier-terms");
    }
    else if (currentPath === "/settings" && isDeliveryCourierApp()) {
      window.history.replaceState(null, "", "/delivery/settings");
      setPage("delivery-settings");
    }
    else if (currentPath === "/driver/documents" && isDeliveryCourierApp()) {
      window.history.replaceState(null, "", "/delivery/documents");
      setPage("delivery-documents");
    }
    else if (currentPath === "/driver/profile/edit" && isDeliveryCourierApp()) {
      window.history.replaceState(null, "", "/delivery/profile/edit");
      setPage("delivery-profile-edit");
    }
    else if (currentPath === "/delivery") setPage("delivery-customer");
    else if (currentPath === "/merchant/register") setPage("merchant-register");
    else if (currentPath === "/merchant/sign") setPage("merchant-legal-sign");
    else if (currentPath === "/merchant") setPage("merchant");
    else if (currentPath === "/ride/share") setPage("share-booking");
    else if (currentPath.match(/^\/ride\/share\/\d+\/complete$/)) setPage("share-ride-complete");
    else if (currentPath.match(/^\/ride\/share\/\d+$/)) setPage("share-ride");
    else if (currentPath === "/rider") setPage("rider");
    else if (currentPath === "/driver-profile") setPage("driver-profile");
    else if (currentPath === "/driver/account") setPage("driver-account");
    else if (currentPath === "/driver/profile/edit") setPage("driver-profile-edit");
    else if (currentPath === "/driver/documents") setPage("driver-documents");
    else if (currentPath === "/driver/code") setPage("driver-code");
    else if (currentPath === "/driver/profile") setPage("driver-premium-profile");
    else if (currentPath === "/driver/earnings") setPage("driver-earnings");
    else if (currentPath === "/driver/wallet/withdraw") setPage("driver-wallet-withdraw");
    else if (currentPath === "/driver/wallet") setPage("driver-wallet");
    else if (currentPath === "/driver/feedback") setPage("driver-feedback");
    else if (currentPath === "/driver/support") setPage("driver-support");
    else if (currentPath === "/driver/achievements") setPage("driver-achievements");
    else if (currentPath === "/driver/hall-of-fame") setPage("driver-hall-of-fame");
    else if (currentPath === "/driver/history") setPage("driver-history");
    else if (currentPath === "/driver") {
      if (!isTaxiDriverContext()) {
        window.history.replaceState(null, "", "/delivery/courier");
        setPage("delivery-driver");
      } else {
        setPage("driver");
      }
    }
    else if (currentPath === "/register") setPage("register");
    else if (currentPath === "/login") setPage("login");
    else if (currentPath === "/admin/share-analytics") setPage("admin-share-analytics");
    else if (currentPath === "/admin-dashboard") setPage("admin");
    else if (currentPath === "/admin") setPage("admin");
    else if (currentPath === "/admin/deliveries") {
      window.history.replaceState(null, "", "/admin?section=deliveries");
      setPage("admin");
    }
    else if (currentPath === "/admin/payments") setPage("admin-payments");
    else if (currentPath === "/admin/executive") setPage("admin-executive");
    else if (currentPath === "/settings") setPage("settings");
    else if (currentPath === "/terms") setPage("terms");
    else if (currentPath === "/privacy") setPage("privacy");
    else if (currentPath === "/support") setPage("support");
    else if (currentPath === "/services") setPage("services");
    else if (currentPath.match(/^\/trip-share\/[^/]+$/)) setPage("shared-trip");
    else setPage("home");
  }, [currentPath, navCounter]);

  useEffect(() => {
    if (page === "rider-payments") {
      fetchSelectedRide();
    }
  }, [page]);

  useEffect(() => {
    const appType = getRouteAppType();
    if (appType === "web" || !isAuthenticated) return;

    const role = getUserRole(getStoredUser());
    if (!isRoleAllowedForAppType(role, appType)) {
      clearAuthSession();
      setIsAuthenticated(false);
      setSessionChecked(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    let isMounted = true;

    const finishSessionCheck = (authenticated) => {
      if (!isMounted) return;
      setIsAuthenticated(Boolean(authenticated));
      setSessionChecked(true);
    };

    const timeoutId = window.setTimeout(() => {
      if (!isMounted) return;
      finishSessionCheck(hasStoredAuthCredentials());
    }, 12000);

    const restoreSession = async () => {
      if (!hasStoredAuthCredentials()) {
        clearAuthSession();
        finishSessionCheck(false);
        return;
      }

      const cachedUser = getStoredUser();
      if (cachedUser && Object.keys(cachedUser).length > 0) {
        setIsAuthenticated(true);
        setSessionChecked(true);
      }

      // If the user explicitly opened Admin, don't keep a Driver/Rider session alive.
      const path = window.location.pathname || "";
      const next = new URLSearchParams(window.location.search || "").get("next") || "";
      const wantsAdmin =
        path === "/admin" ||
        path === "/admin-dashboard" ||
        path.startsWith("/admin/") ||
        next === "/admin" ||
        next.startsWith("/admin/");
      if (wantsAdmin) {
        const role = getUserRole(getStoredUser());
        if (role !== "admin") {
          clearAuthSession();
          finishSessionCheck(false);
          return;
        }
      }

      try {
        const result = await restoreAuthSession({
          requiredRole: getRequiredRoleForApp(),
        });
        if (!isMounted) return;
        finishSessionCheck(result.authenticated);
      } catch (error) {
        if (!isMounted) return;
        finishSessionCheck(hasStoredAuthCredentials());
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const fetchSelectedRide = async () => {
    try {
      const token = localStorage.getItem("access");

      if (!token) {
        window.location.href = "/login";
        return;
      }

      const response = await axios.get(`${API_URL}/rides/history/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const rides = Array.isArray(response.data) ? response.data : [];

      const selectedRideId = localStorage.getItem("selectedRideId");

      let ride = null;

      if (selectedRideId) {
        const selected = rides.find((item) => Number(item.id) === Number(selectedRideId));
        ride = selected?.status === "completed" ? selected : null;
      }

      if (!ride && rides.length > 0) {
        ride =
          rides.find((item) => item.status === "completed") ||
          rides[0];
      }

      setSelectedRide(ride || null);
    } catch (error) {
      console.log("Selected ride error:", error.response?.data || error);
    }
  };

  const goHome = () => {
    window.location.href = getAppHomePath();
  };

  const logout = async () => {
    await unregisterPushNotifications(API_URL);
    clearAuthSession();
    window.location.href = getAppHomePath();
  };

  const withInstall = (content, options = {}) => (
    <>
      {content}
      {options.showNotifications !== false && isAuthenticated && <NotificationCenter />}
      {shouldShowInstallButton() && <InstallAppButton />}
    </>
  );

  const handleLoginSuccess = (userData) => {
    setIsAuthenticated(true);
    setSessionChecked(true);

    // Native apps are role-locked.
    const appType = getRouteAppType();
    const role = getUserRole(userData);
    if (!isRoleAllowedForAppType(role, appType)) {
      clearAuthSession();
      setIsAuthenticated(false);
      setSessionChecked(true);
      setPage("login");
      window.history.replaceState(null, "", "/login");
      return;
    }

    if (appType === 'rider') {
      setPage("rider");
      window.history.replaceState(null, "", "/rider");
      return;
    }
    if (appType === 'delivery' || isDeliveryNativeApp()) {
      markDeliveryCourierSession();
      setPage("delivery-driver");
      window.history.replaceState(null, "", "/delivery/courier");
      return;
    }
    if (appType === 'driver') {
      setPage("driver");
      window.history.replaceState(null, "", "/driver");
      return;
    }

    // Web: route based on user role
    const params = new URLSearchParams(window.location.search || "");
    const nextPath =
      params.get("next") ||
      localStorage.getItem("sx_login_redirect") ||
      "";
    const dashPath = getSafeRedirectPath(
      userData,
      nextPath || getDashboardPath(userData)
    );
    const resolvedPath =
      dashPath === "/driver" && !isTaxiDriverContext()
        ? "/delivery/courier"
        : dashPath;
    if (resolvedPath.startsWith("/delivery/")) {
      markDeliveryCourierSession();
    }
    if (resolvedPath === "/rider" || resolvedPath === "/rider-dashboard") setPage("rider");
    else if (resolvedPath === "/driver") setPage("driver");
    else if (resolvedPath === "/admin" || resolvedPath === "/admin-dashboard") setPage("admin");
    else if (resolvedPath === "/payment-setup") setPage("payment-setup");
    else if (resolvedPath === "/driver-vehicle-setup") setPage("driver-vehicle-setup");
    else if (resolvedPath === "/rider/legal") setPage("rider-legal-accept");
    else if (resolvedPath === "/driver/sign") setPage("driver-legal-sign");
    else if (resolvedPath === "/delivery/courier") setPage("delivery-driver");
    else if (resolvedPath === "/delivery/profile-setup") setPage("delivery-profile-setup");
    else if (resolvedPath === "/delivery/vehicle-setup") setPage("delivery-vehicle-setup");
    else if (resolvedPath === "/delivery/account") setPage("delivery-account");
    else if (resolvedPath === "/delivery/bank") setPage("delivery-bank");
    else if (resolvedPath === "/delivery/wallet") setPage("delivery-wallet");
    else if (resolvedPath === "/delivery/earnings") setPage("delivery-earnings");
    else if (resolvedPath === "/delivery/history") setPage("delivery-history");
    else if (resolvedPath === "/delivery/settings") setPage("delivery-settings");
    else if (resolvedPath === "/delivery/courier/terms") setPage("delivery-courier-terms");
    else if (resolvedPath === "/delivery/courier/sign") setPage("delivery-courier-legal-sign");
    else if (resolvedPath === "/delivery/customer/terms") setPage("delivery-customer-terms");
    else if (resolvedPath === "/delivery/customer/settings") setPage("delivery-customer-settings");
    else if (resolvedPath === "/delivery/terms") setPage("delivery-courier-terms");
    else setPage("rider");
    window.history.replaceState(null, "", resolvedPath);
  };

  if (page === "login") return withInstall(<Login onLogin={handleLoginSuccess} />, { showNotifications: false });
  if (page === "register") return withInstall(<Register />, { showNotifications: false });
  if (page === "shared-trip") {
    return <SharedTripPage token={currentPath.split("/").filter(Boolean).pop()} />;
  }

  if (isProtectedPage(page) && !isPublicPage(page)) {
    if (!sessionChecked) {
      return withInstall(<AuthLoadingScreen />);
    }

    if (!isAuthenticated) {
      return withInstall(<LoginRequiredRedirect path={currentPath} />);
    }

    const user = getStoredUser();
    const appType = getAppType();
    if ((appType === "driver" || appType === "delivery") && !isDriverAccount(user)) {
      return withInstall(<LoginRequiredRedirect path={currentPath} />);
    }
    if (appType === "rider" && getUserRole(user) !== "rider") {
      return withInstall(<LoginRequiredRedirect path={currentPath} />);
    }
    if (appType === "web" && !canAccessPage(user, page)) {
      // Visiting /admin while a driver/rider session is still stored must not
      // bounce into the Driver app — clear session and show the right login.
      const roleLockedHomes = {
        admin: "/admin",
        "admin-share-analytics": "/admin",
        "delivery-admin": "/admin",
        "admin-payments": "/admin/payments",
        driver: "/driver",
        "driver-profile": "/driver",
        "driver-account": "/driver",
        "driver-documents": "/driver",
        "driver-code": "/driver",
        "driver-earnings": "/driver",
        rider: "/rider-dashboard",
        "rider-dashboard": "/rider-dashboard",
      };
      if (roleLockedHomes[page]) {
        return withInstall(<RoleAccessRedirect user={user} />);
      }
      return withInstall(<RoleAccessRedirect user={user} />);
    }
  }

  if (page === "rider-dashboard") {
    return withInstall(<RiderApp />);
  }

  if (page === "rider-profile") {
    return withInstall(
      <RiderShell title="Profile" backTo="/rider-dashboard">
        <RiderProfilePage />
      </RiderShell>
    );
  }

  if (page === "rider-ride-history") {
    return withInstall(
      <RiderShell title="Trip history" backTo="/rider-dashboard">
        <RiderRideHistory />
      </RiderShell>
    );
  }

  if (page === "rider-reviews") {
    return withInstall(
      <RiderShell title="Your reviews" backTo="/rider-dashboard">
        <RiderReviews />
      </RiderShell>
    );
  }

  if (page === "saved-places") {
    return withInstall(
      <RiderShell title="Saved places" backTo="/rider-dashboard">
        <SavedPlaces />
      </RiderShell>
    );
  }

  if (page === "rider-payments") {
    const isCompletedTrip = selectedRide?.status === "completed";
    return withInstall(
      <RiderShell
        title={isCompletedTrip ? "Rate your trip" : "Payments"}
        backTo="/rider-dashboard"
      >
        {selectedRide ? (
          isCompletedTrip ? (
            <PostRidePayRate ride={selectedRide} />
          ) : (
            <RiderPayments ride={selectedRide} />
          )
        ) : (
          <RiderPayments />
        )}
      </RiderShell>
    );
  }

  if (page === "delivery-customer") {
    return withInstall(<DeliveryCustomerApp />, { showNotifications: false });
  }

  if (page === "delivery-driver") {
    return withInstall(<DeliveryDashboard />, { showNotifications: false });
  }

  if (page === "delivery-profile-setup") {
    return withInstall(<DeliveryCourierProfileSetup />);
  }

  if (page === "delivery-vehicle-setup") {
    return withInstall(<DeliveryCourierProfileSetup />);
  }

  if (page === "delivery-account") {
    return withInstall(<DeliveryCourierProfile />);
  }

  if (page === "delivery-bank") {
    return withInstall(<DeliveryWallet />);
  }

  if (page === "delivery-wallet") {
    return withInstall(<DeliveryWallet />);
  }

  if (page === "delivery-earnings") {
    return withInstall(<DeliveryEarnings />);
  }

  if (page === "delivery-history") {
    return withInstall(<DeliveryHistory />);
  }

  if (page === "delivery-documents") {
    return withInstall(<DeliveryDocuments />);
  }

  if (page === "delivery-profile-edit") {
    return withInstall(<DeliveryCourierProfileEdit />);
  }

  if (page === "delivery-support") {
    return withInstall(<DeliveryCourierSupport />);
  }

  if (page === "delivery-settings") {
    return withInstall(<DeliveryCourierSettings />);
  }

  if (page === "delivery-courier-terms") {
    return withInstall(<DeliveryCourierTermsRoute />);
  }

  if (page === "delivery-courier-legal-sign") {
    return withInstall(<DeliveryCourierLegalSignRoute />);
  }

  if (page === "delivery-customer-terms") {
    return withInstall(<DeliveryCustomerTermsRoute />);
  }

  if (page === "delivery-customer-settings") {
    return withInstall(<DeliveryCustomerSettings />);
  }

  if (page === "delivery-admin") {
    window.location.replace("/admin?section=deliveries");
    return null;
  }

  if (page === "merchant") {
    return withInstall(<MerchantApp />);
  }

  if (page === "merchant-legal-sign") {
    return withInstall(<MerchantLegalSignRoute />);
  }

  if (page === "merchant-register") {
    return withInstall(
      <MerchantRegister onSuccess={() => { window.location.href = "/merchant/sign"; }} />,
      { showNotifications: false }
    );
  }

  if (page === "wallet") {
    return withInstall(<WalletPage onBack={() => { window.location.href = "/rider-dashboard"; }} />);
  }

  if (page === "admin-payments") {
    return withInstall(<AdminPaymentDashboard />);
  }

  if (page === "admin-executive") {
    return withInstall(<ExecutiveDashboard />);
  }

  if (page === "payment-setup") {
    return withInstall(
      <RiderShell title="Payment setup" backTo="/rider-dashboard">
        <div style={setupPageStyle}>
          <div style={setupCardStyle}>
            <h1 style={setupTitleStyle}>Add your payment method</h1>

            <p style={setupSubtitleStyle}>
              Add Card, Bank Account, Bankily, Masravi, Seddad, or Cash before
              requesting your first ride.
            </p>

            <AddPaymentMethod
              onCardSaved={() => setRefreshCards((prev) => prev + 1)}
            />

            <SavedPaymentMethods
              methods={paymentMethods}
              setMethods={setPaymentMethods}
              refreshKey={refreshCards}
            />

            <button
              onClick={() => {
                localStorage.removeItem("needs_payment_setup");
                window.location.href = "/rider";
              }}
              style={continueButtonStyle}
            >
              Continue
            </button>
          </div>
        </div>
      </RiderShell>
    );
  }

  if (page === "driver-vehicle-setup") {
    return withInstall(
      <div>
        <div style={setupPageStyle}>
          <div style={setupCardStyle}>
            <h1 style={setupTitleStyle}>🚗 Add Vehicle Information</h1>

            <p style={setupSubtitleStyle}>
              Add your vehicle and driver documents before going online.
            </p>

            <DriverSignup />

            <button
              onClick={() => {
                localStorage.removeItem("needs_vehicle_setup");
                window.location.href = "/driver";
              }}
              style={continueButtonStyle}
            >
              Continue to Driver App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (page === "rider") {
    return withInstall(<RiderApp />);
  }

  if (page === "rider-legal-accept") {
    return withInstall(<RiderLegalAcceptRoute />);
  }

  if (page === "driver-legal-sign") {
    return withInstall(<DriverLegalSignRoute />);
  }

  if (page === "driver") {
    if (!isTaxiDriverContext()) {
      window.location.replace("/delivery/courier");
      return null;
    }
    return withInstall(
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0B1220" }} />}>
        <LazyDriverDashboardNew />
      </Suspense>,
      { showNotifications: false }
    );
  }

  if (page === "driver-account") {
    return withInstall(
      <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#0B1220" }} />}>
        <LazyDriverProfilePage />
      </Suspense>
    );
  }

  if (page === "driver-premium-profile" || page === "driver-documents") {
    return withInstall(
      <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#eef3ef" }} />}>
        <LazyDriverProfilePage />
      </Suspense>
    );
  }

  if (page === "driver-code") {
    return withInstall(wrapDriverSecondaryPage("Driver Code", <LazyDriverCodePage />));
  }

  if (page === "driver-profile-edit") {
    return withInstall(
      <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#eef3ef" }} />}>
        <LazyDriverProfileEditPage />
      </Suspense>
    );
  }

  if (page === "driver-earnings") {
    return withInstall(wrapDriverSecondaryPage("Earnings", <LazyDriverEarnings />));
  }

  if (page === "driver-wallet") {
    return withInstall(wrapDriverSecondaryPage("Driver Wallet", <LazyDriverWallet />));
  }

  if (page === "driver-wallet-withdraw") {
    return withInstall(
      wrapDriverSecondaryPage("Cash Out", <LazyDriverWallet withdrawMode />, {
        backTo: "/driver/wallet",
      })
    );
  }

  if (page === "driver-hall-of-fame") {
    return withInstall(wrapDriverSecondaryPage("Hall of Fame", <LazyDriverHallOfFame />));
  }

  if (page === "driver-feedback") {
    return withInstall(wrapDriverSecondaryPage("Ratings", <LazyDriverFeedback />));
  }

  if (page === "driver-support") {
    return withInstall(wrapDriverSecondaryPage("Help", <LazyDriverSupport />));
  }

  if (page === "driver-achievements") {
    return withInstall(wrapDriverSecondaryPage("Achievements", <LazyDriverAchievements />));
  }

  if (page === "driver-history") {
    return withInstall(wrapDriverSecondaryPage("Ride History", <LazyDriverRideHistory />));
  }

  if (page === "driver-profile") {
    return withInstall(<DriverProfilePage />);
  }

  if (page === "share-booking") {
    return withInstall(<ShareBookingFlow />);
  }

  if (page === "share-ride") {
    const shareRideId = currentPath.match(/^\/ride\/share\/(\d+)$/)?.[1];
    return withInstall(<ShareRideScreen rideId={shareRideId} />);
  }

  if (page === "share-ride-complete") {
    const shareCompleteId = currentPath.match(/^\/ride\/share\/(\d+)\/complete$/)?.[1];
    return withInstall(<ShareRideComplete rideId={shareCompleteId} />);
  }

  if (page === "admin-share-analytics") {
    return withInstall(
      <div>
        <TopBar
          title={`${MARKET.brandName} Share Analytics`}
          goHome={goHome}
          logout={logout}
          minimalActions
        />
        <ShareAdminDashboard />
      </div>
    );
  }

  if (page === "admin") {
    return withInstall(<AdminDashboard />);
  }

  if (page === "settings") {
    if (isDeliveryCourierApp()) {
      window.location.replace("/delivery/settings");
      return null;
    }
    if (getAppType() === "driver") {
      return withInstall(wrapDriverSecondaryPage("Settings", <LazyDriverSettings />));
    }
    return withInstall(
      <RiderShell title="Settings" backTo="/rider-dashboard">
        <SettingsPageView riderMode onLogout={logout} />
      </RiderShell>
    );
  }

  if (page === "support") {
    if (getAppType() === "delivery" || isDeliveryCourierApp()) {
      return withInstall(<DeliveryCourierSupport />);
    }
    return withInstall(
      <RiderShell title="Help" backTo="/rider-dashboard">
        <SupportCenter variant="rider" />
      </RiderShell>
    );
  }

  if (page === "services") {
    return withInstall(
      <RiderShell title="Services" backTo="/rider-dashboard">
        <LaunchServices embedded />
      </RiderShell>
    );
  }

  if (["terms", "privacy"].includes(page)) {
    return withInstall(
      <div>
        <TopBar title={`${MARKET.brandName} ${page}`} goHome={goHome} logout={logout} />
        <LegalPage page={page} />
      </div>
    );
  }

  // Native apps: show login if not authenticated, show appropriate app if authenticated
  if (getAppType() !== 'web') {
    if (!sessionChecked) {
      return withInstall(<AuthLoadingScreen />);
    }

    const nativeMarketplacePages = new Set(["delivery-customer", "merchant", "merchant-register", "merchant-legal-sign"]);
    if (nativeMarketplacePages.has(page)) {
      if (page === "delivery-customer") {
        return withInstall(<DeliveryCustomerApp />, { showNotifications: false });
      }
      if (page === "merchant") return withInstall(<MerchantApp />);
      if (page === "merchant-legal-sign") return withInstall(<MerchantLegalSignRoute />);
      if (page === "merchant-register") {
        return withInstall(
          <MerchantRegister onSuccess={() => { window.location.href = "/merchant/sign"; }} />,
          { showNotifications: false }
        );
      }
    }

    if (!isAuthenticated) {
      return withInstall(<Login onLogin={handleLoginSuccess} />, { showNotifications: false });
    }

    if (isDeliveryNativeApp()) {
      markDeliveryCourierSession();
      return withInstall(<DeliveryDashboard />);
    }
    if (getAppType() === "driver" && isTaxiDriverContext()) {
      return withInstall(
        <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0B1220" }} />}>
          <LazyDriverDashboardNew />
        </Suspense>,
        { showNotifications: false }
      );
    }
    if (getAppType() === 'rider') {
      return withInstall(<RiderApp />);
    }
    if (getAppType() === 'admin') {
      return withInstall(<AdminDashboard />, { showNotifications: false });
    }
    return withInstall(<RiderApp />);
  }

  return withInstall(<LandingPage />);
}

function isProtectedPage(page) {
  return [
    "admin",
    "admin-share-analytics",
    "delivery-admin",
    "driver",
    "driver-profile",
    "driver-account",
    "driver-premium-profile",
    "driver-profile-edit",
    "driver-documents",
    "driver-code",
    "driver-earnings",
    "driver-wallet",
    "driver-wallet-withdraw",
    "driver-feedback",
    "driver-support",
    "driver-achievements",
    "driver-history",
    "delivery-driver",
    "delivery-profile-setup",
    "delivery-vehicle-setup",
    "delivery-account",
    "delivery-bank",
    "delivery-wallet",
    "delivery-earnings",
    "delivery-history",
    "delivery-documents",
    "delivery-profile-edit",
    "delivery-support",
    "delivery-settings",
    "delivery-courier-terms",
    "delivery-courier-legal-sign",
    "delivery-customer-terms",
    "delivery-customer-settings",
    "driver-vehicle-setup",
    "rider-legal-accept",
    "driver-legal-sign",
    "payment-setup",
    "rider",
    "rider-dashboard",
    "rider-history",
    "rider-ride-history",
    "rider-reviews",
    "saved-places",
    "rider-profile",
    "rider-payments",
    "delivery-customer",
    "merchant",
    "merchant-register",
    "merchant-legal-sign",
    "wallet",
    "admin-payments",
    "share-booking",
    "share-ride",
    "share-ride-complete",
    "settings",
    "services",
  ].includes(page);
}

function LoginRequiredRedirect({ path }) {
  useEffect(() => {
    const redirectPath = path && path !== "/login" ? path : getAppHomePath();
    localStorage.setItem("sx_login_redirect", redirectPath);
    window.location.replace(`/login?next=${encodeURIComponent(redirectPath)}`);
  }, [path]);

  return (
    <AuthLoadingScreen
      message="Your session expired. Opening secure login..."
      actionHref={`/login?next=${encodeURIComponent(path || getAppHomePath())}`}
      actionLabel="Open login"
    />
  );
}

function RoleAccessRedirect({ user }) {
  useEffect(() => {
    window.location.replace(getDashboardPath(user));
  }, [user]);

  return <AuthLoadingScreen message="Opening your dashboard..." />;
}

function AuthLoadingScreen({
  message = "Checking your secure session...",
  actionHref = "",
  actionLabel = "",
}) {
  return (
    <main style={authLoadingStyle}>
      <div style={authLoadingCardStyle}>
        <img src={getBrandLogoSrc()} alt={`${MARKET.brandName} logo`} style={authLoadingLogoStyle} />
        <h1 style={authLoadingTitleStyle}>{MARKET.brandName}</h1>
        <p style={authLoadingTextStyle}>{message}</p>
        {actionHref && (
          <a href={actionHref} style={authLoadingActionStyle}>
            {actionLabel}
          </a>
        )}
      </div>
    </main>
  );
}

function LandingPageOld() {
  const { t } = useTranslation();

  return (
    <main className="sx-landing">
      <LandingStyles />
      <SakhoNavbar />

      <section className="sx-hero">
        <div className="sx-gradient" />
        <div className="sx-hero-glow sx-hero-glow-one" />
        <div className="sx-hero-glow sx-hero-glow-two" />
        <div className="sx-hero-inner">
          <div className="sx-hero-copy">
            <span className="sx-eyebrow">{t("landing.eyebrow")}</span>
            <h1>{t("landing.title")}</h1>
            <p>{t("landing.subtitle")}</p>

            <div className="sx-cta-row">
              <button className="sx-primary-cta" onClick={() => (window.location.href = "/rider-dashboard")}>
                {t("landing.bookRide")}
              </button>
              <button className="sx-secondary-cta" onClick={() => (window.location.href = "/driver")}>
                {t("landing.startDriving")}
              </button>
            </div>

            <div className="sx-trust-row">
              <span>{t("landing.commission")}</span>
              <span>{t("landing.privateCall")}</span>
              <span>{t("landing.wallets")}</span>
            </div>

            <div className="sx-hero-metrics">
              <div>
                <strong>14+</strong>
                <span>{t("landing.cities")}</span>
              </div>
              <div>
                <strong>24/7</strong>
                <span>{t("landing.operations")}</span>
              </div>
              <div>
                <strong>3 apps</strong>
                <span>{t("landing.apps")}</span>
              </div>
            </div>
          </div>

          <PhoneMockup />
        </div>
      </section>

      <section className="sx-services">
        <div className="sx-section-heading">
          <span>{t("landing.onePlatform")}</span>
          <h2>{t("landing.servicesTitle")}</h2>
        </div>
        <div className="sx-card-grid">
          <ServiceCard
            title={t("landing.rideTitle")}
            text={t("landing.rideText")}
            path="/rider-dashboard"
          />
          <ServiceCard
            title={t("landing.deliveryTitle")}
            text={t("landing.deliveryText")}
            path="/rider-dashboard"
          />
          <ServiceCard
            title={t("landing.driverTitle")}
            text={t("landing.driverText")}
            path="/driver"
          />
        </div>
      </section>

      <DownloadSection />
      <SafetySection />
      <TestimonialsSection />
      <DriverSignupCTA />
      <LandingFooter />
    </main>
  );
}

function SakhoNavbar() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navItems = [
    { label: t("common.home"), path: "/" },
    { label: t("common.rider"), path: "/rider-dashboard" },
    { label: t("common.driver"), path: "/driver" },
    { label: t("common.settings"), path: "/settings" },
  ];

  const goTo = (path) => {
    setMenuOpen(false);
    window.location.href = path;
  };

  return (
    <header className="sakho-navbar-shell">
      <NavbarStyles />
      <nav className="sakho-navbar" aria-label="Main navigation">
        <button className="sakho-nav-logo" onClick={() => goTo("/")}>
          <img src={getBrandLogoSrc()} alt={`${MARKET.brandName} logo`} />
          <span>{t("common.brand")}</span>
        </button>

        <div className="sakho-nav-links">
          {navItems.map((item) => (
            <button key={item.path} onClick={() => goTo(item.path)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="sakho-nav-auth">
          <button className="sakho-login-link" onClick={() => goTo("/login")}>
            {t("common.login")}
          </button>
          <button className="sakho-register-link" onClick={() => goTo("/register")}>
            {t("common.register")}
          </button>
        </div>

        <button
          className={`sakho-menu-button ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((current) => !current)}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {menuOpen && (
        <div className="sakho-mobile-menu">
          {navItems.map((item) => (
            <button key={item.path} onClick={() => goTo(item.path)}>
              {item.label}
            </button>
          ))}
          <div className="sakho-mobile-auth">
            <button onClick={() => goTo("/login")}>{t("common.login")}</button>
            <button onClick={() => goTo("/register")}>{t("common.register")}</button>
          </div>
        </div>
      )}
    </header>
  );
}

function NavbarStyles() {
  return (
    <style>{`
      .sakho-navbar-shell {
        position: sticky;
        top: 12px;
        z-index: 100;
        width: min(1180px, calc(100% - 28px));
        margin: 12px auto 0;
      }

      .sakho-navbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        min-height: 68px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 22px;
        background: rgba(5, 7, 13, 0.78);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
        backdrop-filter: blur(22px);
      }

      .sakho-nav-logo,
      .sakho-nav-links button,
      .sakho-nav-auth button,
      .sakho-menu-button,
      .sakho-mobile-menu button {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .sakho-nav-logo {
        display: inline-flex;
        align-items: center;
        gap: 11px;
        min-width: 0;
        background: transparent;
        color: #fff;
        font-weight: 950;
      }

      .sakho-nav-logo img {
        width: 46px;
        height: 46px;
        border-radius: 14px;
        object-fit: cover;
        box-shadow: 0 0 0 1px rgba(0, 166, 81, 0.34);
      }

      .sakho-nav-logo span {
        white-space: nowrap;
      }

      .sakho-nav-links {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
      }

      .sakho-nav-links button,
      .sakho-login-link {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        background: transparent;
        color: rgba(255, 255, 255, 0.78);
        font-size: 14px;
        font-weight: 850;
        transition: background 180ms ease, color 180ms ease, transform 180ms ease;
      }

      .sakho-nav-links button:hover,
      .sakho-login-link:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        transform: translateY(-1px);
      }

      .sakho-nav-auth {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sakho-register-link {
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        background: #fff;
        color: #070a12;
        font-weight: 950;
        box-shadow: 0 14px 34px rgba(255, 255, 255, 0.18);
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .sakho-register-link:hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 44px rgba(255, 255, 255, 0.24);
      }

      .sakho-menu-button {
        display: none;
        width: 46px;
        height: 46px;
        place-items: center;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.1);
      }

      .sakho-menu-button span {
        display: block;
        width: 20px;
        height: 2px;
        margin: 3px auto;
        border-radius: 999px;
        background: #fff;
        transition: transform 180ms ease, opacity 180ms ease;
      }

      .sakho-menu-button.open span:nth-child(1) {
        transform: translateY(5px) rotate(45deg);
      }

      .sakho-menu-button.open span:nth-child(2) {
        opacity: 0;
      }

      .sakho-menu-button.open span:nth-child(3) {
        transform: translateY(-5px) rotate(-45deg);
      }

      .sakho-mobile-menu {
        display: none;
      }

      @media (max-width: 860px) {
        .sakho-navbar-shell {
          top: 8px;
          width: calc(100% - 20px);
          margin-top: 8px;
        }

        .sakho-nav-links,
        .sakho-nav-auth {
          display: none;
        }

        .sakho-menu-button {
          display: grid;
        }

        .sakho-mobile-menu {
          display: grid;
          gap: 8px;
          margin-top: 10px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 22px;
          background: rgba(5, 7, 13, 0.92);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
          backdrop-filter: blur(22px);
        }

        .sakho-mobile-menu button {
          min-height: 48px;
          padding: 0 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
          text-align: left;
          font-weight: 900;
        }

        .sakho-mobile-auth {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 4px;
        }

        .sakho-mobile-auth button:last-child {
          background: #fff;
          color: #070a12;
          text-align: center;
        }

        .sakho-mobile-auth button:first-child {
          text-align: center;
        }
      }

      @media (max-width: 460px) {
        .sakho-nav-logo span {
          max-width: 142px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sakho-navbar {
          min-height: 64px;
          border-radius: 18px;
        }
      }
    `}</style>
  );
}

function PhoneMockup() {
  const { t } = useTranslation();

  return (
    <div className="sx-phone-wrap" aria-label="Yala app previews">
      <div className="sx-mini-phone sx-mini-driver">
        <span>{t("common.driver")}</span>
        <strong>7,278 MRU</strong>
        <small>Today online</small>
        <div className="sx-mini-bars">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <div className="sx-phone">
        <div className="sx-phone-top">
          <span>9:41</span>
          <strong>Online</strong>
        </div>
        <div className="sx-map-preview">
          <div className="sx-road sx-road-one" />
          <div className="sx-road sx-road-two" />
          <div className="sx-road sx-road-three" />
          <div className="sx-route-line" />
          <span className="sx-pin sx-pickup" />
          <span className="sx-pin sx-dropoff" />
          <div className="sx-driver-dot">S</div>
        </div>
        <div className="sx-phone-sheet">
          <span className="sx-sheet-handle" />
          <strong>3 min pickup</strong>
          <p>Arafat to Tevragh Zeina</p>
          <div className="sx-fare-row">
            <span>Regular</span>
            <strong>330 MRU</strong>
          </div>
          <button onClick={() => (window.location.href = "/rider-dashboard")}>
            {t("dashboard.requestRide")}
          </button>
        </div>
      </div>

      <div className="sx-mini-phone sx-mini-admin">
        <span>{t("common.admin")}</span>
        <strong>Live ops</strong>
        <small>Approve drivers, monitor rides</small>
        <div className="sx-mini-status">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ title, text, path }) {
  return (
    <button className="sx-service-card" onClick={() => (window.location.href = path)}>
      <span>{title.slice(0, 1)}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </button>
  );
}

function DownloadSection() {
  const { t } = useTranslation();

  return (
    <section className="sx-download">
      <div>
        <span className="sx-eyebrow">{t("landing.downloadEyebrow")}</span>
        <h2>{t("landing.downloadTitle")}</h2>
        <p>{t("landing.downloadText")}</p>
      </div>
      <div className="sx-download-actions">
        <button onClick={() => (window.location.href = "/rider-dashboard")}>{t("landing.riderApp")}</button>
        <button onClick={() => (window.location.href = "/driver")}>{t("landing.driverApp")}</button>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  const { t } = useTranslation();
  const testimonials = [
    {
      quote: "The driver app feels clear. I can see trips, earnings, and payouts without confusion.",
      name: "Moussa",
      role: "Driver partner",
    },
    {
      quote: "I like that payment, safety, and driver information are all in one place.",
      name: "Aminata",
      role: "Rider",
    },
    {
      quote: "The admin dashboard gives the control needed to approve drivers and watch the market.",
      name: "Yala",
      role: "Operations team",
    },
  ];

  return (
    <section className="sx-testimonials">
      <div className="sx-section-heading">
        <span>{t("landing.testimonialsEyebrow")}</span>
        <h2>{t("landing.testimonialsTitle")}</h2>
      </div>
      <div className="sx-testimonial-grid">
        {testimonials.map((item) => (
          <article key={item.name}>
            <p>"{item.quote}"</p>
            <div>
              <strong>{item.name}</strong>
              <span>{item.role}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SafetySection() {
  const { t } = useTranslation();

  return (
    <section className="sx-safety">
      <div className="sx-section-heading">
        <span>{t("landing.safetyEyebrow")}</span>
        <h2>{t("landing.safetyTitle")}</h2>
      </div>
      <div className="sx-safety-grid">
        <article>
          <strong>{t("landing.verifiedTitle")}</strong>
          <p>{t("landing.verifiedText")}</p>
        </article>
        <article>
          <strong>{t("landing.privateCallingTitle")}</strong>
          <p>{t("landing.privateCallingText")}</p>
        </article>
        <article>
          <strong>{t("landing.emergencyTitle")}</strong>
          <p>{t("landing.emergencyText")}</p>
        </article>
      </div>
    </section>
  );
}

function DriverSignupCTA() {
  const { t } = useTranslation();

  return (
    <section className="sx-driver-cta">
      <div>
        <span className="sx-eyebrow">{t("landing.driverCtaEyebrow")}</span>
        <h2>{t("landing.driverCtaTitle")}</h2>
        <p>{t("landing.driverCtaText")}</p>
      </div>
      <button onClick={() => (window.location.href = "/register")}>{t("landing.applyDrive")}</button>
    </section>
  );
}

function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="sx-footer">
      <div>
        <img src={getBrandLogoSrc()} alt={`${MARKET.brandName} logo`} />
        <strong>{MARKET.brandName}</strong>
      </div>
      <div className="sx-footer-links">
        <button onClick={() => (window.location.href = "/terms")}>{t("common.terms")}</button>
        <button onClick={() => (window.location.href = "/privacy")}>{t("common.privacy")}</button>
        <button onClick={() => (window.location.href = "/support")}>{t("common.support")}</button>
        <button onClick={() => (window.location.href = "/settings")}>{t("common.settings")}</button>
      </div>
    </footer>
  );
}

function LandingStyles() {
  return (
    <style>{`
      .sx-landing {
        min-height: 100vh;
        overflow-x: hidden;
        background: #03050a;
        color: #f8fafc;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
      }

      .sx-landing * {
        box-sizing: border-box;
      }

      .sx-navbar {
        position: fixed;
        top: 18px;
        left: 50%;
        z-index: 50;
        display: flex;
        width: min(1180px, calc(100% - 32px));
        transform: translateX(-50%);
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        background: rgba(5, 7, 13, 0.72);
        box-shadow: 0 22px 70px rgba(0, 0, 0, 0.36);
        backdrop-filter: blur(22px);
      }

      .sx-nav-brand,
      .sx-nav-links button,
      .sx-auth-actions button,
      .sx-primary-cta,
      .sx-secondary-cta,
      .sx-service-card,
      .sx-download-actions button,
      .sx-footer-links button,
      .sx-phone-sheet button {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .sx-nav-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        background: transparent;
        color: #fff;
        font-weight: 850;
      }

      .sx-nav-brand img,
      .sx-footer img {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        object-fit: cover;
        box-shadow: 0 0 0 1px rgba(0, 166, 81, 0.28);
      }

      .sx-nav-links {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
      }

      .sx-nav-links button,
      .sx-auth-ghost,
      .sx-footer-links button {
        border-radius: 999px;
        background: transparent;
        color: rgba(255, 255, 255, 0.78);
        font-size: 14px;
        font-weight: 750;
        transition: color 180ms ease, background 180ms ease, transform 180ms ease;
      }

      .sx-nav-links button {
        padding: 9px 13px;
      }

      .sx-nav-links button:hover,
      .sx-auth-ghost:hover,
      .sx-footer-links button:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-1px);
      }

      .sx-auth-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .sx-auth-ghost,
      .sx-auth-solid {
        padding: 10px 16px;
      }

      .sx-auth-solid {
        border-radius: 999px;
        background: #fff;
        color: #05060a;
        font-weight: 850;
        box-shadow: 0 12px 30px rgba(255, 255, 255, 0.18);
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .sx-auth-solid:hover,
      .sx-primary-cta:hover,
      .sx-secondary-cta:hover,
      .sx-download-actions button:hover,
      .sx-phone-sheet button:hover {
        transform: translateY(-2px);
      }

      .sx-hero {
        position: relative;
        min-height: 780px;
        padding: 150px 24px 92px;
        background:
          radial-gradient(circle at 10% 10%, rgba(234, 179, 8, 0.18), transparent 28%),
          radial-gradient(circle at 88% 16%, rgba(220, 38, 38, 0.2), transparent 30%),
          linear-gradient(135deg, #03050a 0%, #080b12 45%, #040407 100%);
      }

      .sx-hero::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        bottom: -1px;
        height: 140px;
        background: linear-gradient(180deg, transparent, #03050a);
        pointer-events: none;
      }

      .sx-gradient {
        position: absolute;
        inset: -22%;
        opacity: 0.72;
        background:
          linear-gradient(115deg, transparent 0 18%, rgba(16, 185, 129, 0.2) 28%, transparent 42%),
          linear-gradient(245deg, transparent 0 22%, rgba(0, 166, 81, 0.24) 34%, transparent 48%),
          radial-gradient(circle at 55% 35%, rgba(168, 85, 247, 0.16), transparent 28%);
        filter: blur(34px);
        animation: sxGradientShift 12s ease-in-out infinite alternate;
      }

      .sx-hero-glow {
        position: absolute;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        opacity: 0.54;
        filter: blur(28px);
        animation: sxPulseGlow 7s ease-in-out infinite;
      }

      .sx-hero-glow-one {
        left: 8%;
        bottom: 18%;
        background: rgba(22, 163, 74, 0.28);
      }

      .sx-hero-glow-two {
        top: 18%;
        right: 16%;
        background: rgba(0, 166, 81, 0.32);
        animation-delay: -2.4s;
      }

      .sx-hero-inner {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.8fr);
        gap: 56px;
        align-items: center;
        width: min(1180px, 100%);
        margin: 0 auto;
      }

      .sx-hero-copy {
        max-width: 680px;
      }

      .sx-eyebrow,
      .sx-section-heading span {
        display: inline-flex;
        align-items: center;
        width: max-content;
        max-width: 100%;
        margin-bottom: 18px;
        padding: 8px 12px;
        border: 1px solid rgba(0, 166, 81, 0.24);
        border-radius: 999px;
        background: rgba(0, 166, 81, 0.08);
        color: #00A651;
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .sx-hero h1 {
        margin: 0;
        max-width: 760px;
        color: #fff;
        font-size: clamp(46px, 7vw, 86px);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .sx-hero-copy p,
      .sx-download p,
      .sx-service-card p,
      .sx-safety article p,
      .sx-phone-sheet p {
        color: rgba(248, 250, 252, 0.68);
        line-height: 1.65;
      }

      .sx-hero-copy > p {
        max-width: 640px;
        margin: 24px 0 0;
        font-size: 18px;
      }

      .sx-cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 34px;
      }

      .sx-primary-cta,
      .sx-secondary-cta,
      .sx-download-actions button {
        min-height: 54px;
        padding: 0 24px;
        border-radius: 999px;
        font-weight: 900;
        transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
      }

      .sx-primary-cta {
        background: linear-gradient(135deg, #00A651, #00A651);
        color: #111827;
        box-shadow: 0 22px 45px rgba(0, 166, 81, 0.28);
      }

      .sx-primary-cta:hover {
        box-shadow: 0 28px 55px rgba(0, 166, 81, 0.36);
      }

      .sx-secondary-cta {
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      .sx-secondary-cta:hover {
        background: rgba(255, 255, 255, 0.14);
      }

      .sx-trust-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 30px;
      }

      .sx-trust-row span {
        padding: 9px 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.72);
        font-size: 13px;
        font-weight: 800;
      }

      .sx-hero-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        max-width: 620px;
        margin-top: 30px;
      }

      .sx-hero-metrics div {
        min-height: 96px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(18px);
      }

      .sx-hero-metrics strong {
        display: block;
        color: #fff;
        font-size: 28px;
      }

      .sx-hero-metrics span {
        display: block;
        margin-top: 5px;
        color: rgba(248, 250, 252, 0.62);
        font-size: 13px;
        font-weight: 750;
      }

      .sx-phone-wrap {
        position: relative;
        justify-self: end;
        perspective: 1100px;
      }

      .sx-phone {
        position: relative;
        width: min(360px, 82vw);
        min-height: 680px;
        overflow: hidden;
        border: 10px solid #0b0d12;
        border-radius: 42px;
        background: #f4f5f0;
        color: #10131a;
        box-shadow:
          0 44px 90px rgba(0, 0, 0, 0.52),
          inset 0 0 0 1px rgba(255, 255, 255, 0.2);
        transform: rotateX(3deg) rotateY(-10deg);
        animation: sxFloat 5.8s ease-in-out infinite;
      }

      .sx-mini-phone {
        position: absolute;
        z-index: 5;
        width: 170px;
        min-height: 182px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 26px;
        background: rgba(10, 13, 20, 0.82);
        color: #fff;
        box-shadow: 0 28px 60px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(18px);
        animation: sxMiniFloat 6.4s ease-in-out infinite;
      }

      .sx-mini-phone span,
      .sx-mini-phone small {
        color: rgba(248, 250, 252, 0.68);
        font-weight: 850;
      }

      .sx-mini-phone strong {
        display: block;
        margin: 12px 0 4px;
        font-size: 22px;
      }

      .sx-mini-driver {
        left: -94px;
        top: 86px;
      }

      .sx-mini-admin {
        right: -70px;
        bottom: 126px;
        animation-delay: -2s;
      }

      .sx-mini-bars {
        display: flex;
        align-items: end;
        gap: 7px;
        height: 54px;
        margin-top: 18px;
      }

      .sx-mini-bars i {
        display: block;
        flex: 1;
        border-radius: 999px;
        background: linear-gradient(180deg, #00A651, #16a34a);
      }

      .sx-mini-bars i:nth-child(1) { height: 30%; }
      .sx-mini-bars i:nth-child(2) { height: 66%; }
      .sx-mini-bars i:nth-child(3) { height: 48%; }
      .sx-mini-bars i:nth-child(4) { height: 88%; }

      .sx-mini-status {
        display: grid;
        gap: 9px;
        margin-top: 18px;
      }

      .sx-mini-status i {
        display: block;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.15);
        overflow: hidden;
      }

      .sx-mini-status i::before {
        content: "";
        display: block;
        height: 100%;
        width: 72%;
        border-radius: inherit;
        background: #16a34a;
      }

      .sx-phone-top {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        z-index: 4;
        display: flex;
        justify-content: space-between;
        padding: 18px 22px;
        font-weight: 900;
      }

      .sx-phone-top strong {
        color: #047857;
      }

      .sx-map-preview {
        position: absolute;
        inset: 0;
        overflow: hidden;
        background:
          linear-gradient(90deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
          linear-gradient(0deg, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
          #e8ebe4;
        background-size: 48px 48px;
      }

      .sx-road {
        position: absolute;
        height: 12px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.6);
        box-shadow: 0 0 0 5px rgba(255, 255, 255, 0.58);
      }

      .sx-road-one {
        top: 155px;
        left: -45px;
        width: 440px;
        transform: rotate(32deg);
      }

      .sx-road-two {
        top: 320px;
        right: -80px;
        width: 520px;
        transform: rotate(-25deg);
      }

      .sx-road-three {
        top: 110px;
        right: 70px;
        width: 390px;
        transform: rotate(92deg);
      }

      .sx-route-line {
        position: absolute;
        left: 158px;
        top: 128px;
        width: 88px;
        height: 285px;
        border: 7px solid #111827;
        border-left: 0;
        border-bottom: 0;
        border-radius: 0 58px 0 0;
        transform: rotate(8deg);
      }

      .sx-pin {
        position: absolute;
        width: 22px;
        height: 22px;
        border: 5px solid #fff;
        border-radius: 999px;
        box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24);
      }

      .sx-pickup {
        left: 134px;
        top: 126px;
        background: #16a34a;
      }

      .sx-dropoff {
        right: 95px;
        top: 380px;
        background: #dc2626;
      }

      .sx-driver-dot {
        position: absolute;
        left: 182px;
        top: 262px;
        display: grid;
        width: 48px;
        height: 48px;
        place-items: center;
        border: 4px solid #fff;
        border-radius: 18px;
        background: #020617;
        color: #00A651;
        font-weight: 950;
        box-shadow: 0 18px 30px rgba(0, 0, 0, 0.28);
      }

      .sx-phone-sheet {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 3;
        padding: 16px 18px 20px;
        border-radius: 30px 30px 0 0;
        background: rgba(255, 255, 255, 0.96);
        box-shadow: 0 -22px 45px rgba(15, 23, 42, 0.14);
      }

      .sx-sheet-handle {
        display: block;
        width: 44px;
        height: 5px;
        margin: 0 auto 14px;
        border-radius: 999px;
        background: #cbd5e1;
      }

      .sx-phone-sheet strong {
        font-size: 23px;
        letter-spacing: 0;
      }

      .sx-phone-sheet p {
        margin: 4px 0 14px;
        color: #64748b;
      }

      .sx-fare-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding: 13px 14px;
        border-radius: 18px;
        background: #f1f5f9;
      }

      .sx-fare-row strong {
        font-size: 18px;
      }

      .sx-phone-sheet button {
        width: 100%;
        min-height: 50px;
        border-radius: 16px;
        background: #05060a;
        color: #fff;
        font-weight: 900;
        transition: transform 180ms ease, background 180ms ease;
      }

      .sx-phone-sheet button:hover {
        background: #111827;
      }

      .sx-services,
      .sx-download,
      .sx-safety,
      .sx-testimonials,
      .sx-driver-cta,
      .sx-footer {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
      }

      .sx-services,
      .sx-safety,
      .sx-testimonials {
        padding: 88px 0;
      }

      .sx-section-heading {
        max-width: 720px;
        margin-bottom: 32px;
      }

      .sx-section-heading h2,
      .sx-download h2 {
        margin: 0;
        color: #fff;
        font-size: clamp(32px, 4vw, 54px);
        line-height: 1.02;
        letter-spacing: 0;
      }

      .sx-card-grid,
      .sx-safety-grid,
      .sx-testimonial-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
      }

      .sx-service-card,
      .sx-safety article,
      .sx-testimonial-grid article {
        min-height: 230px;
        padding: 26px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 28px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.095), rgba(255, 255, 255, 0.035)),
          #090d14;
        text-align: left;
        transition: transform 200ms ease, border-color 200ms ease, background 200ms ease;
      }

      .sx-service-card:hover,
      .sx-testimonial-grid article:hover {
        transform: translateY(-6px);
        border-color: rgba(0, 166, 81, 0.38);
        background:
          linear-gradient(180deg, rgba(0, 166, 81, 0.14), rgba(255, 255, 255, 0.045)),
          #090d14;
      }

      .sx-service-card span {
        display: grid;
        width: 48px;
        height: 48px;
        margin-bottom: 34px;
        place-items: center;
        border-radius: 16px;
        background: #00A651;
        color: #111827;
        font-weight: 950;
      }

      .sx-service-card h3 {
        margin: 0 0 10px;
        color: #fff;
        font-size: 26px;
      }

      .sx-service-card p,
      .sx-safety article p,
      .sx-testimonial-grid article p,
      .sx-driver-cta p {
        margin: 0;
      }

      .sx-testimonial-grid article {
        min-height: 260px;
        display: grid;
        align-content: space-between;
      }

      .sx-testimonial-grid article p {
        color: rgba(248, 250, 252, 0.78);
        font-size: 18px;
        line-height: 1.65;
      }

      .sx-testimonial-grid article strong {
        display: block;
        color: #fff;
        margin-bottom: 5px;
      }

      .sx-testimonial-grid article span {
        color: #00A651;
        font-weight: 850;
      }

      .sx-download {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 32px;
        align-items: center;
        padding: 48px;
        border: 1px solid rgba(0, 166, 81, 0.22);
        border-radius: 34px;
        background:
          radial-gradient(circle at 15% 0%, rgba(0, 166, 81, 0.22), transparent 30%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04));
        box-shadow: 0 34px 80px rgba(0, 0, 0, 0.24);
      }

      .sx-download p {
        max-width: 640px;
        margin: 18px 0 0;
      }

      .sx-download-actions {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 180px;
      }

      .sx-download-actions button:first-child {
        background: #fff;
        color: #020617;
      }

      .sx-download-actions button:last-child {
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
      }

      .sx-safety article {
        min-height: 180px;
      }

      .sx-safety article strong {
        display: block;
        margin-bottom: 12px;
        color: #fff;
        font-size: 20px;
      }

      .sx-driver-cta {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 28px;
        align-items: center;
        margin-bottom: 74px;
        padding: 52px;
        border: 1px solid rgba(22, 163, 74, 0.26);
        border-radius: 34px;
        background:
          radial-gradient(circle at 84% 22%, rgba(22, 163, 74, 0.28), transparent 28%),
          linear-gradient(135deg, rgba(255, 255, 255, 0.105), rgba(255, 255, 255, 0.035)),
          #07100d;
        box-shadow: 0 34px 80px rgba(0, 0, 0, 0.26);
      }

      .sx-driver-cta h2 {
        margin: 0;
        max-width: 760px;
        color: #fff;
        font-size: clamp(32px, 4vw, 56px);
        line-height: 1.02;
      }

      .sx-driver-cta p {
        max-width: 690px;
        margin-top: 18px;
        color: rgba(248, 250, 252, 0.68);
        line-height: 1.7;
      }

      .sx-driver-cta button {
        min-height: 58px;
        padding: 0 28px;
        border: 0;
        border-radius: 999px;
        background: #fff;
        color: #05110b;
        font: inherit;
        font-weight: 950;
        cursor: pointer;
        box-shadow: 0 18px 44px rgba(255, 255, 255, 0.18);
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .sx-driver-cta button:hover {
        transform: translateY(-2px);
        box-shadow: 0 26px 58px rgba(255, 255, 255, 0.24);
      }

      .sx-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 34px 0 46px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .sx-footer > div:first-child {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #fff;
        font-size: 18px;
      }

      .sx-footer-links {
        display: flex;
        gap: 8px;
      }

      .sx-footer-links button {
        padding: 10px 14px;
      }

      @keyframes sxGradientShift {
        from {
          transform: translate3d(-2%, -1%, 0) scale(1);
        }
        to {
          transform: translate3d(2%, 3%, 0) scale(1.08);
        }
      }

      @keyframes sxFloat {
        0%, 100% {
          transform: rotateX(3deg) rotateY(-10deg) translateY(0);
        }
        50% {
          transform: rotateX(3deg) rotateY(-10deg) translateY(-16px);
        }
      }

      @keyframes sxMiniFloat {
        0%, 100% {
          transform: translateY(0) rotate(-3deg);
        }
        50% {
          transform: translateY(-18px) rotate(2deg);
        }
      }

      @keyframes sxPulseGlow {
        0%, 100% {
          transform: scale(0.95);
          opacity: 0.42;
        }
        50% {
          transform: scale(1.12);
          opacity: 0.7;
        }
      }

      @media (max-width: 940px) {
        .sx-navbar {
          top: 10px;
          width: calc(100% - 20px);
        }

        .sx-nav-links {
          display: none;
        }

        .sx-hero {
          min-height: auto;
          padding: 116px 18px 70px;
        }

        .sx-hero-inner {
          grid-template-columns: 1fr;
          gap: 46px;
        }

        .sx-phone-wrap {
          justify-self: center;
        }

        .sx-phone {
          min-height: 610px;
          transform: none;
        }

        .sx-mini-driver {
          left: -10px;
          top: 26px;
        }

        .sx-mini-admin {
          right: -8px;
          bottom: 90px;
        }

        .sx-card-grid,
        .sx-safety-grid,
        .sx-testimonial-grid {
          grid-template-columns: 1fr;
        }

        .sx-download,
        .sx-driver-cta {
          grid-template-columns: 1fr;
          padding: 30px;
        }

        .sx-download-actions {
          flex-direction: row;
          flex-wrap: wrap;
        }
      }

      @media (max-width: 560px) {
        .sx-navbar {
          border-radius: 16px;
        }

        .sx-nav-brand span {
          max-width: 124px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sx-auth-actions {
          gap: 4px;
        }

        .sx-auth-ghost,
        .sx-auth-solid {
          padding: 9px 11px;
          font-size: 13px;
        }

        .sx-hero h1 {
          font-size: 44px;
        }

        .sx-hero-copy > p {
          font-size: 16px;
        }

        .sx-primary-cta,
        .sx-secondary-cta,
        .sx-download-actions button,
        .sx-driver-cta button {
          width: 100%;
        }

        .sx-hero-metrics {
          grid-template-columns: 1fr;
        }

        .sx-phone {
          width: min(330px, 100%);
          min-height: 580px;
          border-width: 8px;
          border-radius: 34px;
        }

        .sx-services,
        .sx-safety,
        .sx-testimonials {
          padding: 64px 0;
        }

        .sx-service-card,
        .sx-safety article,
        .sx-testimonial-grid article {
          border-radius: 22px;
          padding: 22px;
        }

        .sx-download {
          border-radius: 24px;
          padding: 24px;
        }

        .sx-mini-phone {
          position: relative;
          left: auto;
          right: auto;
          top: auto;
          bottom: auto;
          width: 100%;
          margin-bottom: 12px;
          animation: none;
        }

        .sx-phone-wrap {
          display: grid;
          width: min(330px, 100%);
          gap: 10px;
        }

        .sx-footer {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `}</style>
  );
}

// Kept temporarily for reference while /settings uses frontend/src/settings/SettingsPage.js.
// eslint-disable-next-line no-unused-vars
function SettingsPage({ logout }) {
  const user = getStoredUser();
  const [language, setLanguage] = useState(localStorage.getItem("sx_language") || "English");
  const [theme, setTheme] = useState(localStorage.getItem("sx_theme") || "Dark");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem("sx_notifications") !== "off"
  );

  const saveLanguage = (value) => {
    setLanguage(value);
    localStorage.setItem("sx_language", value);
  };

  const saveTheme = (value) => {
    setTheme(value);
    localStorage.setItem("sx_theme", value);
  };

  const toggleNotifications = () => {
    const nextValue = !notificationsEnabled;
    setNotificationsEnabled(nextValue);
    localStorage.setItem("sx_notifications", nextValue ? "on" : "off");
  };

  const settingsOptions = [
    {
      title: "Profile",
      text: "Name, phone, photo, identity, and account details.",
      value: user?.email || user?.phone || "Manage account",
      action: () => (window.location.href = "/rider-dashboard"),
    },
    {
      title: "Safety & Emergency",
      text: "Emergency contacts, private calls, trip sharing, and safety rules.",
      value: "Police 117",
      action: () => (window.location.href = "/support"),
    },
    {
      title: "Payment Methods",
      text: "Card, cash, Bankily, Masravi, Seddad, and bank account options.",
      value: "Manage",
      action: () => (window.location.href = "/rider-payments"),
    },
    {
      title: "Privacy",
      text: "Location, data protection, phone privacy, and platform policies.",
      value: "View policy",
      action: () => (window.location.href = "/privacy"),
    },
    {
      title: "Help & Support",
      text: "Trip issues, payments, blocked accounts, documents, and payout help.",
      value: "Open help",
      action: () => (window.location.href = "/support"),
    },
  ];

  return (
    <main className={`settings-page settings-${theme.toLowerCase()}`}>
      <SettingsStyles />
      <SakhoNavbar />

      <section className="settings-hero">
        <div>
          <span className="settings-kicker">Account center</span>
          <h1>Settings</h1>
          <p>
            Manage your Yala profile, language, safety, notifications, payments,
            privacy, and support preferences from one professional control center.
          </p>
        </div>
        <div className="settings-profile-card">
          <img src={getBrandLogoSrc()} alt={`${MARKET.brandName} account`} />
          <div>
            <strong>{user?.first_name || user?.name || MARKET.brandName}</strong>
            <span>{user?.email || "Mobility account"}</span>
          </div>
        </div>
      </section>

      <section className="settings-grid">
        <article className="settings-panel settings-control-panel">
          <div className="settings-panel-heading">
            <span>Preferences</span>
            <h2>App experience</h2>
          </div>

          <div className="settings-control">
            <div>
              <strong>Language</strong>
              <span>Choose the language used in the app.</span>
            </div>
            <div className="settings-segmented">
              {["English", "French", "Arabic"].map((item) => (
                <button
                  key={item}
                  className={language === item ? "active" : ""}
                  onClick={() => saveLanguage(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-control">
            <div>
              <strong>Theme</strong>
              <span>Switch between a bright or dark app style.</span>
            </div>
            <div className="settings-segmented compact">
              {["Light", "Dark"].map((item) => (
                <button
                  key={item}
                  className={theme === item ? "active" : ""}
                  onClick={() => saveTheme(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-control">
            <div>
              <strong>Notifications</strong>
              <span>Ride requests, trip updates, payments, and support alerts.</span>
            </div>
            <button
              className={`settings-toggle ${notificationsEnabled ? "on" : ""}`}
              onClick={toggleNotifications}
              aria-label="Toggle notifications"
            >
              <span />
            </button>
          </div>
        </article>

        <article className="settings-panel">
          <div className="settings-panel-heading">
            <span>Quick access</span>
            <h2>Manage account</h2>
          </div>
          <div className="settings-list">
            {settingsOptions.map((item) => (
              <button key={item.title} onClick={item.action}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </div>
                <em>{item.value}</em>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="settings-emergency">
        <div>
          <span className="settings-kicker">Safety & Emergency</span>
          <h2>Fast help when it matters.</h2>
          <p>Emergency numbers stay close for riders, drivers, and admin operations.</p>
        </div>
        <div className="settings-emergency-links">
          {MARKET.emergencyNumbers.map((item) => (
            <a key={item.number} href={`tel:${item.number}`} title={item.description}>
              <span>{item.label}</span>
              <strong>{item.number}</strong>
            </a>
          ))}
        </div>
      </section>

      <section className="settings-logout-panel">
        <div>
          <strong>Logout</strong>
          <span>Sign out from this device and return to the landing page.</span>
        </div>
        <button onClick={logout}>Log out</button>
        <button
          type="button"
          onClick={async () => {
            try {
              const access = localStorage.getItem("access");
              if (access) {
                await fetch(`${API_URL}/auth/logout-all-devices/`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${access}`,
                    "Content-Type": "application/json",
                  },
                });
              }
            } catch (error) {
              // Still clear local session even if remote revoke fails.
            }
            logout();
          }}
        >
          Log out all devices
        </button>
      </section>
    </main>
  );
}

function SettingsStyles() {
  return (
    <style>{`
      .settings-page {
        min-height: 100vh;
        padding: 22px;
        font-family: Inter, "SF Pro Display", "Segoe UI", Arial, sans-serif;
        transition: background 220ms ease, color 220ms ease;
      }

      .settings-page * {
        box-sizing: border-box;
      }

      .settings-dark {
        background:
          radial-gradient(circle at 12% 10%, rgba(0, 166, 81, 0.16), transparent 26%),
          radial-gradient(circle at 88% 12%, rgba(21, 128, 61, 0.18), transparent 28%),
          #05070c;
        color: #f8fafc;
      }

      .settings-light {
        background:
          radial-gradient(circle at 12% 10%, rgba(0, 166, 81, 0.2), transparent 26%),
          #f5f7fb;
        color: #0f172a;
      }

      .settings-nav,
      .settings-hero,
      .settings-grid,
      .settings-emergency,
      .settings-logout-panel {
        width: min(1120px, 100%);
        margin-left: auto;
        margin-right: auto;
      }

      .settings-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        background: rgba(8, 11, 18, 0.74);
        box-shadow: 0 20px 54px rgba(0, 0, 0, 0.18);
        backdrop-filter: blur(18px);
      }

      .settings-light .settings-nav {
        border-color: rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.82);
      }

      .settings-brand,
      .settings-nav-actions button,
      .settings-segmented button,
      .settings-list button,
      .settings-toggle,
      .settings-logout-panel button {
        border: 0;
        font: inherit;
        cursor: pointer;
      }

      .settings-brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        background: transparent;
        color: inherit;
        font-weight: 900;
      }

      .settings-brand img,
      .settings-profile-card img {
        width: 44px;
        height: 44px;
        border-radius: 13px;
        object-fit: cover;
      }

      .settings-nav-actions {
        display: flex;
        gap: 8px;
      }

      .settings-nav-actions button {
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: inherit;
        font-weight: 850;
        transition: transform 180ms ease, background 180ms ease;
      }

      .settings-light .settings-nav-actions button {
        background: rgba(15, 23, 42, 0.06);
      }

      .settings-nav-actions button:hover,
      .settings-list button:hover,
      .settings-logout-panel button:hover {
        transform: translateY(-2px);
      }

      .settings-hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 24px;
        align-items: end;
        padding: 70px 0 32px;
      }

      .settings-kicker,
      .settings-panel-heading span {
        display: inline-flex;
        width: max-content;
        max-width: 100%;
        margin-bottom: 12px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(0, 166, 81, 0.12);
        color: #00A651;
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }

      .settings-light .settings-kicker,
      .settings-light .settings-panel-heading span {
        color: #92400e;
        background: rgba(0, 166, 81, 0.14);
      }

      .settings-hero h1 {
        margin: 0;
        font-size: clamp(42px, 7vw, 74px);
        line-height: 0.94;
        letter-spacing: 0;
      }

      .settings-hero p,
      .settings-control span,
      .settings-list span,
      .settings-emergency p,
      .settings-logout-panel span {
        color: rgba(226, 232, 240, 0.72);
        line-height: 1.55;
      }

      .settings-light .settings-hero p,
      .settings-light .settings-control span,
      .settings-light .settings-list span,
      .settings-light .settings-emergency p,
      .settings-light .settings-logout-panel span {
        color: #64748b;
      }

      .settings-hero p {
        max-width: 680px;
        margin: 18px 0 0;
        font-size: 17px;
      }

      .settings-profile-card {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 280px;
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
      }

      .settings-light .settings-profile-card,
      .settings-light .settings-panel,
      .settings-light .settings-emergency,
      .settings-light .settings-logout-panel {
        border-color: rgba(15, 23, 42, 0.08);
        background: rgba(255, 255, 255, 0.86);
      }

      .settings-profile-card strong,
      .settings-profile-card span {
        display: block;
      }

      .settings-profile-card strong {
        font-size: 17px;
      }

      .settings-profile-card span {
        margin-top: 3px;
        color: #94a3b8;
        font-size: 13px;
      }

      .settings-grid {
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
        gap: 18px;
      }

      .settings-panel,
      .settings-emergency,
      .settings-logout-panel {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 24px 62px rgba(0, 0, 0, 0.16);
        backdrop-filter: blur(18px);
      }

      .settings-panel {
        padding: 24px;
      }

      .settings-panel-heading h2 {
        margin: 0 0 22px;
        font-size: 30px;
        line-height: 1.05;
      }

      .settings-control {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        padding: 18px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .settings-light .settings-control {
        border-top-color: rgba(15, 23, 42, 0.08);
      }

      .settings-control strong,
      .settings-list strong,
      .settings-logout-panel strong {
        display: block;
        margin-bottom: 5px;
        font-size: 17px;
      }

      .settings-segmented {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: flex-end;
        padding: 5px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .settings-light .settings-segmented {
        background: rgba(15, 23, 42, 0.06);
      }

      .settings-segmented button {
        min-height: 38px;
        padding: 0 12px;
        border-radius: 999px;
        background: transparent;
        color: inherit;
        font-weight: 850;
        transition: background 180ms ease, color 180ms ease;
      }

      .settings-segmented button.active {
        background: #fff;
        color: #111827;
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
      }

      .settings-light .settings-segmented button.active {
        background: #111827;
        color: #fff;
      }

      .settings-toggle {
        position: relative;
        width: 66px;
        height: 38px;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.38);
        transition: background 180ms ease;
      }

      .settings-toggle span {
        position: absolute;
        top: 5px;
        left: 5px;
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.16);
        transition: transform 180ms ease;
      }

      .settings-toggle.on {
        background: #16a34a;
      }

      .settings-toggle.on span {
        transform: translateX(28px);
      }

      .settings-list {
        display: grid;
        gap: 10px;
      }

      .settings-list button {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        width: 100%;
        padding: 17px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.06);
        color: inherit;
        text-align: left;
        transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
      }

      .settings-light .settings-list button {
        border-color: rgba(15, 23, 42, 0.08);
        background: rgba(248, 250, 252, 0.72);
      }

      .settings-list button:hover {
        border-color: rgba(0, 166, 81, 0.35);
        background: rgba(0, 166, 81, 0.08);
      }

      .settings-list em {
        color: #00A651;
        font-style: normal;
        font-weight: 900;
        white-space: nowrap;
      }

      .settings-light .settings-list em {
        color: #92400e;
      }

      .settings-emergency,
      .settings-logout-panel {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 18px;
        align-items: center;
        margin-top: 18px;
        padding: 24px;
      }

      .settings-emergency h2 {
        margin: 0;
        font-size: 30px;
      }

      .settings-emergency p {
        margin: 8px 0 0;
      }

      .settings-emergency-links {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }

      .settings-emergency-links a {
        display: grid;
        min-width: 118px;
        padding: 12px 14px;
        border-radius: 16px;
        background: #dc2626;
        color: #fff;
        text-decoration: none;
        box-shadow: 0 16px 30px rgba(220, 38, 38, 0.22);
      }

      .settings-emergency-links span {
        font-size: 12px;
        font-weight: 800;
        opacity: 0.82;
      }

      .settings-emergency-links strong {
        margin-top: 3px;
        font-size: 18px;
      }

      .settings-logout-panel {
        margin-bottom: 34px;
      }

      .settings-logout-panel button {
        min-height: 48px;
        padding: 0 20px;
        border-radius: 999px;
        background: #fff;
        color: #111827;
        font-weight: 900;
        transition: transform 180ms ease, box-shadow 180ms ease;
      }

      .settings-light .settings-logout-panel button {
        background: #111827;
        color: #fff;
      }

      @media (max-width: 880px) {
        .settings-page {
          padding: 14px;
        }

        .settings-nav,
        .settings-hero,
        .settings-grid,
        .settings-emergency,
        .settings-logout-panel {
          width: 100%;
        }

        .settings-nav {
          align-items: flex-start;
          flex-direction: column;
        }

        .settings-nav-actions {
          width: 100%;
          overflow-x: auto;
          padding-bottom: 2px;
        }

        .settings-hero,
        .settings-grid,
        .settings-emergency,
        .settings-logout-panel {
          grid-template-columns: 1fr;
        }

        .settings-hero {
          padding-top: 44px;
        }

        .settings-profile-card {
          min-width: 0;
        }

        .settings-control {
          grid-template-columns: 1fr;
        }

        .settings-segmented {
          justify-content: flex-start;
          border-radius: 18px;
        }

        .settings-emergency-links {
          justify-content: flex-start;
        }
      }

      @media (max-width: 540px) {
        .settings-hero h1 {
          font-size: 44px;
        }

        .settings-panel,
        .settings-emergency,
        .settings-logout-panel {
          border-radius: 22px;
          padding: 20px;
        }

        .settings-list button {
          grid-template-columns: 1fr;
        }

        .settings-list em {
          white-space: normal;
        }
      }
    `}</style>
  );
}

function LegalPage({ page }) {
  const content = {
    terms: {
      title: "Terms and Conditions",
      subtitle: "Rider terms, driver agreement, payment rules, and platform operations.",
      sections: [
        {
          title: "Account responsibility and identity",
          text:
            "Riders and drivers must provide accurate names, phone numbers, National Identification information, and payment or payout details. Users are responsible for keeping their account information current. Accounts may be blocked, suspended, or reviewed for unsafe behavior, fraud, false information, expired driver documents, non-payment, or misuse of the app.",
        },
        {
          title: "Rider terms",
          text:
            "Riders must request trips honestly, choose accurate pickup and drop-off locations, respect drivers and vehicles, pay the agreed fare, and use rating, support, and emergency tools responsibly. Riders can tip drivers after drop-off when payment is completed. Repeated cancellations, false requests, harassment, abuse, or refusal to pay may lead to account blocking.",
        },
        {
          title: "Driver agreement",
          text:
            "Drivers agree to operate safely, follow local transport laws, keep their vehicle clean and roadworthy, respect riders, and complete trips only through the app. Drivers must keep license, registration, insurance, vehicle, payout, and National ID information current. Expired required documents can automatically reject the driver profile until updated documents are submitted and reviewed.",
        },
        {
          title: "Driver conduct and safety",
          text:
            "Drivers must not misuse rider phone numbers, pickup locations, drop-off locations, documents, payment information, or trip history. Drivers must not accept trips while impaired, drive dangerously, overcharge riders, or allow another person to use their driver account. Admin may block or reintegrate drivers based on safety, document, payment, and rating review.",
        },
        {
          title: "Payments and commission",
          text:
            `The platform owner commission is ${MARKET.ownerCommissionPercent}% of the ride fare. Driver earnings, rider tips, withdrawal requests, and owner payout methods are tracked in the app. Bankily, Masravi, Seddad, cash, card, and bank account records may be used depending on the selected method. Real provider transfers depend on approved provider APIs or manual admin processing.`,
        },
        {
          title: "Ratings, blocking, and disputes",
          text:
            "Riders and drivers can rate each other after trips. Admin can use ratings, payment status, documents, and support reports to investigate disputes, block accounts, unblock accounts, or reintegrate drivers. Users should report safety, payment, or document issues as soon as possible.",
        },
        {
          title: "Emergency and support use",
          text:
            "Users should follow local laws, use emergency numbers only for real emergencies, and contact support or the admin for safety or account concerns. The app can provide emergency contact shortcuts, but it does not replace police, ambulance, fire, or official emergency services.",
        },
      ],
    },
    privacy: {
      title: "Privacy Policy",
      subtitle: "Data protection rules for user, trip, document, and payment information.",
      sections: [
        {
          title: "Information collected",
          text:
            "The app stores account details, phone numbers, trip pickup and drop-off locations, driver documents, National ID information, ratings, payment method details, and payout method details.",
        },
        {
          title: "How information is used",
          text:
            "Information is used to match riders with drivers, verify identity and driver documents, process payment records, calculate commission, support withdrawals, improve safety, and help admin manage the platform.",
        },
        {
          title: "Access control",
          text:
            "Riders see assigned driver details after acceptance. Drivers see active rider trip information. Admin can review users, documents, payouts, ratings, and account status for platform operations.",
        },
        {
          title: "Data protection rules",
          text:
            "Sensitive information should be accessed only by users who need it for a real platform purpose. Admin access should be limited to trusted staff. Driver documents, National ID documents, payout details, and payment records should not be shared outside support, verification, payment, safety, or legal needs.",
        },
        {
          title: "Security requirements",
          text:
            "Before public launch, the production app should use HTTPS, private API keys, a strong Django secret key, protected database credentials, limited admin accounts, regular backups, provider webhook verification, and secure hosting. Real payment credentials must not be stored in frontend code.",
        },
        {
          title: "Retention and correction",
          text:
            "Users should be able to request correction of inaccurate account, identity, vehicle, or payout information. Trip, payment, rating, and safety records may be retained for operations, dispute handling, fraud prevention, accounting, and legal compliance.",
        },
      ],
    },
    support: {
      title: "Support and Safety",
      subtitle: "Help options for riders, drivers, and admin operations.",
      sections: [
        {
          title: "Emergency contacts",
          text:
            `Police ${MARKET.emergencyNumbers[0]?.number || ""}, Ambulance ${MARKET.emergencyNumbers[1]?.number || ""}, Fire ${MARKET.emergencyNumbers[2]?.number || ""}. Use these only for real emergencies.`,
        },
        {
          title: "Emergency process",
          text:
            "If a rider or driver is in immediate danger, they should call the correct emergency number first. After the situation is safe, they should report the trip, driver or rider name, phone number, pickup, drop-off, time, and issue to the platform admin for investigation.",
        },
        {
          title: "Rider support",
          text:
            "Riders can contact the driver after acceptance, share trip details, rate the trip, and report payment, driver behavior, wrong route, cancellation, document, or safety problems to the platform admin.",
        },
        {
          title: "Driver support",
          text:
            "Drivers can update vehicle documents, National ID, payout methods, and withdrawal requests from the driver app. If blocked or rejected, drivers should update missing information and request admin reintegration.",
        },
        {
          title: "Admin support process",
          text:
            "Admin should review pending drivers, expired documents, rider and driver ratings, owner payout information, driver withdrawals, blocked accounts, and safety reports regularly. Serious safety reports should be prioritized before normal account and payment requests.",
        },
        {
          title: "Payment and payout support",
          text:
            "For Bankily, Masravi, Seddad, cash, bank account, and withdrawal issues, admin should compare ride status, payment records, driver earnings, owner commission, payout method, and provider confirmation before approving or rejecting requests.",
        },
      ],
    },
  }[page];

  return (
    <main style={legalPageStyle}>
      <section style={legalCardStyle}>
        <span style={brandPillStyle}>{MARKET.brandName}</span>
        <h1 style={legalTitleStyle}>{content.title}</h1>
        <p style={legalSubtitleStyle}>{content.subtitle}</p>
        <div style={legalSectionGridStyle}>
          {content.sections.map((section) => (
            <article key={section.title} style={legalSectionStyle}>
              <h2>{section.title}</h2>
              <p>{section.text}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const RIDER_TOP_BAR_PATHS = [
  "/rider-dashboard",
  "/rider",
  "/rider-profile",
  "/rider-history",
  "/rider-ride-history",
  "/rider-reviews",
  "/saved-places",
  "/rider-payments",
  "/support",
  "/services",
  "/settings",
  "/payment-setup",
];

function isRiderTopBarContext() {
  if (getAppType() === "rider") {
    return true;
  }

  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const isRiderPath = RIDER_TOP_BAR_PATHS.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!isRiderPath) {
    return false;
  }

  return getUserRole(getStoredUser()) === "rider";
}

function resolveTopBarMenuMode(minimalActions, menuMode = "auto") {
  if (minimalActions) {
    return "minimal";
  }
  if (menuMode !== "auto") {
    return menuMode;
  }
  return isRiderTopBarContext() ? "rider" : "full";
}

function TopBar({ title, goHome, logout, minimalActions = false, menuMode = "auto" }) {
  const { t } = useTranslation();
  const [showSafety, setShowSafety] = useState(false);
  const resolvedMenuMode = resolveTopBarMenuMode(minimalActions, menuMode);
  const currentPath = window.location.pathname.replace(/\/+$/, "") || "/";

  const navigate = (path) => {
    window.location.href = path;
  };

  const safetyMenu = (
    <div style={safetyMenuWrapStyle}>
      <button
        onClick={() => setShowSafety((current) => !current)}
        style={safetyButtonStyle}
      >
        {t("settings.safetyEmergency")}
      </button>

      {showSafety && (
        <div style={safetyDropdownStyle}>
          <div style={safetyHeaderStyle}>
            <strong>{t("settings.emergency")}</strong>
            <span>Tap a number to call</span>
          </div>

          {MARKET.emergencyNumbers.map((item) => (
            <a
              key={item.number}
              href={`tel:${item.number}`}
              title={item.description}
              style={safetyCallRowStyle}
            >
              <span>{item.label}</span>
              <strong>{item.number}</strong>
            </a>
          ))}
        </div>
      )}
    </div>
  );

  const riderActions = (
    <>
      {safetyMenu}
      <button onClick={() => navigate("/rider-dashboard")} style={topPrimaryButtonStyle}>
        {t("common.rider")}
      </button>
      <button onClick={() => navigate("/rider-profile")} style={topButtonStyle}>
        {t("profile.riderProfile")}
      </button>
      {currentPath !== "/support" && (
        <button onClick={() => navigate("/support")} style={topButtonStyle}>
          {t("common.support")}
        </button>
      )}
      <button onClick={() => navigate("/settings")} style={topButtonStyle}>
        {t("common.settings")}
      </button>
      <button onClick={logout} style={logoutButtonStyle}>
        {t("common.logout")}
      </button>
    </>
  );

  const fullActions = (
    <>
      {safetyMenu}
      <button onClick={() => navigate("/rider-dashboard")} style={topButtonStyle}>
        {t("common.rider")}
      </button>
      <button onClick={() => navigate("/driver")} style={topButtonStyle}>
        {t("common.driver")}
      </button>
      <button onClick={() => navigate("/rider-profile")} style={topButtonStyle}>
        {t("profile.riderProfile")}
      </button>
      <button onClick={() => navigate("/driver-profile")} style={topButtonStyle}>
        {t("profile.driverProfile")}
      </button>
      <button onClick={() => navigate("/admin")} style={topButtonStyle}>
        {t("common.admin")}
      </button>
      <button onClick={goHome} style={topButtonStyle}>
        {t("common.home")}
      </button>
      <button onClick={() => navigate("/support")} style={topButtonStyle}>
        {t("common.support")}
      </button>
      <button onClick={() => navigate("/settings")} style={topButtonStyle}>
        {t("common.settings")}
      </button>
      <button onClick={logout} style={logoutButtonStyle}>
        {t("common.logout")}
      </button>
    </>
  );

  return (
    <div style={topBarStyle}>
      <div>
        <div style={topBrandStyle}>
          <BrandLogo />
          <div>
            <h2 style={topTitleStyle}>{title}</h2>
            <span style={topSubtitleStyle}>Mauritania mobility platform</span>
          </div>
        </div>
      </div>

      <div style={topButtonGroupStyle}>
        {resolvedMenuMode === "minimal" && (
          <button onClick={logout} style={logoutButtonStyle}>
            {t("common.logout")}
          </button>
        )}
        {resolvedMenuMode === "rider" && riderActions}
        {resolvedMenuMode === "full" && fullActions}
      </div>
    </div>
  );
}

function BrandLogo() {
  return (
    <div style={brandLogoWrapStyle}>
      <img
        src={getBrandLogoSrc()}
        alt={`${MARKET.brandName} logo`}
        style={brandLogoImageStyle}
      />
    </div>
  );
}

const emptyPageStyle = {
  padding: "30px",
};

const authLoadingStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background:
    "radial-gradient(circle at 20% 10%, rgba(0, 166, 81, 0.18), transparent 28%), #05070c",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
};

const authLoadingCardStyle = {
  width: "min(360px, 100%)",
  padding: "26px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "24px",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  textAlign: "center",
  boxShadow: "0 24px 70px rgba(0,0,0,0.32)",
};

const authLoadingLogoStyle = {
  width: "78px",
  height: "78px",
  borderRadius: "20px",
  objectFit: "cover",
};

const authLoadingTitleStyle = {
  margin: "14px 0 6px",
  fontSize: "26px",
};

const authLoadingTextStyle = {
  margin: 0,
  color: "rgba(255,255,255,0.7)",
};

const authLoadingActionStyle = {
  display: "inline-flex",
  marginTop: "18px",
  padding: "11px 18px",
  borderRadius: "10px",
  background: "#00A651",
  color: "#fff",
  fontWeight: 800,
  textDecoration: "none",
};

const brandPillStyle = {
  width: "fit-content",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#111827",
  border: "1px solid rgba(255, 255, 255, 0.4)",
  borderRadius: "999px",
  padding: "8px 12px",
  fontWeight: 900,
  fontSize: "0.78rem",
  marginBottom: "14px",
};

const legalPageStyle = {
  minHeight: "100vh",
  background: "#f3f6fa",
  padding: "28px",
};

const legalCardStyle = {
  maxWidth: "980px",
  margin: "0 auto",
  background: "linear-gradient(180deg, #f8fbff 0%, #eef3ff 100%)",
  border: "1px solid #e6e8ef",
  borderRadius: "28px",
  padding: "28px",
  boxShadow: "0 16px 38px rgba(15, 23, 42, 0.08)",
};

const legalTitleStyle = {
  margin: "14px 0 8px",
  color: "#111827",
  fontSize: "2.2rem",
};

const legalSubtitleStyle = {
  margin: "0 0 22px",
  color: "#64748b",
  lineHeight: 1.5,
};

const legalSectionGridStyle = {
  display: "grid",
  gap: "14px",
};

const legalSectionStyle = {
  background: "#f8f9ff",
  border: "1px solid #d5deef",
  borderRadius: "14px",
  padding: "18px",
  color: "#334155",
  lineHeight: 1.55,
};

const topBarStyle = {
  background: "#0c0c14",
  color: "#0b1220",
  padding: "12px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  flexWrap: "wrap",
  borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.16)",
};

const topBrandStyle = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
};

const brandLogoWrapStyle = {
  width: "62px",
  height: "46px",
  borderRadius: "10px",
  display: "grid",
  placeItems: "center",
  background: "#0c0c14",
  border: "1px solid rgba(251, 191, 36, 0.28)",
  position: "relative",
  flex: "0 0 auto",
  overflow: "hidden",
};

const brandLogoImageStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const topTitleStyle = {
  margin: 0,
  fontSize: "18px",
  color: "#0b1220",
};

const topSubtitleStyle = {
  display: "block",
  marginTop: "2px",
  color: "#9ca3af",
  fontSize: "0.78rem",
  fontWeight: 800,
};

const topButtonGroupStyle = {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "center",
};

const safetyMenuWrapStyle = {
  position: "relative",
};

const safetyButtonStyle = {
  background: "#dc2626",
  color: "#0b1220",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  padding: "10px 12px",
  borderRadius: "14px",
  fontWeight: 900,
  cursor: "pointer",
};

const safetyDropdownStyle = {
  position: "absolute",
  top: "48px",
  right: 0,
  zIndex: 50,
  width: "260px",
  background: "linear-gradient(160deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #fecaca",
  borderRadius: "14px",
  padding: "12px",
  boxShadow: "0 20px 40px rgba(15, 23, 42, 0.24)",
};

const safetyHeaderStyle = {
  display: "grid",
  gap: "3px",
  color: "#111827",
  marginBottom: "10px",
};

const safetyCallRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "14px",
  minHeight: "44px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "#fff7f7",
  color: "#991b1b",
  fontWeight: 900,
  textDecoration: "none",
  marginTop: "8px",
};

const topButtonStyle = {
  background: "rgba(255, 255, 255, 0.08)",
  color: "#f9fafb",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const topPrimaryButtonStyle = {
  ...topButtonStyle,
  background: "rgba(0, 166, 81, 0.28)",
  border: "1px solid rgba(74, 222, 128, 0.35)",
  color: "#ecfdf5",
};

const logoutButtonStyle = {
  background: "rgba(220, 38, 38, 0.22)",
  color: "#ffe4e6",
  border: "1px solid rgba(254, 202, 202, 0.24)",
  padding: "10px 16px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const setupPageStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at 14% 10%, rgba(250,204,21,0.16), transparent 28%), #030712",
  padding: "30px",
  fontFamily: 'Inter, "SF Pro Display", "Segoe UI", sans-serif',
};

const setupCardStyle = {
  maxWidth: "900px",
  margin: "0 auto",
  background: "rgba(255,255,255,0.07)",
  padding: "32px",
  borderRadius: "20px",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
  color: "#f8fafc",
};

const setupTitleStyle = {
  marginTop: 0,
  color: "#ffffff",
};

const setupSubtitleStyle = {
  color: "#cbd5e1",
  marginBottom: "20px",
};

const continueButtonStyle = {
  width: "100%",
  marginTop: "25px",
  padding: "16px",
  background: "#00A651",
  color: "#111827",
  border: "1px solid #00A651",
  borderRadius: "999px",
  fontWeight: "bold",
  fontSize: "16px",
  cursor: "pointer",
};

export default App;
