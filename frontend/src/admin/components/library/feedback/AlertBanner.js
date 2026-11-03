import React from "react";

import { humanizeApiMessage } from "../utils/apiMessage";

const TONE_CLASS = {
  info: "admin-banner--info",
  success: "admin-banner--success",
  warning: "admin-banner--warning",
  danger: "admin-banner--danger",
};

export default function AlertBanner({ tone = "info", title, children, onDismiss, action }) {
  // Callers frequently pass a raw transport string as the body
  // (e.g. <AlertBanner tone="danger">{error}</AlertBanner>). Normalise only when
  // the child is a plain string, so JSX children are passed through untouched.
  const body = typeof children === "string" ? humanizeApiMessage(children) : children;
  return (
    <div className={`admin-banner ${TONE_CLASS[tone] || TONE_CLASS.info}`} role="status">
      <div className="admin-banner__body">
        {title ? <strong className="admin-banner__title">{title}</strong> : null}
        <div>{body}</div>
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
