import React, { useCallback, useEffect, useState } from "react";

import AdminBreadcrumbs, { buildBreadcrumbs } from "./AdminBreadcrumbs";
import AdminFooter from "./AdminFooter";
import AdminHeader from "./AdminHeader";
import AdminTopNav from "./AdminTopNav";
import AdminErrorBoundary from "./errors/AdminErrorBoundary";
import {
  AdminForbiddenPage,
  AdminNotFoundPage,
  AdminServerErrorPage,
  AdminSessionWarningModal,
} from "./errors/AdminErrorPages";
import { AdminPageLoader } from "./loading/AdminLoaders";
import { AdminThemeProvider } from "./theme/AdminThemeContext";
import { PermissionProvider, usePermissions } from "../permissions/PermissionContext";
import { resolveRegisteredAdminHome } from "./permissions/adminRouteAccess";
import { AdminModuleLayout, ToastProvider } from "../components/library";
import MauritaniaFlag from "../employees/MauritaniaFlag";
import "./theme/yalaAdminDesignTokens.css";
import "./AdminShell.css";
import "./theme/mauritaniaAdminTheme.css";
import "./theme/adminThemeEnforcement.css";
import "./theme/yalaAdminTricolor.css";

function AdminShellInner({ pathname, title, children }) {
  const {
    permissions,
    loading,
    error,
    reloadPermissions,
    logout,
    canAccessCurrentPath,
    routeDenial,
    sessionWarningOpen,
    extendSession,
  } = usePermissions();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const crumbs = buildBreadcrumbs(pathname);
  const goHome = useCallback(() => {
    // Never follow the backend `home_route` blindly: it advertises `/admin/home/<role>`,
    // which App.js does not register. See resolveRegisteredAdminHome.
    window.location.href = resolveRegisteredAdminHome(permissions?.home_route);
  }, [permissions]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="admin-shell admin-shell--topnav admin-shell--flag admin-shell--boot">
        <AdminPageLoader label="Loading admin permissions…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-shell admin-shell--topnav admin-shell--flag">
        <main className="admin-shell__main" id="admin-main-content">
          <AdminServerErrorPage
            message={error}
            onRetry={() => reloadPermissions(true)}
          />
        </main>
      </div>
    );
  }

  const isNotFound = pathname === "/admin/404";
  const isForbidden = pathname === "/admin/unauthorized" || !canAccessCurrentPath;
  const pathNorm = (pathname || "").replace(/\/+$/, "") || "/";
  const isExecutiveHome = pathNorm === "/admin";

  return (
    <div className="admin-shell admin-shell--topnav admin-shell--flag">
      <div className="admin-shell__flag-band admin-shell__flag-band--top" aria-hidden="true" />
      <AdminHeader
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <AdminTopNav pathname={pathname} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="admin-shell__body admin-shell__body--full admin-shell__flag-field">
        <div className="admin-shell__flag-watermark" aria-hidden="true">
          <MauritaniaFlag className="admin-shell__flag-watermark-svg" title="Decorative flag motif" />
        </div>
        <main className="admin-shell__main" id="admin-main-content">
          <AdminBreadcrumbs items={crumbs} />
          <AdminErrorBoundary>
            {isNotFound ? (
              <AdminNotFoundPage onGoHome={goHome} />
            ) : isForbidden ? (
              <AdminForbiddenPage
                onGoHome={goHome}
                routeDenial={routeDenial}
                permissions={permissions}
              />
            ) : isExecutiveHome ? (
              <div className="admin-shell__enterprise-module admin-shell__enterprise-module--flush">
                {children}
              </div>
            ) : (
              <AdminModuleLayout
                title={title || crumbs[crumbs.length - 1]?.label || "Admin"}
                subtitle="YALA Technologies — secure operations console"
                className="admin-shell__enterprise-module"
              >
                {children}
              </AdminModuleLayout>
            )}
          </AdminErrorBoundary>
        </main>
      </div>
      <AdminFooter />

      {searchOpen ? (
        <div className="admin-shell__modal-overlay" role="presentation" onClick={() => setSearchOpen(false)}>
          <div
            className="admin-shell__search-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="admin-shell__search-modal-label">Global search</p>
            <p className="admin-shell__search-hint">
              Global search is <strong>not implemented yet</strong> — no records are searched
              here. Use the module pages (Rides, Riders, Support, Finance…) to find records.
            </p>
            <button type="button" className="admin-shell__btn admin-shell__btn--ghost" onClick={() => setSearchOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <AdminSessionWarningModal
        open={sessionWarningOpen}
        onExtend={extendSession}
        onLogout={() => logout()}
      />
    </div>
  );
}

/**
 * AdminShell — parent layout for all internal admin dashboards.
 * Spec referenced AdminShell.tsx; project uses JavaScript (CRA).
 */
export default function AdminShell({ pathname, title, children }) {
  const currentPath = pathname || (typeof window !== "undefined" ? window.location.pathname : "/admin");

  return (
    <AdminThemeProvider>
      <ToastProvider>
        <PermissionProvider pathname={currentPath}>
          <AdminShellInner pathname={currentPath} title={title}>
            {children}
          </AdminShellInner>
        </PermissionProvider>
      </ToastProvider>
    </AdminThemeProvider>
  );
}

export function isAdminShellEnabled() {
  if (process.env.REACT_APP_ADMIN_SHELL_ENABLED === "false") return false;
  if (process.env.REACT_APP_ADMIN_SHELL_ENABLED === "true") return true;
  try {
    return localStorage.getItem("yala_admin_shell_enabled") !== "false";
  } catch (error) {
    return true;
  }
}

/** Wrap legacy admin module pages with the shell */
export function AdminShellPage({ pathname, title, children }) {
  if (!isAdminShellEnabled()) {
    return children;
  }
  return (
    <AdminShell pathname={pathname} title={title}>
      {children}
    </AdminShell>
  );
}
