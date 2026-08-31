import React, { useCallback, useState } from "react";
import NotificationCenter from "../components/NotificationCenter";
import "./RiderNotificationsPage.css";

export default function RiderNotificationsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [pullOffset, setPullOffset] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
    window.dispatchEvent(new CustomEvent("yala:push-received"));
  }, []);

  const handleTouchStart = (event) => {
    if (window.scrollY <= 0) {
      setPullOffset(event.touches[0].clientY);
    }
  };

  const handleTouchEnd = (event) => {
    const delta = event.changedTouches[0].clientY - pullOffset;
    if (delta > 72) {
      handleRefresh();
    }
    setPullOffset(0);
  };

  return (
    <main
      className="rider-notifications-page"
      aria-label="Notification inbox"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <header className="rider-notifications-page__head">
        <div>
          <span>Inbox</span>
          <h1>Notifications</h1>
          <p>Ride updates, payments, support replies, and announcements.</p>
        </div>
        <button type="button" className="rider-notifications-page__refresh" onClick={handleRefresh} aria-label="Refresh notifications">
          Refresh
        </button>
      </header>

      <NotificationCenter
        key={refreshKey}
        mode="ride"
        variant="inline"
        hideTrigger
        open
        onOpenChange={() => {}}
      />
    </main>
  );
}
