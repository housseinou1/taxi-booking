import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { IconCar, IconMap, IconPackage, IconShield } from "./WebsiteIcons";
import { loadWebsiteCityCatalog } from "./websitePublicCities";
import { useWebsiteAuth } from "./useWebsiteAuth";

const LOGIN_LINKS = [
  { key: "loginRider", href: "/login?next=%2Frider-dashboard", Icon: IconCar },
  { key: "loginDriver", href: "/login?next=%2Fdriver", Icon: IconCar },
  { key: "loginDelivery", href: "/login?next=%2Fdelivery%2Fcourier", Icon: IconPackage },
  { key: "loginAdmin", href: "/login?next=%2Fadmin", Icon: IconShield },
];

function useNavDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return { open, setOpen, ref, toggle, close, setOpenState: setOpen };
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
      />
    </svg>
  );
}

export function WebsiteLoginNavDropdown({ t, className = "", onNavigateClose }) {
  const menuId = useId();
  const { open, ref, toggle, close } = useNavDropdown();
  const auth = useWebsiteAuth();

  const onAccountNav = (href) => (event) => {
    event.preventDefault();
    close();
    onNavigateClose?.();
    window.location.href = href;
  };

  const onLogout = async (event) => {
    event.preventDefault();
    close();
    onNavigateClose?.();
    await auth.logout();
  };

  if (auth.authed) {
    return (
      <div className={`ys-nav-dd${open ? " ys-nav-dd--open" : ""}${className ? ` ${className}` : ""}`} ref={ref}>
        <button
          type="button"
          className="ys-nav-dd-trigger"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={toggle}
        >
          {t("navMyAccount")}
          <span className="ys-chev" aria-hidden="true" />
        </button>
        <div className="ys-nav-dd-menu" id={menuId} role="menu">
          <a href={auth.dashboardPath} role="menuitem" onClick={onAccountNav(auth.dashboardPath)}>
            {t("accountDashboard")}
          </a>
          <a href={auth.profilePath} role="menuitem" onClick={onAccountNav(auth.profilePath)}>
            {t("accountProfile")}
          </a>
          <button type="button" className="ys-nav-dd-action" role="menuitem" onClick={onLogout}>
            {t("accountLogout")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`ys-nav-dd${open ? " ys-nav-dd--open" : ""}${className ? ` ${className}` : ""}`} ref={ref}>
      <button
        type="button"
        className="ys-nav-dd-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={toggle}
      >
        {t("navLogin")}
        <span className="ys-chev" aria-hidden="true" />
      </button>
      <div className="ys-nav-dd-menu" id={menuId} role="menu">
        {LOGIN_LINKS.map(({ key, href, Icon }) => (
          <a key={key} href={href} role="menuitem" className="ys-nav-dd-row" onClick={() => { close(); onNavigateClose?.(); }}>
            <Icon className="ys-nav-dd-ico" />
            <span>{t(key)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function WebsiteCitiesNavDropdown({ t, onCitySelect, className = "", onNavigateClose }) {
  const menuId = useId();
  const { open, ref, toggle, close, setOpenState } = useNavDropdown();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    loadWebsiteCityCatalog()
      .then((data) => {
        if (!cancelled) {
          setCatalog(data);
          setLoadError(data.apiError);
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err?.message || "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const id = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const entries = catalog?.entries || [];
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (row) =>
        row.city.toLowerCase().includes(q) ||
        row.region.toLowerCase().includes(q) ||
        String(row.canonical || "").toLowerCase().includes(q)
    );
  }, [catalog, query]);

  const pickCity = (row) => (event) => {
    event.preventDefault();
    close();
    onNavigateClose?.();
    onCitySelect?.({
      city: row.city,
      region: row.region,
      canonical: row.canonical,
      operational: row.operational,
      districts: row.city === "Nouakchott" ? catalog?.nouakchottDistricts || [] : [],
    });
    setQuery("");
    setOpenState(false);
  };

  return (
    <div
      className={`ys-nav-dd ys-nav-dd--cities${open ? " ys-nav-dd--open" : ""}${className ? ` ${className}` : ""}`}
      ref={ref}
      onMouseLeave={() => setOpenState(false)}
    >
      <button
        type="button"
        className="ys-nav-dd-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={toggle}
      >
        {t("navCities")}
        <span className="ys-chev" aria-hidden="true" />
      </button>
      <div className="ys-nav-dd-menu ys-nav-dd-menu--cities" id={menuId} role="menu">
        <div className="ys-cities-dd-search">
          <IconMap className="ys-cities-dd-search-ico" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("citiesSearchPlaceholder")}
            aria-label={t("citiesSearchPlaceholder")}
            autoComplete="off"
          />
        </div>
        {loading ? (
          <p className="ys-cities-dd-msg" role="status">
            {t("citiesLoading")}
          </p>
        ) : null}
        {!loading && loadError ? (
          <p className="ys-cities-dd-msg ys-cities-dd-msg--warn" role="status">
            {t("citiesError")}
          </p>
        ) : null}
        <div className="ys-cities-dd-scroll" role="group" aria-label={t("navCities")}>
          {!loading && filtered.length === 0 ? (
            <p className="ys-cities-dd-msg">{t("citiesEmpty")}</p>
          ) : (
            filtered.map((row) => (
              <button
                type="button"
                key={`${row.region}-${row.city}`}
                className="ys-cities-dd-item"
                role="menuitem"
                onClick={pickCity(row)}
              >
                <span className="ys-cities-dd-item-ico">
                  <PinIcon />
                </span>
                <span className="ys-cities-dd-item-body">
                  <strong>{row.city}</strong>
                  <small>{row.region}</small>
                </span>
                <span className={`ys-cities-dd-badge${row.operational ? " ys-cities-dd-badge--on" : ""}`}>
                  {row.operational ? t("cityOperational") : t("cityPlanned")}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
