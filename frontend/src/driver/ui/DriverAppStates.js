import React from "react";
import { DRIVER_UI } from "./driverFoundation";

const shellStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: DRIVER_UI.space[3],
  minHeight: 160,
  padding: `${DRIVER_UI.space[8]}px ${DRIVER_UI.space[4]}px`,
  textAlign: "center",
  fontFamily: DRIVER_UI.fontFamily,
  color: DRIVER_UI.color.muted,
};

const titleStyle = {
  margin: 0,
  color: DRIVER_UI.color.ink,
  fontSize: 18,
  fontWeight: 700,
};

const messageStyle = {
  margin: 0,
  maxWidth: "36ch",
  lineHeight: 1.5,
  color: DRIVER_UI.color.muted,
  fontSize: 14,
};

const actionStyle = {
  minHeight: DRIVER_UI.touchMin,
  minWidth: 120,
  padding: `0 ${DRIVER_UI.space[5]}px`,
  border: `1px solid ${DRIVER_UI.color.lineStrong}`,
  borderRadius: DRIVER_UI.radius.md,
  background: DRIVER_UI.color.primary,
  color: DRIVER_UI.color.onPrimary,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

function StateShell({ role, title, message, actionLabel, onAction, children }) {
  return (
    <div style={shellStyle} role={role}>
      {children}
      {title ? <strong style={titleStyle}>{title}</strong> : null}
      {message ? <p style={messageStyle}>{message}</p> : null}
      {actionLabel && typeof onAction === "function" ? (
        <button type="button" style={actionStyle} onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function DriverLoadingState({
  title = "Loading…",
  message = "",
  compact = false,
}) {
  return (
    <StateShell
      role="status"
      title={title}
      message={message}
    >
      <span
        aria-hidden="true"
        style={{
          width: compact ? 20 : 28,
          height: compact ? 20 : 28,
          border: `3px solid ${DRIVER_UI.color.line}`,
          borderTopColor: DRIVER_UI.color.primary,
          borderRadius: "50%",
          animation: "driver-ui-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes driver-ui-spin{to{transform:rotate(360deg)}}`}</style>
    </StateShell>
  );
}

export function DriverEmptyState({
  title = "Nothing here yet",
  message = "",
  actionLabel = "",
  onAction,
}) {
  return (
    <StateShell
      role="status"
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function DriverErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  actionLabel = "Try again",
  onAction,
}) {
  return (
    <StateShell
      role="alert"
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export function DriverOfflineState({
  title = "You are offline",
  message = "Check your connection and try again.",
  actionLabel = "Retry",
  onAction,
}) {
  return (
    <StateShell
      role="status"
      title={title}
      message={message}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}

export default {
  DriverLoadingState,
  DriverEmptyState,
  DriverErrorState,
  DriverOfflineState,
};
