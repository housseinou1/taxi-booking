import React from "react";
import { cx } from "../utils/cx";

export default function Section({ title, action, children, className, ...rest }) {
  return (
    <section className={cx("yds-section", className)} {...rest}>
      {(title || action) && (
        <div className="yds-card__header" style={{ padding: 0, border: 0 }}>
          {title ? <h3 className="yds-section-title">{title}</h3> : <span />}
          {action || null}
        </div>
      )}
      {children}
    </section>
  );
}
