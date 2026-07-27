import React from "react";
import { cx } from "../utils/cx";

export function Page({ as: Component = "main", className, children, ...rest }) {
  return (
    <Component className={cx("yds-page", className)} {...rest}>
      {children}
    </Component>
  );
}

export function Stack({ as: Component = "div", gap = "4", className, children, ...rest }) {
  return (
    <Component className={cx("yds-stack", `yds-gap-${gap}`, className)} {...rest}>
      {children}
    </Component>
  );
}

export function Grid({
  as: Component = "div",
  columns = "auto",
  gap = "4",
  className,
  children,
  ...rest
}) {
  return (
    <Component
      className={cx("yds-grid", `yds-grid--${columns}`, `yds-gap-${gap}`, className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
