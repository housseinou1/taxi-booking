import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { clearAuthSession } from "../../auth/session";
import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";
import {
  clearAdminPermissionsCache,
  fetchAdminPermissions,
} from "../layouts/permissions/adminPermissionsApi";
import {
  canAccessPath,
  getModuleForPath,
  getRouteAccessDenial,
} from "../layouts/permissions/adminRouteAccess";
import {
  logAdminLogin,
  logAdminLogout,
  logAdminPermissionDenied,
  logAdminSessionTimeout,
} from "./adminAuditApi";
import {
  resolveApproveAction,
  resolveEditActions,
  resolveExportAction,
} from "./permissionActions";

const PermissionContext = createContext(null);

const SESSION_TIMEOUT_MS = Number(process.env.REACT_APP_ADMIN_SESSION_TIMEOUT_MS || 8 * 60 * 60 * 1000);
const SESSION_WARN_MS = Number(process.env.REACT_APP_ADMIN_SESSION_WARN_MS || 7 * 60 * 60 * 1000);

export function PermissionProvider({ children, pathname }) {
  const [permissions, setPermissions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cityId, setCityId] = useState(() => localStorage.getItem("yala_admin_city_id") || "");
  const [notifications, setNotifications] = useState([]);
  const [sessionWarningOpen, setSessionWarningOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const loginLoggedRef = useRef(false);
  const deniedLoggedRef = useRef(new Set());

  const reloadPermissions = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPermissions({ force });
      setPermissions(data);
      if (data?.assigned_city?.id && !localStorage.getItem("yala_admin_city_id")) {
        setCityId(String(data.assigned_city.id));
      }
      return data;
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load permissions");
      setPermissions(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadPermissions(false);
  }, [reloadPermissions]);

  useEffect(() => {
    if (!permissions || loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    logAdminLogin({ role: permissions.role, home_route: permissions.home_route });
  }, [permissions]);

  const logout = useCallback(async ({ allDevices = false } = {}) => {
    await logAdminLogout({ all_devices: allDevices });
    if (allDevices) {
      try {
        await authenticatedApi.post(`${API_URL}/auth/logout-all-devices/`);
      } catch (error) {
        // Continue local logout even if remote fails.
      }
    }
    clearAdminPermissionsCache();
    clearAuthSession();
    window.location.replace("/login?next=/admin");
  }, []);

  const setCity = useCallback((id) => {
    setCityId(id || "");
    if (id) localStorage.setItem("yala_admin_city_id", id);
    else localStorage.removeItem("yala_admin_city_id");
  }, []);

  const extendSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSessionWarningOpen(false);
  }, []);

  const canAccessCurrentPath = useMemo(
    () => canAccessPath(permissions, pathname),
    [permissions, pathname]
  );

  const routeDenial = useMemo(
    () => getRouteAccessDenial(permissions, pathname),
    [permissions, pathname]
  );

  useEffect(() => {
    if (!permissions || canAccessCurrentPath || pathname === "/admin/unauthorized") return;
    const key = `${pathname}:${routeDenial?.requiredModule || ""}`;
    if (deniedLoggedRef.current.has(key)) return;
    deniedLoggedRef.current.add(key);
    logAdminPermissionDenied({
      pathname,
      requiredModule: routeDenial?.requiredModule,
      requiredAction: routeDenial?.requiredAction,
    });
  }, [permissions, canAccessCurrentPath, pathname, routeDenial]);

  const hasFeature = useCallback(
    (flag) => Boolean(permissions?.feature_flags?.[flag]),
    [permissions]
  );

  const canAction = useCallback(
    (actionKey) => {
      if (!permissions) return false;
      if (permissions.elevated || permissions.role === "ceo") return true;
      return Boolean(permissions.actions?.[actionKey]);
    },
    [permissions]
  );

  const canView = useCallback(
    (module) => {
      if (!permissions) return false;
      if (permissions.elevated || permissions.role === "ceo") return true;
      return (permissions.modules || []).includes(module);
    },
    [permissions]
  );

  const canEdit = useCallback(
    (module) => {
      if (!permissions) return false;
      if (permissions.elevated || permissions.role === "ceo") return true;
      const actions = resolveEditActions(module);
      return actions.some((action) => Boolean(permissions.actions?.[action]));
    },
    [permissions]
  );

  const canApprove = useCallback(
    (kind) => canAction(resolveApproveAction(kind)),
    [canAction]
  );

  const canExport = useCallback(
    (scope) => canAction(resolveExportAction(scope)),
    [canAction]
  );

  useEffect(() => {
    if (!permissions?.feature_flags?.session_timeout) return undefined;

    const markActivity = () => {
      lastActivityRef.current = Date.now();
      if (sessionWarningOpen) setSessionWarningOpen(false);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= SESSION_TIMEOUT_MS) {
        logAdminSessionTimeout({ idle_ms: idleMs });
        clearAdminPermissionsCache();
        clearAuthSession();
        window.location.replace("/login?next=/admin&reason=session_timeout");
        return;
      }
      if (idleMs >= SESSION_WARN_MS) {
        setSessionWarningOpen(true);
      }
    }, 30000);

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.clearInterval(timer);
    };
  }, [permissions, sessionWarningOpen]);

  const value = useMemo(
    () => ({
      permissions,
      loading,
      error,
      reloadPermissions,
      logout,
      cityId,
      setCity,
      notifications,
      setNotifications,
      canAccessCurrentPath,
      routeDenial,
      hasFeature,
      canAction,
      canView,
      canEdit,
      canApprove,
      canExport,
      sessionWarningOpen,
      extendSession,
      sessionTimeoutMs: SESSION_TIMEOUT_MS,
    }),
    [
      permissions,
      loading,
      error,
      reloadPermissions,
      logout,
      cityId,
      setCity,
      notifications,
      canAccessCurrentPath,
      routeDenial,
      hasFeature,
      canAction,
      canView,
      canEdit,
      canApprove,
      canExport,
      sessionWarningOpen,
      extendSession,
    ]
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within PermissionProvider");
  }
  return ctx;
}

/** Backward-compatible alias used by Sprint 1 layout modules */
export const useAdminLayout = usePermissions;

export function PermissionGate({ module, action, children, fallback = null }) {
  const { canView, canAction } = usePermissions();
  if (action && !canAction(action)) return fallback;
  if (module && !canView(module)) return fallback;
  return children;
}
