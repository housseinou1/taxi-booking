import React, { useEffect, useMemo, useState } from "react";

import { filterNavItems, resolveNavPath } from "./permissions/sidebarNavConfig";
import { usePermissions } from "../permissions/PermissionContext";

const COLLAPSE_KEY = "yala_admin_sidebar_collapsed";

export default function AdminSidebar({ pathname, mobileOpen, onMobileClose }) {
  const { permissions } = usePermissions();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [expandedGroups, setExpandedGroups] = useState({});

  const items = useMemo(() => filterNavItems(permissions), [permissions]);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const isActive = (path) => {
    if (!path) return false;
    const normalized = pathname.replace(/\/+$/, "");
    const target = path.replace(/\/+$/, "");
    if (normalized === target) return true;
    if (target !== "/admin" && normalized.startsWith(`${target}/`)) return true;
    return false;
  };

  const handleNav = (path) => {
    if (path && path !== pathname) {
      window.location.href = path;
    }
    onMobileClose?.();
  };

  const handleKeyDown = (event, path) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNav(path);
    }
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderLeaf = (item, nested = false) => {
    const path = resolveNavPath(item, permissions);
    const active = isActive(path);
    return (
      <button
        key={item.id}
        type="button"
        className={`admin-shell__nav-item ${active ? "admin-shell__nav-item--active" : ""} ${
          nested ? "admin-shell__nav-item--nested" : ""
        }`.trim()}
        aria-current={active ? "page" : undefined}
        title={item.label}
        onClick={() => handleNav(path)}
        onKeyDown={(e) => handleKeyDown(e, path)}
      >
        <span className="admin-shell__nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        {!collapsed ? <span className="admin-shell__nav-label">{item.label}</span> : null}
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
          {!collapsed ? <span className="admin-shell__sidebar-title">Navigation</span> : null}
          <button
            type="button"
            className="admin-shell__icon-btn"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="admin-shell__nav">
          {items.map((item) => {
            if (item.children?.length) {
              const expanded = expandedGroups[item.id] !== false;
              const childActive = item.children.some((child) => isActive(resolveNavPath(child, permissions)));
              return (
                <div key={item.id} className="admin-shell__nav-group">
                  <button
                    type="button"
                    className={`admin-shell__nav-item admin-shell__nav-group-toggle ${
                      childActive ? "admin-shell__nav-item--active" : ""
                    }`.trim()}
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(item.id)}
                  >
                    <span className="admin-shell__nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {!collapsed ? (
                      <>
                        <span className="admin-shell__nav-label">{item.label}</span>
                        <span className="admin-shell__nav-caret" aria-hidden="true">
                          {expanded ? "▾" : "▸"}
                        </span>
                      </>
                    ) : null}
                  </button>
                  {!collapsed && expanded ? (
                    <div className="admin-shell__nav-children">
                      {item.children.map((child) => renderLeaf(child, true))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return renderLeaf(item);
          })}
        </nav>
      </aside>
    </>
  );
}
