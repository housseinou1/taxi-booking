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

function formatTime(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread", unreadOnly: true },
  { id: "ride", label: "Rides", categoryIds: ["ride"] },
  { id: "earnings", label: "Payments / Earnings", categoryIds: ["earnings"] },
  { id: "documents", label: "Documents", categoryIds: ["documents"] },
  { id: "system", label: "System / Support", categoryIds: ["support", "safety", "announcements"] },
];

function getVisibleRoute(item) {
  if (item.url) return item.url;
  if (item.deep_link) return item.deep_link;
  const category = getDriverNotificationCategory(item.type);
  if (category === "announcements") return null;
  const route = getDriverNotificationDeepLink(item);
  return route || null;
}

export default function DriverNotificationsPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(new Set());

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
        <section className="dnp__list" aria-label="Notifications list">
          <ul>
            {filteredItems.map((item) => {
              const isUnread = !item.is_read;
              const category = getDriverNotificationCategory(item.type);
              const icon = getDriverNotificationIcon(item.type);
              const info =
                DRIVER_NOTIFICATION_CATEGORIES.find((c) => c.id === category);
              const route = getVisibleRoute(item);
              const titleId = `dnp-title-${item.id}`;
              const statusId = `dnp-status-${item.id}`;

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
                      {formatTime(item.created_at)}
                      {info ? ` · ${info.label}` : ""}
                    </p>
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
                    ) : (
                      <span className="dnp__card-read" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
