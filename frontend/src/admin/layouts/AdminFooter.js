import React from "react";

export default function AdminFooter() {
  return (
    <footer className="admin-shell__footer admin-shell__flag-footer">
      <span>YALA Admin Platform · Internal use only</span>
      <span>{new Date().getFullYear()} © YALA Taxi</span>
    </footer>
  );
}
