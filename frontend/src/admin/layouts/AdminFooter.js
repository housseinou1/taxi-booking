import React from "react";

export default function AdminFooter() {
  return (
    <footer className="admin-shell__footer">
      <span>YALA Admin Platform · Internal use only</span>
      <span>{new Date().getFullYear()} © YALA Taxi</span>
    </footer>
  );
}
