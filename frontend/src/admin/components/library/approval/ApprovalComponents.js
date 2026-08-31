import React from "react";

import ProtectedActionButton from "../../guards/ProtectedActionButton";
import StatusChip from "../kpi/StatusChip";
import { formatTimestamp } from "../utils/formatters";

const STATUS_TONE = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  info_requested: "info",
};

export default function ApprovalCard({
  item,
  title,
  subtitle,
  amount,
  status = "pending",
  requiresDualApproval,
  onApprove,
  onReject,
  onRequestInfo,
  approveAction = "refund",
}) {
  return (
    <article className="admin-approval-card">
      <div className="admin-approval-card__head">
        <div>
          <h4>{title || item?.title}</h4>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <StatusChip label={status.replace(/_/g, " ")} tone={STATUS_TONE[status] || "neutral"} />
      </div>
      {amount != null ? <p className="admin-approval-card__amount">{amount}</p> : null}
      {requiresDualApproval ? <StatusChip label="Dual approval required" tone="info" icon="👥" /> : null}
      {status === "pending" ? (
        <div className="admin-approval-card__actions">
          <ProtectedActionButton approve={approveAction} onClick={onApprove}>
            Approve
          </ProtectedActionButton>
          <ProtectedActionButton approve={approveAction} onClick={onReject}>
            Reject
          </ProtectedActionButton>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onRequestInfo}>
            Request info
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function ApprovalQueue({ items = [], renderItem, emptyLabel = "No pending approvals" }) {
  if (!items.length) return <p className="admin-empty">{emptyLabel}</p>;
  return (
    <div className="admin-approval-queue">
      {items.map((item) => (renderItem ? renderItem(item) : <ApprovalCard key={item.id} item={item} title={item.title} />))}
    </div>
  );
}

export function ApprovalTimeline({ events = [] }) {
  return (
    <ol className="admin-approval-timeline">
      {events.map((event) => (
        <li key={event.id || `${event.at}-${event.action}`}>
          <strong>{event.action}</strong>
          <span>{event.actor}</span>
          <time dateTime={event.at}>{formatTimestamp(event.at)}</time>
          {event.note ? <p>{event.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}

export function ApprovalDialog({ open, title, children, onClose, onApprove, onReject, onRequestInfo, approveAction }) {
  if (!open) return null;
  return (
    <div className="admin-modal-overlay" role="presentation" onClick={onClose}>
      <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal__head">
          <h3>{title}</h3>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="admin-modal__body">{children}</div>
        <div className="admin-modal__footer">
          <ProtectedActionButton approve={approveAction} onClick={onApprove}>
            Approve
          </ProtectedActionButton>
          <ProtectedActionButton approve={approveAction} onClick={onReject}>
            Reject
          </ProtectedActionButton>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onRequestInfo}>
            Request more information
          </button>
        </div>
      </div>
    </div>
  );
}
