import React from "react";
import { cx } from "../utils/cx";

/**
 * Canonical YALA button. Prefer named aliases (PrimaryButton, etc.) for clarity.
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  compact = false,
  iconLeft = null,
  iconRight = null,
  className,
  as: Tag = "button",
  type = "button",
  ...rest
}) {
  const variantClass = {
    primary: "yds-btn--primary",
    secondary: "yds-btn--secondary",
    outlined: "yds-btn--outlined",
    ghost: "yds-btn--ghost",
    text: "yds-btn--text",
    danger: "yds-btn--danger",
    icon: "yds-btn--icon",
    fab: "yds-btn--fab",
  }[variant];

  const sizeClass = compact ? "yds-btn--sm" : `yds-btn--${size}`;

  return (
    <Tag
      type={Tag === "button" ? type : undefined}
      className={cx(
        "yds-btn",
        variantClass,
        sizeClass,
        fullWidth && "yds-btn--block",
        className
      )}
      disabled={Tag === "button" && (rest.disabled || isLoading)}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <span className="yds-spinner" aria-hidden="true" /> : null}
      {!isLoading && iconLeft ? <span className="yds-btn__icon" aria-hidden="true">{iconLeft}</span> : null}
      {children ? <span className="yds-btn__label">{children}</span> : null}
      {!isLoading && iconRight ? <span className="yds-btn__icon" aria-hidden="true">{iconRight}</span> : null}
    </Tag>
  );
}

export function PrimaryButton(props) {
  return <Button variant="primary" {...props} />;
}

export function SecondaryButton(props) {
  return <Button variant="secondary" {...props} />;
}

export function OutlinedButton(props) {
  return <Button variant="outlined" {...props} />;
}

export function TextButton(props) {
  return <Button variant="text" {...props} />;
}

export function IconButton({ "aria-label": ariaLabel, children, icon, ...rest }) {
  return (
    <Button
      variant="icon"
      aria-label={ariaLabel}
      {...rest}
    >
      {icon || children}
    </Button>
  );
}

export function FloatingActionButton({ "aria-label": ariaLabel, children, icon, ...rest }) {
  return (
    <Button
      variant="fab"
      aria-label={ariaLabel}
      {...rest}
    >
      {icon || children}
    </Button>
  );
}
