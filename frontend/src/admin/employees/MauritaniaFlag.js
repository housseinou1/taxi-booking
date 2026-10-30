import React from "react";

/**
 * The Mauritanian national flag as inline SVG.
 *
 * Drawn as vector art rather than the 🇲🇷 emoji: Windows ships no flag-emoji glyphs, so the
 * emoji renders as the two letters "MR" instead of a flag. This renders identically on every
 * platform and matches the flag the PDF renderer draws (same geometry, same colours), so the
 * Preview, the PDF download and the printed card all show the same national flag.
 */
export default function MauritaniaFlag({ className = "", title = "Flag of Mauritania" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 40"
      role="img"
      aria-label={title}
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      {/* Two red bands added in 2017, green field between them. */}
      <rect x="0" y="0" width="60" height="8" fill="#d01c1f" />
      <rect x="0" y="32" width="60" height="8" fill="#d01c1f" />
      <rect x="0" y="8" width="60" height="24" fill="#006233" />
      {/* Gold crescent: a disc with an offset green disc painted over it to cut the opening. */}
      <circle cx="30" cy="22" r="9.5" fill="#ffc400" />
      <circle cx="30" cy="17.5" r="8.2" fill="#006233" />
      {/* Five-pointed gold star sitting in the crescent's opening. */}
      <polygon
        fill="#ffc400"
        points="30,13.4 31.15,16.42 34.38,16.58 31.85,18.6 32.7,21.72 30,19.95 27.3,21.72 28.15,18.6 25.62,16.58 28.85,16.42"
      />
    </svg>
  );
}
