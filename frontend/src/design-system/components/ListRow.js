import React from "react";
import { cx } from "../utils/cx";

export default function ListRow({
  icon,
  title,
  subtitle,
  meta,
  onClick,
  as: Tag = onClick ? "button" : "div",
  className,
  children,
  ...rest
}) {
  const interactive = Boolean(onClick) || Tag === "button";
  return (
    <Tag
      className={cx("yds-row", className)}
      onClick={onClick}
      type={Tag === "button" ? "button" : undefined}
      {...rest}
    >
      {icon ? <span className="yds-row__icon" aria-hidden="true">{icon}</span> : null}
      <span className="yds-row__body">
        <strong className="yds-row__title">{title}</strong>
        {subtitle ? <small className="yds-row__subtitle">{subtitle}</small> : null}
      </span>
      {meta != null ? <span className="yds-row__meta">{meta}</span> : null}
      {interactive ? <span className="yds-row__meta" aria-hidden="true">›</span> : null}
      {children}
    </Tag>
  );
}
