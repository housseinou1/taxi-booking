import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { filterNavItems, resolveNavPath } from "./permissions/sidebarNavConfig";
import { usePermissions } from "../permissions/PermissionContext";

const COLLAPSE_KEY = "yala_admin_sidebar_collapsed";

const normalize = (value) => (value || "").replace(/\/+$/, "") || "/";

/**
 * YALA Admin sidebar.
 *
 * - Ten business categories; only one accordion group is open at a time.
 * - The category containing the current page opens automatically.
 * - Collapsed preference persists in localStorage.
 * - Collapsed mode shows tooltips and stays keyboard operable.
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
  const [openGroupId, setOpenGroupId] = useState(null);
  const navRef = useRef(null);

  const items = useMemo(() => filterNavItems(permissions), [permissions]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch (error) {
      /* preference is best-effort only */
    }
  }, [collapsed]);

  const isActive = useCallback(
    (path) => {
      if (!path) return false;
      const current = normalize(pathname);
      const target = normalize(path);
      if (current === target) return true;
      return target !== "/admin" && current.startsWith(`${target}/`);
    },
    [pathname]
  );

  // Which category owns the page currently on screen.
  const activeGroupId = useMemo(() => {
    const match = items.find((item) =>
      item.children?.some((child) => isActive(resolveNavPath(child, permissions)))
    );
    return match ? match.id : null;
  }, [items, isActive, permissions]);

  useEffect(() => {
    setOpenGroupId(activeGroupId);
  }, [activeGroupId]);

  const handleNav = (path) => {
    if (path && normalize(path) !== normalize(pathname)) {
      window.location.href = path;
    }
    onMobileClose?.();
  };

  // Roving focus across every actionable entry (groups and links).
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
      // Expanding a category from collapsed mode also restores the sidebar.
      setCollapsed(false);
      setOpenGroupId(groupId);
      return;
    }
    setOpenGroupId((prev) => (prev === groupId ? null : groupId));
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
          {item.icon}
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
          <span className="admin-shell__sidebar-title">Navigation</span>
          <button
            type="button"
            className="admin-shell__icon-btn admin-shell__sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav className="admin-shell__nav" ref={navRef} onKeyDown={onNavKeyDown}>
          {items.map((item) => {
            if (!item.children?.length) {
              return renderLink(item, false);
            }

            const childActive = item.children.some((child) =>
              isActive(resolveNavPath(child, permissions))
            );
            const expanded = !collapsed && openGroupId === item.id;

            return (
              <div key={item.id} className="admin-shell__nav-group">
                <button
                  type="button"
                  data-nav-focusable="true"
                  data-tooltip={item.label}
                  className={`admin-shell__nav-item admin-shell__nav-group-toggle ${
                    childActive ? "admin-shell__nav-item--active" : ""
                  }`.trim()}
                  aria-expanded={expanded}
                  onClick={() => toggleGroup(item.id)}
                >
                  <span className="admin-shell__nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="admin-shell__nav-label">{item.label}</span>
                  <span className="admin-shell__nav-caret" aria-hidden="true">
                    {expanded ? "▾" : "▸"}
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
        </nav>
      </aside>
    </>
  );
}
