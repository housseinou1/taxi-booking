import React from "react";

export default function DeliveryChatFab({ onClick, unread = 0, label = "Message" }) {
  return (
    <button
      type="button"
      className="dcc-fab dcc-fab--courier"
      onClick={onClick}
      aria-label={label}
    >
      💬
      {unread > 0 ? (
        <span className="dcc-fab__badge" aria-hidden>
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </button>
  );
}
