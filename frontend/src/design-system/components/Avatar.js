import React from "react";
import { cx } from "../utils/cx";

export default function Avatar({
  src,
  alt = "",
  initials,
  size = "md",
  className,
  ...rest
}) {
  return (
    <span
      className={cx(
        "yds-avatar",
        size === "sm" && "yds-avatar--sm",
        size === "lg" && "yds-avatar--lg",
        className
      )}
      role="img"
      aria-label={alt || initials}
      {...rest}
    >
      {src ? <img src={src} alt={alt} /> : initials}
    </span>
  );
}
