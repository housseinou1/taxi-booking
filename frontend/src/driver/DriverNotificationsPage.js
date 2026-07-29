import React, { useCallback, useEffect, useState } from "react";
import authenticatedApi from "../auth/authenticatedApi";
import { API_URL } from "../apiConfig";
import { navigateInApp } from "../navigation/inAppNavigation";
import {
  DriverLoadingState,
  DriverEmptyState,
  DriverErrorState,
} from "./ui/DriverAppStates";
import {
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

export default function DriverNotificationsPage() {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedApi.get(
        `${API_URL}/drivers/me/notifications/`
      );
      const data = response?.data ?? {};
      const notifications = Array.isArray(data.items) ? data.items : [];
      setItems(notifications);
      setUnreadCount(data.unread_count ?? data.unreadCount ?? 0);
    } catch (err) {
      setError("Could not load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markBackendRead = useCallback(async (ids) => {
    if (!ids.length) return;
    try {
      await authenticatedApi.post(`${API_URL}/notifications/read/`, { ids });
    } catch {
      // Continue with local state even if backend sync fails.
    }
  }, []);

  const markOneRead = useCallback(
    async (id) => {
      if (marking) return;
      setMarking(true);
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true } : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      await markBackendRead([id]);
      setMarking(false);
    },
    [marking, markBackendRead]
  );

  const markAllRead = useCallback(async () => {
    if (marking) return;
    setMarking(true);
    const ids = items.map((item) => item.id).filter(Boolean);
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
    await markBackendRead(ids);
    setMarking(false);
  }, [items, marking, markBackendRead]);

  const openNotification = useCallback(
    async (item) => {
      if (!item.is_read) {
        await markOneRead(item.id);
      }
      const route = getDriverNotificationDeepLink(item);
      if (route) {
        navigateInApp(route);
      }
    },
    [markOneRead]
  );

  if (loading) {
    return (
      <main className="dnp">
        <h1 className="dnp__title sr-only">Notifications</h1>
        <DriverLoadingState title="Loading notifications" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="dnp">
        <h1 className="dnp__title sr-only">Notifications</h1>
        <DriverErrorState
          title="Could not load notifications"
          message={error}
          onAction={fetchNotifications}
        />
      </main>
    );
  }

  return (
    <main className="dnp">
      <h1 className="dnp__title">Notifications</h1>

      <section
        className="dnp__summary"
        aria-live="polite"
        aria-atomic="true"
        aria-label="Notification summary"
      >
        <span className="dnp__count">
          {items.length === 0
            ? "No notifications"
            : `${unreadCount} unread`}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            className="dnp__mark-all"
            onClick={markAllRead}
            disabled={marking}
            aria-label="Mark all notifications as read"
          >
            Mark all as read
          </button>
        )}
      </section>

      {items.length === 0 ? (
        <DriverEmptyState
          title="No notifications yet"
          message="Ride, earnings, and document updates will appear here."
        />
      ) : (
        <section className="dnp__list" aria-label="Notifications list">
          {items.map((item) => {
            const isUnread = !item.is_read;
            const category = getDriverNotificationCategory(item.type);
            const icon = getDriverNotificationIcon(item.type);
            return (
              <button
                key={item.id}
                type="button"
                className={`dnp__item ${
                  isUnread ? "dnp__item--unread" : ""
                }`}
                onClick={() => openNotification(item)}
                aria-label={`${item.title || "Notification"}${
                  isUnread ? " unread" : ""
                }`}
              >
                <span className="dnp__item-icon" aria-hidden="true">
                  {icon}
                </span>
                <span className="dnp__item-body">
                  <span className="dnp__item-title">{item.title}</span>
                  {item.body ? (
                    <span className="dnp__item-text">{item.body}</span>
                  ) : null}
                  <span className="dnp__item-meta">
                    {formatTime(item.created_at)}
                    {category ? ` · ${category}` : ""}
                  </span>
                </span>
                {isUnread ? (
                  <span className="dnp__item-dot" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </section>
      )}
    </main>
  );
}
