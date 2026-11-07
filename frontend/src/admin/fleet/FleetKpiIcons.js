import React from "react";

/** SVG icons for fleet KPI cards (no emoji — avoids Windows encoding glitches). */
const PATHS = {
  users: "M17 20a4 4 0 0 0-8 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0",
  check: "M20 6 9 17l-5-5",
  online: "M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8",
  trip: "M5 17h14v2H3V7l4-4h10v14H9l-4 4z",
  offline: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 12h8",
  ban: "M18 6 6 18M6 6l12 12",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6",
  wait: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  car: "M5 17h14l-1.5-5a2 2 0 0 0-2-1.8H8.5a2 2 0 0 0-2 1.8L5 17ZM7 17a2 2 0 1 0 4 0M13 17a2 2 0 1 0 4 0",
  shield: "M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4Z",
  clock: "M12 6v6l4 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  block: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2",
  calendar: "M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  help: "M12 18h.01M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2.2-3 4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12Z",
  cancel: "M18 6 6 18M6 6l12 12",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  handshake: "M12 12m-2 0a2 2 0 1 0 4 0M8 16l-2 2M16 16l2 2",
  star: "M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7Z",
  money: "M12 2v20M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  warn: "M12 9v4M12 17h.01M10.3 3.3 1.6 18a2 2 0 0 0 1.7 3h17.4a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z",
  map: "M2 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z",
};

export default function FleetKpiIcon({ name, className = "" }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
