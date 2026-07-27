import React from "react";
import { cx } from "../utils/cx";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  className,
  as: Tag = "button",
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
  }[variant];

  return (
    <Tag
      className={cx("yds-btn", variantClass, `yds-btn--${size}`, className)}
      disabled={Tag === "button" && (rest.disabled || isLoading)}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading && <span className="yds-spinner" aria-hidden="true" style={{ marginRight: 8 }} />}
      {children}
    </Tag>
  );
}
