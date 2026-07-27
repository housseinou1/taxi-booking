import React from "react";
import { cx } from "../utils/cx";

export default function BottomNav({ items = [], active, onChange, className, ...rest }) {
  return (
    <nav className={cx("yds-bottom-nav", className)} {...rest}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="yds-bottom-nav__item"
          aria-current={active === item.key}
          onClick={() => onChange && onChange(item.key)}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}
