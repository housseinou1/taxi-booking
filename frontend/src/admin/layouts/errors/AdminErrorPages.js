import React from "react";

export function AdminForbiddenPage({ onGoHome, routeDenial, permissions }) {
  const requestedRoute = routeDenial?.requestedRoute || window.location.pathname;
  const requiredPermission =
    routeDenial?.requiredModuleLabel ||
    routeDenial?.requiredPermission ||
    "This module";

  return (
    <div className="admin-error-page admin-error-page--403">
      <h1>403</h1>
      <p>You don&apos;t have permission to view this module.</p>
      <dl className="admin-error-page__meta">
        <div>
          <dt>Requested route</dt>
          <dd>{requestedRoute}</dd>
        </div>
        <div>
          <dt>Required permission</dt>
          <dd>{requiredPermission}</dd>
        </div>
        {permissions?.role_label ? (
          <div>
            <dt>Your role</dt>
            <dd>{permissions.role_label}</dd>
          </div>
        ) : null}
      </dl>
      <button type="button" className="admin-shell__btn" onClick={onGoHome}>
        Back to dashboard
      </button>
    </div>
  );
}

export function AdminNotFoundPage({ onGoHome }) {
  return (
    <div className="admin-error-page admin-error-page--404">
      <h1>404</h1>
      <p>This admin page could not be found.</p>
      <button type="button" className="admin-shell__btn" onClick={onGoHome}>
        Go to home
      </button>
    </div>
  );
}

export function AdminServerErrorPage({ message, onRetry }) {
  return (
    <div className="admin-error-page admin-error-page--500">
      <h1>Something went wrong</h1>
      <p>{message || "An unexpected error occurred loading this page."}</p>
      <button type="button" className="admin-shell__btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function AdminSessionWarningModal({ open, onExtend, onLogout }) {
  if (!open) return null;

  return (
    <div className="admin-shell__modal-overlay" role="presentation">
      <div
        className="admin-shell__search-modal admin-shell__session-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Session timeout warning"
      >
        <h2>Session expiring soon</h2>
        <p>Your admin session has been idle. Extend your session or log out now.</p>
        <div className="admin-shell__session-actions">
          <button type="button" className="admin-shell__btn" onClick={onExtend}>
            Extend session
          </button>
          <button type="button" className="admin-shell__btn admin-shell__btn--ghost" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
