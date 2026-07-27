import React from "react";
import { cx } from "../utils/cx";

export default function AppBar({
  title,
  leading,
  actions,
  className,
  ...rest
}) {
  return (
    <header className={cx("yds-app-bar", className)} {...rest}>
      {leading || <span />}
      {title ? <h1 className="yds-app-bar__title">{title}</h1> : <span />}
      {actions || <span />}
    </header>
  );
}
