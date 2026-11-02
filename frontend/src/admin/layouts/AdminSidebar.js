import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { filterNavItems, flattenNavItems, resolveNavPath } from "./permissions/sidebarNavConfig";
import { URL_CHANGE_EVENT } from "./useUrlTab";
import { usePermissions } from "../permissions/PermissionContext";
import AdminIcon from "./icons/AdminIcon";
import MauritaniaFlag from "./icons/MauritaniaFlag";

const COLLAPSE_KEY = "yala_admin_sidebar_collapsed";

const normalize = (value) => (value || "").replace(/\/+$/, "") || "/";
const matches = (label, query) => (label || "").toLowerCase().includes(query);

/**
 * YALA Admin sidebar.
 *
 * - Fixed brand header (logo, product name, collapse control) and menu search.
 * - Only RBAC-authorised entries are rendered (`filterNavItems`); the shell
 *   still enforces route access independently.
 * - Several categories may stay expanded at once; the category owning the
 *   current page opens automatically.
 * - The <nav> scrolls independently of the page.
 */
export default function AdminSidebar({ pathname, mobileOpen, onMobileClose }) {
  const { permissions } = usePermissions();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch (error) {
      return false;
    }
  });
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const navRef = useRef(null);

  const items = useMemo(() => filterNavItems(permissions), [permissions]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (error) {
      /* preference is best-effort only */
    }
  }, [collapsed]);

  const [search, setSearch] = useState(() => (typeof window === "undefined" ? "" : window.location.search));

  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener(URL_CHANGE_EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(URL_CHANGE_EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  // Some pages pass a canonical alias as `pathname` (e.g. /admin/integration for
  // /admin/api-gateway); highlight the entry for the URL actually opened.
  const browserPath = typeof window === "undefined" ? "" : window.location.pathname;
  const currentPath = browserPath.startsWith("/admin") ? browserPath : pathname;

  const exactPaths = useMemo(() => {
    const current = normalize(currentPath);
    const params = new URLSearchParams(search);
    const hits = flattenNavItems(items)
      .map((item) => resolveNavPath(item, permissions))
      .filter((path) => {
        if (!path) return false;
        const [target, query] = path.split("?");
        if (normalize(target) !== current) return false;
        return Array.from(new URLSearchParams(query || "")).every(([key, value]) => params.get(key) === value);
      });
    const withQuery = hits.filter((path) => path.includes("?"));
    return new Set(withQuery.length ? withQuery : hits);
  }, [items, permissions, currentPath, search]);

  const isActive = useCallback(
    (path) => {
      if (!path) return false;
      if (exactPaths.size) return exactPaths.has(path);
      const target = normalize(path.split("?")[0]);
      return target !== "/admin" && normalize(currentPath).startsWith(`${target}/`);
    },
    [exactPaths, currentPath]
  );

  const activeGroupId = useMemo(() => {
    const match = items.find((item) =>
      item.children?.some((child) => isActive(resolveNavPath(child, permissions)))
    );
    return match ? match.id : null;
  }, [items, isActive, permissions]);

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => {
      if (prev.has(activeGroupId)) return prev;
      const next = new Set(prev);
      next.add(activeGroupId);
      return next;
    });
  }, [activeGroupId]);

  const trimmedQuery = query.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    if (!trimmedQuery) return items;
    return items
      .map((item) => {
        if (!item.children?.length) {
          return matches(item.label, trimmedQuery) ? item : null;
        }
        if (matches(item.label, trimmedQuery)) return item;
        const children = item.children.filter((child) => matches(child.label, trimmedQuery));
        return children.length ? { ...item, children } : null;
      })
      .filter(Boolean);
  }, [items, trimmedQuery]);

  const handleNav = (path) => {
    if (path && path !== `${normalize(currentPath)}${search}`) {
      window.location.href = path;
    }
    onMobileClose?.();
  };

  const onNavKeyDown = (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const focusable = Array.from(
      navRef.current?.querySelectorAll("[data-nav-focusable='true']") || []
    );
    if (!focusable.length) return;
    const index = focusable.indexOf(document.activeElement);
    let next = index < 0 ? 0 : index;
    if (event.key === "ArrowDown") next = index < 0 ? 0 : Math.min(index + 1, focusable.length - 1);
    if (event.key === "ArrowUp") next = index < 0 ? 0 : Math.max(index - 1, 0);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = focusable.length - 1;
    event.preventDefault();
    focusable[next]?.focus();
  };

  const toggleGroup = (groupId) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenGroups((prev) => new Set(prev).add(groupId));
      return;
    }
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const renderLink = (item, nested) => {
    const path = resolveNavPath(item, permissions);
    const active = isActive(path);
    return (
      <button
        key={item.id}
        type="button"
        data-nav-focusable="true"
        data-tooltip={item.label}
        className={`admin-shell__nav-item ${active ? "admin-shell__nav-item--active" : ""} ${
          nested ? "admin-shell__nav-item--nested" : ""
        }`.trim()}
        aria-current={active ? "page" : undefined}
        onClick={() => handleNav(path)}
      >
        <span className="admin-shell__nav-icon" aria-hidden="true">
          <AdminIcon name={item.icon} size={nested ? 15 : 18} />
        </span>
        <span className="admin-shell__nav-label">{item.label}</span>
      </button>
    );
  };

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="admin-shell__sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={onMobileClose}
        />
      ) : null}

      <aside
        className={`admin-shell__sidebar ${collapsed ? "admin-shell__sidebar--collapsed" : ""} ${
          mobileOpen ? "admin-shell__sidebar--mobile-open" : ""
        }`.trim()}
        aria-label="Admin navigation"
      >
        <div className="admin-shell__sidebar-head">
          <a href="/admin" className="admin-shell__sidebar-brand" title="YALA Admin home">
            <img src="/yala-admin-logo.png" alt="YALA" className="admin-shell__sidebar-logo" />
            <span className="admin-shell__sidebar-brand-text">
              <span className="admin-shell__sidebar-title">YALA Admin</span>
              <span className="admin-shell__sidebar-subtitle">YALA Technologies</span>
            </span>
            <MauritaniaFlag className="admin-shell__sidebar-flag" />
          </a>
          <button
            type="button"
            className="admin-shell__sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <AdminIcon name={collapsed ? "chevrons-right" : "chevrons-left"} size={16} />
          </button>
          <button
            type="button"
            className="admin-shell__sidebar-close"
            aria-label="Close navigation menu"
            onClick={onMobileClose}
          >
            <AdminIcon name="x" size={18} />
          </button>
        </div>

        <div className="admin-shell__sidebar-search">
          <AdminIcon name="search" size={15} className="admin-shell__sidebar-search-icon" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search menu..."
            aria-label="Search menu"
          />
        </div>

        <nav className="admin-shell__nav" ref={navRef} onKeyDown={onNavKeyDown}>
          {visibleItems.map((item) => {
            if (!item.children?.length) {
              return renderLink(item, false);
            }

            const childActive = item.children.some((child) =>
              isActive(resolveNavPath(child, permissions))
            );
            const expanded = !collapsed && (Boolean(trimmedQuery) || openGroups.has(item.id));

            return (
              <div
                key={item.id}
                className={`admin-shell__nav-group ${expanded ? "admin-shell__nav-group--open" : ""}`.trim()}
              >
                <button
                  type="button"
                  data-nav-focusable="true"
                  data-tooltip={item.label}
                  className={`admin-shell__nav-item admin-shell__nav-group-toggle ${
                    childActive ? "admin-shell__nav-item--group-active" : ""
                  }`.trim()}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(item.id)}
                >
                  <span className="admin-shell__nav-icon" aria-hidden="true">
                    <AdminIcon name={item.icon} size={18} />
                  </span>
                  <span className="admin-shell__nav-label">{item.label}</span>
                  <span className="admin-shell__nav-caret" aria-hidden="true">
                    <AdminIcon name="chevron-down" size={14} />
                  </span>
                </button>

                {expanded ? (
                  <div className="admin-shell__nav-children">
                    {item.children.map((child) => renderLink(child, true))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {trimmedQuery && !visibleItems.length ? (
            <p className="admin-shell__nav-empty">No menu items match “{query.trim()}”.</p>
          ) : null}
        </nav>
      </aside>
    </>
  );
}
