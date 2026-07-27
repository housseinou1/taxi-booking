import React from "react";
import StatusChip from "./StatusChip";
import { cx } from "../utils/cx";

const STATUS_MAP = {
  online: { intent: "success", label: "Online" },
  offline: { intent: "neutral", label: "Offline" },
  pending: { intent: "warning", label: "Pending" },
  approved: { intent: "success", label: "Approved" },
  rejected: { intent: "danger", label: "Rejected" },
  expired: { intent: "danger", label: "Expired" },
  requested: { intent: "info", label: "Requested" },
  accepted: { intent: "info", label: "Accepted" },
  arriving: { intent: "info", label: "Arriving" },
  in_progress: { intent: "info", label: "In progress" },
  completed: { intent: "success", label: "Completed" },
  cancelled: { intent: "danger", label: "Cancelled" },
  valid: { intent: "success", label: "Valid" },
  under_review: { intent: "warning", label: "Under review" },
  missing: { intent: "danger", label: "Missing" },
};

function StatusFromMap({ status, fallbackLabel, className, ...rest }) {
  const key = String(status || "").toLowerCase().replace(/\s+/g, "_");
  const mapped = STATUS_MAP[key] || { intent: "neutral", label: fallbackLabel || status || "Unknown" };
  return (
    <StatusChip intent={mapped.intent} dot className={className} {...rest}>
      {mapped.label}
    </StatusChip>
  );
}

export function OnlineStatus({ online = false, className, ...rest }) {
  return (
    <StatusFromMap
      status={online ? "online" : "offline"}
      className={cx("yds-online-status", className)}
      {...rest}
    />
  );
}

export function ApprovalStatus({ status = "pending", className, ...rest }) {
  return <StatusFromMap status={status} className={cx("yds-approval-status", className)} {...rest} />;
}

export function DocumentStatus({ status = "pending", className, ...rest }) {
  return <StatusFromMap status={status} className={cx("yds-document-status", className)} {...rest} />;
}

export function TripStatus({ status = "requested", className, ...rest }) {
  return <StatusFromMap status={status} className={cx("yds-trip-status", className)} {...rest} />;
}

export function RideStatus({ status = "requested", className, ...rest }) {
  return <StatusFromMap status={status} className={cx("yds-ride-status", className)} {...rest} />;
}

export default StatusFromMap;
