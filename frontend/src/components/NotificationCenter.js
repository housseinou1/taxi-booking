import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";
import authenticatedApi from "../auth/authenticatedApi";

const READ_KEY = "sx_read_notifications";
const PUSH_KEY = "sx_push_notifications";
const POLL_INTERVAL_MS = 6000;

function NotificationCenter({
  mode = "ride",
  variant = "floating",
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
  onUnreadCountChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadIds());
  const [pushEnabled, setPushEnabled] = useState(
    localStorage.getItem(PUSH_KEY) === "on"
  );
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next) => {
    const value = typeof next === "function" ? next(open) : next;
    if (isControlled) {
      onOpenChange?.(value);
      return;
    }
    setInternalOpen(value);
  };

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)).length,
    [notifications, readIds]
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      const nextNotifications = await buildNotifications(mode);
      if (!cancelled) {
        setNotifications(nextNotifications);
        const backendReadIds = nextNotifications
          .filter((item) => item.backendId && item.isRead)
          .map((item) => item.id);
        if (backendReadIds.length) {
          setReadIds((current) => Array.from(new Set([...current, ...backendReadIds])));
        }
      }
    };

    loadNotifications();
    const intervalId = window.setInterval(loadNotifications, POLL_INTERVAL_MS);
    window.addEventListener("yala:push-received", loadNotifications);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("yala:push-received", loadNotifications);
    };
  }, [mode]);

  useEffect(() => {
    if (!pushEnabled || unreadCount === 0) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const latestUnread = notifications.find((item) => !readIds.includes(item.id));
    if (!latestUnread) return;

    const shownKey = `sx_push_shown_${latestUnread.id}`;
    if (sessionStorage.getItem(shownKey)) return;

    sessionStorage.setItem(shownKey, "true");
    showPushNotification(latestUnread);
  }, [notifications, pushEnabled, readIds, unreadCount]);

  const markAllRead = () => {
    const nextReadIds = Array.from(new Set(notifications.map((item) => item.id)));
    setReadIds(nextReadIds);
    localStorage.setItem(READ_KEY, JSON.stringify(nextReadIds));
    markBackendNotificationsRead(
      notifications.map((item) => item.backendId).filter(Boolean)
    );
  };

  const markOneRead = (notificationId, backendId) => {
    const nextReadIds = Array.from(new Set([...readIds, notificationId]));
    setReadIds(nextReadIds);
    localStorage.setItem(READ_KEY, JSON.stringify(nextReadIds));
    if (backendId) {
      markBackendNotificationsRead([backendId]);
    }
  };

  const openNotification = (item) => {
    markOneRead(item.id, item.backendId);

    if (item.url) {
      window.location.href = item.url;
    }
  };

  const enablePush = async () => {
    if (!("Notification" in window)) {
      localStorage.setItem(PUSH_KEY, "off");
      setPushEnabled(false);
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    localStorage.setItem(PUSH_KEY, enabled ? "on" : "off");
    setPushEnabled(enabled);
  };

  const isDelivery = mode === "delivery";
  const rootClass = [
    "sx-notification-center",
    isDelivery ? "sx-notification-center--delivery" : "",
    variant === "inline" ? "sx-notification-center--inline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass}>
      <NotificationCenterStyles />

      {!hideTrigger ? (
        <button
          className="sx-notification-trigger"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open notifications"
        >
          <span className="sx-bell-shape" />
          {unreadCount > 0 && <strong>{unreadCount > 9 ? "9+" : unreadCount}</strong>}
        </button>
      ) : null}

      {open && (
        <section className="sx-notification-panel">
          <div className="sx-notification-head">
            <div>
              <span>Notification center</span>
              <h2>Live updates</h2>
            </div>
            <button type="button" onClick={markAllRead}>
              Mark read
            </button>
          </div>

          <div className="sx-push-card">
            <div>
              <strong>Push notifications</strong>
              <span>
                {pushEnabled
                  ? isDelivery
                    ? "Enabled for delivery and payment alerts."
                    : "Enabled for ride and payment alerts."
                  : isDelivery
                  ? "Enable browser alerts for courier arrival and delivery updates."
                  : "Enable browser alerts for driver arrival and payment updates."}
              </span>
            </div>
            <button type="button" onClick={enablePush}>
              {pushEnabled ? "Enabled" : "Enable"}
            </button>
          </div>

          <div className="sx-notification-list">
            {notifications.length === 0 ? (
              <div className="sx-notification-empty">No notifications yet.</div>
            ) : (
              notifications.map((item) => {
              const isUnread = !readIds.includes(item.id);

              return (
                <button
                  key={item.id}
                  className={`sx-notification-item ${isUnread ? "unread" : ""}`}
                  type="button"
                  onClick={() => openNotification(item)}
                >
                  <span className={`sx-notification-icon ${item.type}`} />
                  <span className="sx-notification-copy">
                    <strong>{item.title}</strong>
                    <small>{item.message}</small>
                    <em>{item.time}</em>
                  </span>
                </button>
              );
            })
            )}
          </div>
        </section>
      )}
    </div>
  );
}

async function buildNotifications(mode = "ride") {
  const token = localStorage.getItem("access");
  const items = [];

  if (token) {
    try {
      const historyResponse = await authenticatedApi.get(`${API_URL}/notifications/history/`);
      const history = Array.isArray(historyResponse.data) ? historyResponse.data : [];

      if (history.length) {
        return history.slice(0, 20).map(notificationFromHistory);
      }
    } catch (error) {
      console.log("Notification history load error:", error.response?.data || error);
    }

    try {
      const [ridesResponse, paymentsResponse] = await Promise.allSettled([
        authenticatedApi.get(`${API_URL}/rides/history/`),
        authenticatedApi.get(`${API_URL}/payments/my-payments/`),
      ]);

      if (ridesResponse.status === "fulfilled") {
        const rides = Array.isArray(ridesResponse.value.data)
          ? ridesResponse.value.data
          : [];

        rides.slice(0, 8).forEach((ride) => {
          const notification = notificationFromRide(ride);
          if (notification) items.push(notification);
        });
      }

      if (paymentsResponse.status === "fulfilled") {
        const payments = Array.isArray(paymentsResponse.value.data)
          ? paymentsResponse.value.data
          : [];

        payments.slice(0, 8).forEach((payment) => {
          const notification = notificationFromPayment(payment);
          if (notification) items.push(notification);
        });
      }
    } catch (error) {
      console.log("Notification load error:", error.response?.data || error);
    }

    return items
      .sort((first, second) => Number(second.rank || 0) - Number(first.rank || 0))
      .slice(0, 12);
  }

  const baseline =
    mode === "delivery"
      ? [
          {
            id: "delivery-push-ready",
            type: "push",
            title: "Delivery alerts ready",
            message: "Enable alerts to receive courier arrival and delivery updates.",
            time: "Now",
            url: "/delivery",
            rank: 1,
          },
        ]
      : [
          {
            id: "push-ready",
            type: "push",
            title: "Push notification UI ready",
            message: "Enable alerts to receive ride, arrival, and payment updates.",
            time: "Now",
            url: "/settings",
            rank: 1,
          },
          {
            id: "safety-ready",
            type: "ride",
            title: "Safety alerts active",
            message: "Emergency and support updates can appear here during trips.",
            time: "Today",
            url: "/support",
            rank: 0,
          },
        ];

  return baseline
    .sort((first, second) => Number(second.rank || 0) - Number(first.rank || 0))
    .slice(0, 12);
}

function notificationFromHistory(item) {
  const deepLink = item.deep_link || item.data?.deep_link || "/";
  return {
    id: `history-${item.id}`,
    backendId: item.id,
    type: notificationIconType(item.type),
    title: item.title,
    message: item.body,
    time: formatNotificationDate(item.created_at),
    url: deepLink.startsWith("/delivery") ? deepLink : deepLink,
    isRead: Boolean(item.is_read),
    rank: new Date(item.created_at || 0).getTime(),
  };
}

function notificationIconType(type = "") {
  if (type.includes("delivery")) return "arrival";
  if (type.includes("payment") || type.includes("completed")) return "payment";
  if (type.includes("arriv") || type.includes("accepted")) return "arrival";
  if (type.includes("chat") || type.includes("message")) return "push";
  return "ride";
}

async function markBackendNotificationsRead(ids) {
  const token = localStorage.getItem("access");
  if (!token || !ids.length) return;

  try {
    await axios.post(
      `${API_URL}/notifications/read/`,
      { ids },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (error) {
    console.log("Notification read sync error:", error.response?.data || error);
  }
}

function notificationFromRide(ride) {
  const status = ride?.status || "requested";
  const rideId = ride?.id || "current";
  const destination = ride?.destination || ride?.destination_address || "destination";
  const time = formatNotificationDate(ride?.updated_at || ride?.created_at);

  if (["requested", "pending"].includes(status)) {
    return {
      id: `ride-${rideId}-${status}`,
      type: "ride",
      title: "New ride request",
      message: `Ride request to ${destination} is waiting for a driver.`,
      time,
      url: "/driver",
      rank: 90,
    };
  }

  if (status === "accepted") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "arrival",
      title: "Driver accepted ride",
      message: "Your driver accepted the ride and is getting ready for pickup.",
      time,
      url: "/rider-dashboard",
      rank: 100,
    };
  }

  if (status === "driver_arriving") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "arrival",
      title: "Driver arriving",
      message: "Your driver is heading to your pickup location.",
      time,
      url: "/rider-dashboard",
      rank: 102,
    };
  }

  if (status === "driver_arrived") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "arrival",
      title: "Driver arrived",
      message: "Your driver has arrived. Please meet at the pickup point.",
      time,
      url: "/rider-dashboard",
      rank: 104,
    };
  }

  if (status === "in_progress") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "ride",
      title: "Trip in progress",
      message: `You are on the way to ${destination}.`,
      time,
      url: "/rider-dashboard",
      rank: 95,
    };
  }

  if (status === "completed") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "payment",
      title: "Trip completed",
      message: "You can review the receipt, pay, tip, and rate the driver.",
      time,
      url: "/rider-payments",
      rank: 80,
    };
  }

  if (status === "cancelled") {
    return {
      id: `ride-${rideId}-${status}`,
      type: "payment",
      title: "Ride cancelled",
      message: "No automatic payment will be captured for this cancelled ride.",
      time,
      url: "/rider-dashboard",
      rank: 75,
    };
  }

  return null;
}

function notificationFromPayment(payment) {
  const status = payment?.status || "pending";
  const amount = Number(payment?.amount || 0) + Number(payment?.tip_amount || 0);
  const time = formatNotificationDate(payment?.created_at);

  if (status === "paid") {
    return {
      id: `payment-${payment.id}-paid`,
      type: "payment",
      title: "Payment success",
      message: `${formatMoney(amount)} paid for ride #${payment.ride_id}.`,
      time,
      url: "/rider-payments",
      rank: 85,
    };
  }

  if (status === "pending_verification") {
    return {
      id: `payment-${payment.id}-pending`,
      type: "payment",
      title: "Payment waiting for driver",
      message: `${formatMoney(amount)} is waiting for driver confirmation.`,
      time,
      url: "/rider-payments",
      rank: 88,
    };
  }

  if (status === "cancelled") {
    return {
      id: `payment-${payment.id}-cancelled`,
      type: "payment",
      title: "Payment cancelled",
      message: `Ride #${payment.ride_id} payment was not captured.`,
      time,
      url: "/rider-payments",
      rank: 78,
    };
  }

  return null;
}

function loadReadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function showPushNotification(notification) {
  const options = {
    body: notification.message,
    tag: notification.id,
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [120, 80, 120],
    data: {
      url: notification.url || "/",
      notificationId: notification.id,
    },
  };

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration?.showNotification) {
        registration.showNotification(notification.title, options);
        return;
      }
    }

    new Notification(notification.title, options);
  } catch (error) {
    console.log("Push notification error:", error);
    new Notification(notification.title, {
      body: notification.message,
      tag: notification.id,
    });
  }
}

function formatNotificationDate(value) {
  if (!value) return "Now";

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (error) {
    return "Recent";
  }
}

function NotificationCenterStyles() {
  return (
    <style>{`
      .sx-notification-center {
        position: fixed;
        top: 18px;
        right: 18px;
        z-index: 9999;
      }

      .sx-notification-trigger {
        position: relative;
        width: 48px;
        height: 48px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 50%;
        background: #0f172a;
        color: #fff;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.28);
        cursor: pointer;
      }

      .sx-bell-shape {
        position: absolute;
        inset: 12px 14px 13px;
        border: 2px solid #fff;
        border-bottom: 0;
        border-radius: 18px 18px 8px 8px;
      }

      .sx-bell-shape::before {
        content: "";
        position: absolute;
        left: 7px;
        top: -6px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #fff;
      }

      .sx-bell-shape::after {
        content: "";
        position: absolute;
        left: 4px;
        bottom: -7px;
        width: 12px;
        height: 2px;
        border-radius: 999px;
        background: #fff;
      }

      .sx-notification-trigger strong {
        position: absolute;
        top: -5px;
        right: -4px;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 999px;
        background: #f59e0b;
        color: #111827;
        display: grid;
        place-items: center;
        font-size: 11px;
        font-weight: 900;
        box-sizing: border-box;
      }

      .sx-notification-panel {
        position: absolute;
        top: 60px;
        right: 0;
        width: min(390px, calc(100vw - 28px));
        max-height: min(720px, calc(100vh - 86px));
        overflow: auto;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        background:
          radial-gradient(circle at 14% 0%, rgba(245, 158, 11, 0.22), transparent 34%),
          #0b1220;
        color: #fff;
        box-shadow: 0 28px 80px rgba(2, 6, 23, 0.36);
        padding: 16px;
      }

      .sx-notification-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: start;
        margin-bottom: 14px;
      }

      .sx-notification-head span {
        display: block;
        color: #fbbf24;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 4px;
      }

      .sx-notification-head h2 {
        margin: 0;
        font-size: 24px;
        letter-spacing: 0;
      }

      .sx-notification-head button,
      .sx-push-card button {
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        padding: 9px 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .sx-push-card {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.07);
        padding: 13px;
        margin-bottom: 12px;
      }

      .sx-push-card div {
        display: grid;
        gap: 4px;
      }

      .sx-push-card span {
        color: #cbd5e1;
        font-size: 12px;
        line-height: 1.45;
      }

      .sx-notification-list {
        display: grid;
        gap: 10px;
      }

      .sx-notification-empty {
        border: 1px dashed rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        color: #cbd5e1;
        font-size: 13px;
        padding: 18px 14px;
        text-align: center;
      }

      .sx-notification-item {
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
        display: grid;
        grid-template-columns: 42px 1fr;
        gap: 11px;
        padding: 12px;
        text-align: left;
        cursor: pointer;
      }

      .sx-notification-item.unread {
        background: rgba(245, 158, 11, 0.14);
        border-color: rgba(245, 158, 11, 0.42);
      }

      .sx-notification-icon {
        width: 42px;
        height: 42px;
        border-radius: 8px;
        background: #334155;
        display: grid;
        place-items: center;
      }

      .sx-notification-icon::before {
        content: "";
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
      }

      .sx-notification-icon.ride {
        background: #2563eb;
      }

      .sx-notification-icon.arrival {
        background: #16a34a;
      }

      .sx-notification-icon.payment {
        background: #f59e0b;
      }

      .sx-notification-icon.push {
        background: #7c3aed;
      }

      .sx-notification-copy {
        min-width: 0;
        display: grid;
        gap: 4px;
      }

      .sx-notification-copy strong {
        font-size: 14px;
      }

      .sx-notification-copy small {
        color: #cbd5e1;
        line-height: 1.45;
      }

      .sx-notification-copy em {
        color: #fbbf24;
        font-size: 11px;
        font-style: normal;
        font-weight: 900;
      }

      @media (max-width: 620px) {
        .sx-notification-center {
          top: auto;
          right: 14px;
          bottom: 76px;
        }

        .sx-notification-center--inline {
          top: auto;
          right: auto;
          bottom: auto;
        }

        .sx-notification-panel {
          top: auto;
          bottom: 60px;
        }

        .sx-notification-center--inline .sx-notification-panel {
          top: calc(100% + 10px);
          bottom: auto;
          right: 0;
        }
      }

      .sx-notification-center--inline {
        position: relative;
        top: auto;
        right: auto;
        bottom: auto;
      }

      .sx-notification-center--inline .sx-notification-trigger {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.95);
        color: #0f172a;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
      }

      .sx-notification-center--inline .sx-bell-shape {
        border-color: #0f172a;
      }

      .sx-notification-center--inline .sx-bell-shape::before,
      .sx-notification-center--inline .sx-bell-shape::after {
        background: #0f172a;
      }

      .sx-notification-center--delivery.sx-notification-center--inline .sx-notification-panel {
        background:
          radial-gradient(circle at 14% 0%, rgba(0, 166, 81, 0.18), transparent 34%),
          #0b1220;
      }
    `}</style>
  );
}

export default NotificationCenter;
