import React from "react";
import { cx } from "../utils/cx";

/**
 * Canonical YALA button. Prefer named aliases (PrimaryButton, etc.) for clarity.
 * Forwards refs to the underlying element so consumers can manage focus/scroll
 * (e.g. `startRideButtonRef.current.scrollIntoView()`).
 */
const Button = React.forwardRef(function Button({
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
}, ref) {
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
      ref={ref}
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
});

export default Button;

export const PrimaryButton = React.forwardRef(function PrimaryButton(props, ref) {
  return <Button ref={ref} variant="primary" {...props} />;
});

export const SecondaryButton = React.forwardRef(function SecondaryButton(props, ref) {
  return <Button ref={ref} variant="secondary" {...props} />;
});

export const OutlinedButton = React.forwardRef(function OutlinedButton(props, ref) {
  return <Button ref={ref} variant="outlined" {...props} />;
});

export const TextButton = React.forwardRef(function TextButton(props, ref) {
  return <Button ref={ref} variant="text" {...props} />;
});

export const IconButton = React.forwardRef(function IconButton({ "aria-label": ariaLabel, children, icon, ...rest }, ref) {
  return (
    <Button
      ref={ref}
      variant="icon"
      aria-label={ariaLabel}
      {...rest}
    >
      {icon || children}
    </Button>
  );
});

export const FloatingActionButton = React.forwardRef(function FloatingActionButton({ "aria-label": ariaLabel, children, icon, ...rest }, ref) {
  return (
    <Button
      ref={ref}
      variant="fab"
      aria-label={ariaLabel}
      {...rest}
    >
      {icon || children}
    </Button>
  );
});
