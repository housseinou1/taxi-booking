import React from "react";
import { cx } from "../utils/cx";

export default function Card({
  title,
  action,
  children,
  className,
  as: Tag = "section",
  ...rest
}) {
  return (
    <Tag className={cx("yds-card", className)} {...rest}>
      {(title || action) && (
        <div className="yds-card__header">
          {title ? <h3 className="yds-section-title">{title}</h3> : <span />}
          {action || null}
        </div>
      )}
      {children}
    </Tag>
  );
}
