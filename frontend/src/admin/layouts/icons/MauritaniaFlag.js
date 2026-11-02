import React from "react";

export default function MauritaniaFlag({ className }) {
  return (
    <svg className={className} viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      <rect width="30" height="20" fill="#00a95c" />
      <rect width="30" height="3" fill="#d01c1f" />
      <rect y="17" width="30" height="3" fill="#d01c1f" />
      <path d="M8.6 8.2a6.4 6.4 0 0 0 12.8 0 6 6 0 0 1-12.8 0z" fill="#ffd700" />
      <path d="M15 4.6l.75 2.3h2.4l-1.95 1.4.75 2.3L15 9.2l-1.95 1.4.75-2.3-1.95-1.4h2.4z" fill="#ffd700" />
    </svg>
  );
}
