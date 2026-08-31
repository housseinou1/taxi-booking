import React from "react";

const TONE_CLASS = {
  success: "admin-chip--success",
  warning: "admin-chip--warning",
  danger: "admin-chip--danger",
  info: "admin-chip--info",
  neutral: "admin-chip--neutral",
};

export default function StatusChip({ label, tone = "neutral", icon, title }) {
  return (
    <span className={`admin-chip ${TONE_CLASS[tone] || TONE_CLASS.neutral}`} title={title || label}>
      {icon ? <span className="admin-chip__icon" aria-hidden="true">{icon}</span> : null}
      {label}
    </span>
  );
}
