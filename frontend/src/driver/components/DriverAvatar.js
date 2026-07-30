import React from "react";
import "./DriverAvatar.css";

const getInitials = (name = "") =>
  String(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "YD";

export default function DriverAvatar({
  src,
  name,
  isOnline = false,
  isVerified = false,
  wrapperClassName = "driver-avatar",
  ringClassName = "driver-avatar__ring",
  imageClassName = "driver-avatar__image",
  initialsClassName = "driver-avatar__initials",
  dotClassName = "driver-avatar__dot",
  verifiedClassName = "driver-avatar__verified",
}) {
  return (
    <span className={wrapperClassName}>
      <span className={ringClassName}>
        {src ? (
          <img src={src} alt={name} className={imageClassName} />
        ) : (
          <span className={initialsClassName}>{getInitials(name)}</span>
        )}
      </span>
      <span
        className={`${dotClassName}${isOnline ? " online" : ""}`}
        aria-hidden="true"
        title={isOnline ? "Online" : "Offline"}
      />
      {isVerified && (
        <span
          className={verifiedClassName}
          aria-label="Verified driver"
          title="Verified driver"
          role="img"
        >
          <span aria-hidden="true">✓</span>
        </span>
      )}
    </span>
  );
}
