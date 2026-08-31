import React, { useCallback, useEffect, useState } from "react";

import AdminBreadcrumbs, { buildBreadcrumbs } from "./AdminBreadcrumbs";
import AdminFooter from "./AdminFooter";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
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
import { ToastProvider } from "../components/library";
import "./AdminShell.css";

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
  const [searchQuery, setSearchQuery] = useState("");

  const crumbs = buildBreadcrumbs(pathname);
  const goHome = useCallback(() => {
    window.location.href = permissions?.home_route || "/admin/home/ops";
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
    return <AdminPageLoader label="Loading admin permissions…" />;
  }

  if (error) {
    return (
      <AdminServerErrorPage
        message={error}
        onRetry={() => reloadPermissions(true)}
      />
    );
  }

  const isNotFound = pathname === "/admin/404";
  const isForbidden = pathname === "/admin/unauthorized" || !canAccessCurrentPath;

  return (
    <div className="admin-shell">
      <AdminHeader
        onOpenMobileNav={() => setMobileNavOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <div className="admin-shell__body">
        <AdminSidebar
          pathname={pathname}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <main className="admin-shell__main" id="admin-main-content">
          <AdminBreadcrumbs items={crumbs} />
          {title ? <h1 className="admin-shell__page-title">{title}</h1> : null}
          <AdminErrorBoundary>
            {isNotFound ? (
              <AdminNotFoundPage onGoHome={goHome} />
            ) : isForbidden ? (
              <AdminForbiddenPage
                onGoHome={goHome}
                routeDenial={routeDenial}
                permissions={permissions}
              />
            ) : (
              children
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
            <label className="admin-shell__search-modal-label">
              Global search
              <input
                autoFocus
                type="search"
                value={searchQuery}
                placeholder="Ride ID, phone, ticket #…"
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
            <p className="admin-shell__search-hint">
              Sprint 1 stub — full search ships Sprint 4. Query: {searchQuery || "—"}
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
