import React from "react";

import { COURIER_NAV_ITEMS } from "../courierNavItems";
import CourierNavIcon from "./CourierNavIcon";

function navigateTo(path) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function CourierBottomNav({
  activeNav,
  navClassName = "cce-nav",
  buttonClassName = "cce-nav__btn",
  labelClassName = "",
  ariaLabel = "Delivery navigation",
}) {
  return (
    <nav className={navClassName} aria-label={ariaLabel}>
      {COURIER_NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={[buttonClassName, activeNav === item.key ? "is-active" : ""].filter(Boolean).join(" ")}
          onClick={() => navigateTo(item.href)}
        >
          <CourierNavIcon name={item.icon} />
          <span className={labelClassName}>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
