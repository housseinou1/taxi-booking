import React from "react";
import { cx } from "../utils/cx";
import Avatar from "./Avatar";

export default function ProfileCard({ name, subtitle, avatar, action, className, children, ...rest }) {
  return (
    <div className={cx("yds-card", "yds-profile-card", className)} {...rest}>
      <div className="yds-row" style={{ border: 0, padding: 0, gap: "var(--yds-space-3)" }}>
        {avatar ? <Avatar src={avatar} alt={name} size="lg" /> : null}
        <div className="yds-row__body">
          <strong className="yds-row__title">{name}</strong>
          {subtitle ? <small className="yds-row__subtitle">{subtitle}</small> : null}
        </div>
        {action || null}
      </div>
      {children}
    </div>
  );
}
