import React from "react";
import { cx } from "../utils/cx";

export default function EmptyState({ icon, title, text, action, className, ...rest }) {
  return (
    <div className={cx("yds-empty", className)} {...rest}>
      {icon ? <span className="yds-empty__icon" aria-hidden="true">{icon}</span> : null}
      {title ? <h3 className="yds-empty__title">{title}</h3> : null}
      {text ? <p className="yds-empty__text">{text}</p> : null}
      {action || null}
    </div>
  );
}
