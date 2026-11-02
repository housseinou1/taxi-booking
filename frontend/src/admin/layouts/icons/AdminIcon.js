import React from "react";

/**
 * YALA Admin line-icon set (24px grid, 1.8 stroke, currentColor).
 * Inline SVG so the admin needs no extra icon dependency.
 */
const PATHS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "bar-chart": "M3 3v18h18M8 17v-5M13 17V8M18 17v-9",
  pie: "M21 12A9 9 0 1 1 12 3v9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  briefcase: "M3 8h18v12H3zM8 8V5h8v3M3 13h18",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z",
  "shield-check": "M12 3 4 6v6c0 5 3.4 8.6 8 9 4.6-.4 8-4 8-9V6zM8.5 12l2.5 2.5 4.5-5",
  shield: "M12 3 4 6v6c0 5 3.4 8.6 8 9 4.6-.4 8-4 8-9V6z",
  file: "M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6",
  files: "M8 3h8l4 4v12H8zM16 3v4h4M4 7v14h12",
  city: "M3 21h18M5 21V8l5-3v16M10 21V10h9v11M13 13h1M16 13h1M13 16h1M16 16h1M7 10h1M7 13h1M7 16h1",
  key: "M15 9a3 3 0 1 0 0 .01M13 11 4 20M7 17l2 2M9 15l2 2M15 3a6 6 0 1 1-4.2 10.2",
  radio: "M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  "map-pin": "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  satellite: "M4 20a8 8 0 0 1 8-8M4 15a3 3 0 0 1 3 3M13 3l8 8-4 4-8-8zM15 13l2 2",
  "trending-up": "M3 17l6-6 4 4 8-8M15 7h6v6",
  dollar: "M12 2v20M17 6.5C17 4.6 14.8 4 12 4S7 5 7 7.5 9.5 10.5 12 11s5 1.5 5 4-2.2 3.5-5 3.5-5-.8-5-2.8",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  cpu: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  car: "M5 17h14M5 17v2M19 17v2M4 13l2-5.5A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.5L20 13v4H4zM4 13h16M7.5 15h.01M16.5 15h.01",
  taxi: "M9 4h6l1 2M5 17h14M5 17v2M19 17v2M4 13l2-5.5A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.5L20 13v4H4zM4 13h16",
  "user-check": "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 3 .8M15 18l2 2 4-4",
  "user-plus": "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M19 8v6M16 11h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7v1",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM1.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1M16 3.2a4 4 0 0 1 0 7.6M19 14.3a6 6 0 0 1 3.5 5.7v1",
  "check-square": "M4 4h16v16H4zM8 12l3 3 5-6",
  truck: "M2 6h12v10H2zM14 9h4l3 3v4h-7M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  "graduation-cap": "M12 4 2 9l10 5 10-5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 13.5 7 22l5-3 5 3-1.5-8.5",
  package: "M12 3 3 7.5v9L12 21l9-4.5v-9zM3 7.5l9 4.5 9-4.5M12 12v9M7.5 5.3l9 4.5",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  bike: "M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 14.5 9 8h5l4.5 6.5M9 8 7.5 5H5M14 8l1.5-3H18",
  store: "M3 9l1.5-5h15L21 9M3 9v1a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 12.5V21h14v-8.5M10 21v-5h4v5",
  handshake: "M2 11l4-4 4 2 2-2 3 0 7 5-3 3M2 11l7 7 2-1 2 2 2-1 2 2 2-2-1-2M9 9l4 4",
  "id-card": "M3 5h18v14H3zM8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.5 16a3 3 0 0 1 6 0M14 9h4M14 12h4M14 15h3",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  clipboard: "M9 4h6v3H9zM9 5H5v16h14V5h-4M8 12h8M8 16h5",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  headset: "M4 14v-2a8 8 0 1 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1zM17 20c0 1-2 2-5 2",
  message: "M4 4h16v12H8l-4 4z",
  flask: "M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4A1.5 1.5 0 0 0 20 19L14 9V3M7 15h10",
  wallet: "M3 6h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3zM3 6V5a2 2 0 0 1 2-2h11v3M16 13h.01",
  "credit-card": "M2 5h20v14H2zM2 10h20M6 15h4",
  receipt: "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM9 8h6M9 12h6",
  bank: "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
  landmark: "M3 21h18M4 18h16M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 3 3 8h18z",
  gift: "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4",
  alert: "M12 3 2 20h20zM12 10v4M12 17h.01",
  scroll: "M8 3h11v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2h11v2a3 3 0 0 0 3 3M8 3a3 3 0 0 0-3 3v10M11 8h5M11 12h5",
  brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-1",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  megaphone: "M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6M7 14l1.5 6H11l-1-5",
  sprout: "M12 21v-9M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 14c0-4 3-7 8-7 0 4-3 7-8 7",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  rocket: "M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2M9 15l-3-3c1-4 5-9 12-9 0 7-5 11-9 12zM14.5 9.5h.01M7 12H3l2-4h4M12 17v4l4-2v-4",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  building: "M5 21V3h10v18M15 9h4v12M3 21h18M8 7h1M11 7h1M8 11h1M11 11h1M8 15h1M11 15h1",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  "chevron-down": "M6 9l6 6 6-6",
  "chevron-right": "M9 6l6 6-6 6",
  "chevrons-left": "M11 17l-5-5 5-5M18 17l-5-5 5-5",
  "chevrons-right": "M13 17l5-5-5-5M6 17l5-5-5-5",
  menu: "M3 6h18M3 12h18M3 18h18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  logout: "M9 21H5V3h4M16 17l5-5-5-5M21 12H9",
  x: "M18 6 6 18M6 6l12 12",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v7H2v-7z",
  "arrow-up": "M12 19V5M5 12l7-7 7 7",
  "arrow-down": "M12 5v14M19 12l-7 7-7-7",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5",
};

export const ADMIN_ICON_NAMES = Object.keys(PATHS);

export function hasAdminIcon(name) {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}

export default function AdminIcon({ name, size = 18, className = "", strokeWidth = 1.8, title }) {
  const d = PATHS[name] || PATHS.grid;
  return (
    <svg
      className={`admin-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <path d={d} />
    </svg>
  );
}
