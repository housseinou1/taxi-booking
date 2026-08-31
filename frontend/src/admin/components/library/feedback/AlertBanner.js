import React from "react";

const TONE_CLASS = {
  info: "admin-banner--info",
  success: "admin-banner--success",
  warning: "admin-banner--warning",
  danger: "admin-banner--danger",
};

export default function AlertBanner({ tone = "info", title, children, onDismiss, action }) {
  return (
    <div className={`admin-banner ${TONE_CLASS[tone] || TONE_CLASS.info}`} role="status">
      <div className="admin-banner__body">
        {title ? <strong className="admin-banner__title">{title}</strong> : null}
        <div>{children}</div>
      </div>
      <div className="admin-banner__actions">
        {action}
        {onDismiss ? (
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onDismiss} aria-label="Dismiss">
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function SuccessBanner(props) {
  return <AlertBanner tone="success" {...props} />;
}

export function WarningBanner(props) {
  return <AlertBanner tone="warning" {...props} />;
}
