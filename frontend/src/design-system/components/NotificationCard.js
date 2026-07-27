import React from "react";
import { cx } from "../utils/cx";

export default function NotificationCard({
  title,
  body,
  time,
  unread = false,
  icon,
  className,
  onClick,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx("yds-row", unread && "yds-row--unread", className)}
      onClick={onClick}
      style={{ textAlign: "left", width: "100%" }}
      {...rest}
    >
      {icon ? <span className="yds-row__icon" aria-hidden="true">{icon}</span> : null}
      <span className="yds-row__body">
        <strong className="yds-row__title">{title}</strong>
        {body ? <small className="yds-row__subtitle">{body}</small> : null}
      </span>
      {time ? <span className="yds-row__meta">{time}</span> : null}
      {unread ? <span className="yds-badge" aria-hidden="true" /> : null}
    </button>
  );
}
