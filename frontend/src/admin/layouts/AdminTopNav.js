import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { filterTopNavItems } from "./permissions/topNavConfig";
import { resolveNavPath } from "./permissions/sidebarNavConfig";
import { usePermissions } from "../permissions/PermissionContext";
import AdminTopNavIcon from "./AdminTopNavIcons";

const normalize = (value) => (value || "").replace(/\/+$/, "") || "/";

export default function AdminTopNav({ pathname, mobileOpen, onMobileClose }) {
  const { permissions } = usePermissions();
  const groups = useMemo(() => filterTopNavItems(permissions), [permissions]);
  const [openId, setOpenId] = useState(null);
  const navRef = useRef(null);
  const groupBtnRefs = useRef([]);
  const menuItemRefsByGroup = useRef({});

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

  const groupActive = useCallback(
    (children) => children.some((c) => isActive(resolveNavPath(c, permissions))),
    [isActive, permissions]
  );

  const navigate = useCallback(
    (path) => {
      if (path && normalize(path) !== normalize(pathname)) {
        window.location.href = path;
      }
      onMobileClose?.();
      setOpenId(null);
    },
    [onMobileClose, pathname]
  );

  const closePanel = useCallback(() => setOpenId(null), []);

  const focusGroupButton = useCallback((index) => {
    const el = groupBtnRefs.current[index];
    if (el && typeof el.focus === "function") el.focus();
  }, []);

  const focusMenuItem = useCallback((groupId, index) => {
    const list = menuItemRefsByGroup.current[groupId];
    const el = list?.[index];
    if (el && typeof el.focus === "function") el.focus();
  }, []);

  const openGroup = useCallback((groupId) => {
    setOpenId(groupId);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!navRef.current?.contains(e.target)) closePanel();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [closePanel]);

  const handleGroupKeyDown = useCallback(
    (e, group, groupIndex) => {
      const key = e.key;

      if (key === "ArrowDown") {
        e.preventDefault();
        if (openId !== group.id) openGroup(group.id);
        // After paint, focus first item
        setTimeout(() => focusMenuItem(group.id, 0), 0);
        return;
      }

      if (key === "ArrowUp") {
        e.preventDefault();
        if (openId !== group.id) openGroup(group.id);
        setTimeout(() => {
          const list = menuItemRefsByGroup.current[group.id] || [];
          const last = list.length - 1;
          focusMenuItem(group.id, last >= 0 ? last : 0);
        }, 0);
        return;
      }

      if (key === "ArrowRight") {
        e.preventDefault();
        closePanel();
        const next = Math.min(groupIndex + 1, groups.length - 1);
        focusGroupButton(next);
        return;
      }

      if (key === "ArrowLeft") {
        e.preventDefault();
        closePanel();
        const prev = Math.max(groupIndex - 1, 0);
        focusGroupButton(prev);
        return;
      }

      if (key === "Home") {
        e.preventDefault();
        closePanel();
        focusGroupButton(0);
        return;
      }

      if (key === "End") {
        e.preventDefault();
        closePanel();
        focusGroupButton(groups.length - 1);
        return;
      }

      if (key === "Enter" || key === " ") {
        if (openId === group.id) {
          e.preventDefault();
          const firstPath = resolveNavPath(group.children[0], permissions);
          navigate(firstPath);
        }
      }
    },
    [closePanel, focusGroupButton, focusMenuItem, groups.length, navigate, openGroup, openId, permissions]
  );

  const handleMenuItemKeyDown = useCallback(
    (e, idx, group, groupIndex) => {
      const n = group.children.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusMenuItem(group.id, (idx + 1) % n);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusMenuItem(group.id, (idx - 1 + n) % n);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
        focusGroupButton(groupIndex);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        closePanel();
        const next = Math.min(groupIndex + 1, groups.length - 1);
        focusGroupButton(next);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        closePanel();
        const prev = Math.max(groupIndex - 1, 0);
        focusGroupButton(prev);
        return;
      }
    },
    [closePanel, focusGroupButton, focusMenuItem, groups.length]
  );

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="admin-shell__primary-backdrop"
          aria-label="Close navigation menu"
          onClick={onMobileClose}
        />
      ) : null}

      <nav
        ref={navRef}
        className={`admin-shell__primary-nav ${mobileOpen ? "admin-shell__primary-nav--mobile-open" : ""}`}
        aria-label="Primary"
      >
        {groups.map((group, groupIndex) => {
          const active = groupActive(group.children);
          const expanded = openId === group.id;
          const panelId = `admin-nav-panel-${group.id}`;
          const labelId = `admin-nav-label-${group.id}`;

          if (expanded) {
            menuItemRefsByGroup.current[group.id] = [];
          }

          return (
            <div
              key={group.id}
              className={`admin-shell__nav-mega-wrap${expanded ? " admin-shell__nav-mega-wrap--open" : ""}`}
            >
              <button
                ref={(el) => {
                  groupBtnRefs.current[groupIndex] = el;
                }}
                type="button"
                id={labelId}
                className={`admin-shell__nav-top ${active ? "admin-shell__nav-top--active" : ""}`}
                aria-expanded={expanded}
                aria-haspopup="true"
                aria-controls={panelId}
                onClick={() => setOpenId((v) => (v === group.id ? null : group.id))}
                onKeyDown={(e) => handleGroupKeyDown(e, group, groupIndex)}
              >
                <span className="admin-shell__nav-top-icon" aria-hidden="true">
                  <AdminTopNavIcon name={group.icon} />
                </span>
                <span className="admin-shell__nav-top-label">{group.label}</span>
                <span className="admin-shell__nav-top-caret" aria-hidden="true">
                  ▾
                </span>
              </button>

              <div
                className="admin-shell__nav-mega"
                id={panelId}
                role="menu"
                aria-labelledby={labelId}
                hidden={!expanded}
              >
                {group.children.map((child, idx) => {
                  const path = resolveNavPath(child, permissions);
                  const childActive = isActive(path);
                  return (
                    <button
                      key={child.id}
                      ref={(el) => {
                        if (!expanded) return;
                        const arr = menuItemRefsByGroup.current[group.id] || (menuItemRefsByGroup.current[group.id] = []);
                        arr[idx] = el;
                      }}
                      type="button"
                      role="menuitem"
                      tabIndex={expanded ? 0 : -1}
                      className={`admin-shell__nav-mega-item ${childActive ? "admin-shell__nav-mega-item--active" : ""}`}
                      aria-current={childActive ? "page" : undefined}
                      onClick={() => navigate(path)}
                      onKeyDown={(e) => handleMenuItemKeyDown(e, idx, group, groupIndex)}
                    >
                      <span className="admin-shell__nav-mega-ico" aria-hidden="true">
                        <AdminTopNavIcon name={child.icon} />
                      </span>
                      <span>{child.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}
