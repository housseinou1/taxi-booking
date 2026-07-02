import React from "react";

const ICONS = {
  check: "✓",
  close: "✕",
  navigate: "↗",
};

export function CourierActionButton({
  variant = "primary",
  icon,
  iconName,
  children,
  loading = false,
  disabled = false,
  onClick,
  className = "",
  fullWidth = false,
  type = "button",
  ariaLabel,
}) {
  const resolvedIcon = icon ?? (iconName ? ICONS[iconName] : null);
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={[
        "cce-action-btn",
        `cce-action-btn--${variant}`,
        loading ? "is-loading" : "",
        isDisabled ? "is-disabled" : "",
        fullWidth ? "cce-action-btn--full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isDisabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
    >
      {loading ? (
        <span className="cce-action-btn__spinner" aria-hidden />
      ) : resolvedIcon ? (
        <span className="cce-action-btn__icon" aria-hidden>
          {resolvedIcon}
        </span>
      ) : null}
      <span className="cce-action-btn__label">{children}</span>
    </button>
  );
}

export function CourierStickyActionBar({ children, split = false, className = "" }) {
  return (
    <div
      className={[
        "cce-action-bar",
        split ? "cce-action-bar--split" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
