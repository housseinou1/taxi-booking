import React, { useCallback, useEffect, useMemo, useState } from "react";
import authenticatedApi from "../auth/authenticatedApi";
import { API_URL } from "../apiConfig";
import { navigateInApp } from "../navigation/inAppNavigation";
import {
  DriverLoadingState,
  DriverEmptyState,
  DriverErrorState,
} from "./ui/DriverAppStates";
import {
  DRIVER_NOTIFICATION_CATEGORIES,
  getDriverNotificationCategory,
  getDriverNotificationIcon,
  getDriverNotificationDeepLink,
} from "./utils/driverNotificationCategories";
import "./DriverNotificationsPage.css";

export function formatRelativeTime(value, now = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";

  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / (1000 * 60));

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, now)) {
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    return `Today at ${time}`;
  }

  if (isSameDay(date, yesterday)) {
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
    return `Yesterday at ${time}`;
  }

  const full = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return full;
}

export function groupNotifications(items, now = new Date()) {
  if (!Array.isArray(items)) return [];

  const today = [];
  const yesterday = [];
  const earlier = [];

  const nowDay = new Date(now);
  const yesterdayDay = new Date(now);
  yesterdayDay.setDate(yesterdayDay.getDate() - 1);

  items.forEach((item) => {
    const date = item.created_at ? new Date(item.created_at) : null;
    if (!date || isNaN(date.getTime())) {
      earlier.push(item);
      return;
    }

    if (date.toDateString() === nowDay.toDateString()) {
      today.push(item);
    } else if (date.toDateString() === yesterdayDay.toDateString()) {
      yesterday.push(item);
    } else {
      earlier.push(item);
    }
  });

  const sortDesc = (a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

  const groups = [];
  if (today.length) groups.push({ label: "Today", items: today.sort(sortDesc) });
  if (yesterday.length) groups.push({ label: "Yesterday", items: yesterday.sort(sortDesc) });
  if (earlier.length) groups.push({ label: "Earlier", items: earlier.sort(sortDesc) });

  return groups;
}

function getVisibleRoute(item) {
  if (item.url) return item.url;
  if (item.deep_link) return item.deep_link;
  const category = getDriverNotificationCategory(item.type);
  if (category === "announcements") return null;
  const route = getDriverNotificationDeepLink(item);
  return route || null;
}

function hasDetail(item) {
  const detail = item.data ?? item.details ?? null;
  if (detail == null) return false;
  if (typeof detail !== "object") return true;
  if (Array.isArray(detail)) return detail.length > 0;
  return Object.keys(detail).length > 0;
}

function renderDetail(detail) {
  if (detail == null) return null;
  if (typeof detail !== "object") {
    return <p className="dnp__detail-text">{String(detail)}</p>;
  }
  if (Array.isArray(detail)) {
    return (
      <ul className="dnp__detail-list">
        {detail.map((value, index) => (
          <li key={index} className="dnp__detail-item">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="dnp__detail-def">
      {Object.entries(detail).map(([key, value]) => (
        <div key={key} className="dnp__detail-row">
          <dt className="dnp__detail-key">{key}</dt>
          <dd className="dnp__detail-value">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread", unreadOnly: true },
  { id: "ride", label: "Rides", categoryIds: ["ride"] },
  { id: "earnings", label: "Payments / Earnings", categoryIds: ["earnings"] },
  { id: "documents", label: "Documents", categoryIds: ["documents"] },
  { id: "system", label: "System / Support", categoryIds: ["support", "safety", "announcements"] },
];

export default function DriverNotificationsPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    setActionError("");
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/notifications/`
      );
      const data = response?.data ?? {};
      const notifications = Array.isArray(data.items) ? data.items : [];
      setItems(notifications);
      if (!refresh) setError("");
    } catch (err) {
      if (refresh) {
        setActionError("Could not refresh. Try again.");
      } else {
        setError("Could not load notifications. Please try again.");
      }
    } finally {
      if (refresh) setRefreshing(false);
      else setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markOneRead = useCallback(async (id) => {
    if (markingIds.has(id) || markingAll) return;
    setMarkingIds((prev) => new Set(prev).add(id));
    setActionError("");
    try {
      await authenticatedApi.post(`${API_URL}/notifications/read/`, { ids: [id] });
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );
    } catch {
      setActionError("Could not mark as read. Try again.");
    } finally {
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [markingIds, markingAll]);

  const markAllRead = useCallback(async () => {
    if (markingAll || markingIds.size) return;
    const ids = items.map((item) => item.id).filter(Boolean);
    if (!ids.length) return;
    setMarkingAll(true);
    setActionError("");
    try {
      await authenticatedApi.post(`${API_URL}/notifications/read/`, { ids });
      setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch {
      setActionError("Could not mark all as read. Try again.");
    } finally {
      setMarkingAll(false);
    }
  }, [items, markingAll, markingIds.size]);

  const onOpen = useCallback((item) => {
    const route = getVisibleRoute(item);
    if (route) navigateInApp(route);
  }, []);

  const onToggleExpand = useCallback((id) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    const active = FILTERS.find((f) => f.id === filter);
    if (!active) return items;
    return items.filter((item) => {
      if (active.unreadOnly) return !item.is_read;
      if (active.categoryIds) {
        return active.categoryIds.includes(getDriverNotificationCategory(item.type));
      }
      return true;
    });
  }, [items, filter]);

  const groups = useMemo(
    () => groupNotifications(filteredItems),
    [filteredItems]
  );

  const summary = useMemo(() => {
    const total = items.length;
    const showing = filteredItems.length;
    const unread = items.filter((i) => !i.is_read).length;
    return { total, showing, unread };
  }, [items, filteredItems]);

  if (loading) {
    return (
      <main className="dnp">
        <h1 className="dnp__title">Notifications</h1>
        <DriverLoadingState title="Loading notifications" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="dnp">
        <h1 className="dnp__title">Notifications</h1>
        <DriverErrorState
          title="Could not load notifications"
          message={error}
          onAction={load}
        />
      </main>
    );
  }

  const activeFilter = FILTERS.find((f) => f.id === filter) || FILTERS[0];

  const emptyProps = (() => {
    if (items.length === 0) {
      return {
        title: "No notifications yet",
        message: "Ride, earnings, and document updates will appear here.",
        actionLabel: "Refresh",
        onAction: () => load({ refresh: true }),
      };
    }
    if (filteredItems.length === 0) {
      if (filter === "unread") {
        return {
          title: "No unread notifications",
          message: "You're all caught up.",
          actionLabel: "Show all",
          onAction: () => setFilter("all"),
        };
      }
      if (filter !== "all") {
        return {
          title: "No notifications in this category",
          message: `There are no ${activeFilter.label.toLowerCase()} notifications.`,
          actionLabel: "Clear filter",
          onAction: () => setFilter("all"),
        };
      }
    }
    return null;
  })();

  return (
    <main className="dnp">
      <h1 className="dnp__title">Notifications</h1>

      <section className="dnp__filters" aria-label="Notification filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`dnp__filter ${
              f.id === filter ? "dnp__filter--active" : ""
            }`}
            aria-pressed={f.id === filter}
            onClick={() => {
              setFilter(f.id);
              setActionError("");
            }}
            disabled={refreshing}
          >
            {f.label}
          </button>
        ))}
      </section>

      <section
        className="dnp__summary"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Notification summary"
      >
        <span className="dnp__count">
          {summary.total === 0
            ? "No notifications"
            : `Showing ${summary.showing} of ${summary.total} · ${summary.unread} unread`}
        </span>
        <div className="dnp__actions">
          {summary.unread > 0 ? (
            <button
              type="button"
              className="dnp__mark-all"
              onClick={markAllRead}
              disabled={markingAll || refreshing || markingIds.size > 0}
              aria-label="Mark all notifications as read"
            >
              {markingAll ? "Marking..." : "Mark all as read"}
            </button>
          ) : null}
          <button
            type="button"
            className="dnp__refresh"
            onClick={() => load({ refresh: true })}
            disabled={refreshing || markingAll || markingIds.size > 0}
            aria-label="Refresh notifications"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      {actionError ? (
        <div className="dnp__action-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {emptyProps ? (
        <DriverEmptyState
          title={emptyProps.title}
          message={emptyProps.message}
          actionLabel={emptyProps.actionLabel}
          onAction={emptyProps.onAction}
        />
      ) : (
        <div className="dnp__groups" role="region" aria-label="Notifications list">
          {groups.map((group) => (
            <section key={group.label} className="dnp__group" aria-label={group.label}>
              <h2 className="dnp__group-title">{group.label}</h2>
              <ul className="dnp__group-list">
                {group.items.map((item) => {
                  const isUnread = !item.is_read;
                  const category = getDriverNotificationCategory(item.type);
                  const icon = getDriverNotificationIcon(item.type);
                  const info =
                    DRIVER_NOTIFICATION_CATEGORIES.find((c) => c.id === category);
                  const route = getVisibleRoute(item);
                  const titleId = `dnp-title-${item.id}`;
                  const statusId = `dnp-status-${item.id}`;
                  const detailsId = `dnp-details-${item.id}`;
                  const isExpanded = expandedId === item.id;
                  const canExpand = hasDetail(item);

                  return (
                    <li
                      key={item.id}
                      className="dnp__card"
                      aria-labelledby={titleId}
                      aria-describedby={statusId}
                    >
                      <span className="dnp__card-icon" aria-hidden="true">
                        {icon}
                      </span>
                      <div className="dnp__card-body">
                        <div className="dnp__card-header">
                          {route ? (
                            <button
                              type="button"
                              className="dnp__card-title dnp__card-title--link"
                              id={titleId}
                              onClick={() => onOpen(item)}
                              aria-label={`Open ${item.title}`}
                            >
                              {item.title}
                            </button>
                          ) : (
                            <span className="dnp__card-title" id={titleId}>
                              {item.title}
                            </span>
                          )}
                          <span
                            className={`dnp__card-status ${
                              isUnread ? "" : "dnp__card-status--read"
                            }`}
                            id={statusId}
                          >
                            {isUnread ? "Unread" : "Read"}
                          </span>
                        </div>
                        {item.body ? (
                          <p className="dnp__card-text">{item.body}</p>
                        ) : null}
                        <p className="dnp__card-meta">
                          <span className="dnp__card-time">
                            {formatRelativeTime(item.created_at)}
                          </span>
                          {info ? (
                            <span className="dnp__card-category">{info.label}</span>
                          ) : null}
                        </p>
                        {isExpanded ? (
                          <div
                            id={detailsId}
                            className="dnp__card-details"
                            role="region"
                            aria-labelledby={titleId}
                          >
                            {renderDetail(item.data ?? item.details)}
                          </div>
                        ) : null}
                      </div>
                      <div className="dnp__card-actions">
                        {isUnread ? (
                          <button
                            type="button"
                            className="dnp__card-mark"
                            onClick={() => markOneRead(item.id)}
                            disabled={markingIds.has(item.id) || markingAll}
                            aria-label={`Mark ${item.title} as read`}
                          >
                            {markingIds.has(item.id) ? "..." : "Mark as read"}
                          </button>
                        ) : null}
                        {canExpand ? (
                          <button
                            type="button"
                            className="dnp__card-expand"
                            onClick={() => onToggleExpand(item.id)}
                            aria-expanded={isExpanded}
                            aria-controls={detailsId}
                            aria-label={isExpanded ? "Hide details" : "Show details"}
                          >
                            {isExpanded ? "Collapse" : "Expand"}
                          </button>
                        ) : null}
                        {!isUnread && !canExpand ? (
                          <span className="dnp__card-read" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
