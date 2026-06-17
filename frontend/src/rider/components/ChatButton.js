import React from 'react';
import './ChatButton.css';

/**
 * ChatButton — Opens the RideChat component with a notification badge
 * for unread messages.
 *
 * Props:
 * - onClick: callback triggered when button is tapped (opens RideChat)
 * - unreadCount: number of unread messages (0 or undefined hides badge)
 * - className: optional additional CSS class
 */
function ChatButton({ onClick, unreadCount = 0, className = '' }) {
  return (
    <button
      className={`chat-button ${className}`.trim()}
      onClick={onClick}
      aria-label={
        unreadCount > 0
          ? `Chat with driver, ${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`
          : 'Chat with driver'
      }
      type="button"
    >
      <span className="chat-button__icon" aria-hidden="true">
        💬
      </span>
      <span className="chat-button__label">Chat</span>
      {unreadCount > 0 && (
        <span className="chat-button__badge" aria-hidden="true">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default ChatButton;
