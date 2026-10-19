import React, { useEffect, useRef } from "react";

import { Drawer, StatusChip } from "../components/library";
import { formatTimestamp } from "../components/library/utils/formatters";
import {
  getAccountStatus,
  getCompletedRideCount,
  getVerification,
  isTestAccount,
} from "./ridersSelectors";

function Field({ label, children }) {
  return (
    <div className="riders-detail__field">
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

function initials(rider) {
  const name = String(rider?.full_name || rider?.email || "?").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

/**
 * Rider Details drawer (requirement 4). Shows only fields that exist in the API
 * payload and renders explicit "not available" empty states for data the
 * backend does not provide (ride history, review text, activity log). Keeps
 * verification and account status in two separate sections (requirement 6).
 *
 * Adds focus management on top of the library Drawer (which handles
 * Escape/overlay close + aria-modal but not focus trap/return): on open focus
 * moves into the drawer, Tab is trapped, and focus returns to the invoking
 * element on close.
 */
export default function RiderDetailsDrawer({
  rider,
  open,
  rides,
  getFileUrl,
  onClose,
  onApprove,
  onReject,
  onSuspendToggle,
  onDelete,
}) {
  const drawerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    const node = drawerRef.current;
    // Move focus into the drawer once it mounts.
    const focusable = node?.querySelectorAll(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable && focusable.length) focusable[0].focus();
    else node?.focus();

    const handleKeyDown = (event) => {
      if (event.key !== "Tab" || !node) return;
      const items = node.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    node?.addEventListener("keydown", handleKeyDown);
    return () => {
      node?.removeEventListener("keydown", handleKeyDown);
      // Restore focus to the element that opened the drawer.
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open]);

  if (!open || !rider) return null;

  const verification = getVerification(rider);
  const account = getAccountStatus(rider);
  const test = isTestAccount(rider);
  const photoUrl = rider.profile_picture ? getFileUrl?.(rider.profile_picture) : null;
  const docUrl = rider.has_national_id_document && rider.national_id_document
    ? getFileUrl?.(rider.national_id_document)
    : null;
  const completedRides = getCompletedRideCount(rider, rides);
  const canApprove = rider.rider_status !== "approved";
  const canReject = rider.rider_status !== "rejected";

  return (
    <Drawer open={open} title={rider.full_name || rider.email || "Rider details"} onClose={onClose}>
      <div ref={drawerRef} tabIndex={-1}>
        <div className="riders-detail__chips">
          <StatusChip label={`Verification: ${verification.label}`} tone={verification.tone} />
          <StatusChip label={`Account: ${account.label}`} tone={account.tone} />
          {test ? <StatusChip label="TEST/QA" tone="neutral" title="Flagged as a QA/test account (display only)" /> : null}
        </div>

        {/* Profile photo */}
        <section className="riders-detail__section">
          <h4>Profile photo</h4>
          {photoUrl ? (
            <img className="riders-detail__photo" src={photoUrl} alt={`${rider.full_name || "Rider"} profile`} />
          ) : (
            <div className="riders-avatar riders-avatar--fallback riders-detail__photo" aria-label="No profile photo">
              {initials(rider)}
            </div>
          )}
        </section>

        {/* Personal information */}
        <section className="riders-detail__section">
          <h4>Personal information</h4>
          <dl className="riders-detail__grid">
            <Field label="Full name">{rider.full_name}</Field>
            <Field label="Email">{rider.email}</Field>
            <Field label="Phone">
              {rider.phone_number || "—"}
              {rider.phone_number ? (
                <span className={rider.phone_verified ? "riders-contact__verified" : "riders-contact__unverified"}>
                  {" "}
                  {rider.phone_verified ? "(verified)" : "(unverified)"}
                </span>
              ) : null}
            </Field>
            <Field label="City / region">
              {[rider.city_name, rider.region_name].filter(Boolean).join(" · ") || "—"}
            </Field>
            <Field label="Member since">{rider.member_since_year || "—"}</Field>
            <Field label="Years using app">{rider.years_using_app ?? "—"}</Field>
          </dl>
        </section>

        {/* Identity verification — separate from account status (requirement 6) */}
        <section className="riders-detail__section">
          <h4>Identity verification</h4>
          <dl className="riders-detail__grid">
            <Field label="Status">
              <StatusChip label={verification.label} tone={verification.tone} />
            </Field>
            <Field label="National ID number">{rider.national_id_number || "—"}</Field>
          </dl>
          {rider.rider_status === "rejected" && rider.rider_rejection_reason ? (
            <p className="riders-cell-hint">Rejection reason: {rider.rider_rejection_reason}</p>
          ) : null}
          <h4 style={{ marginTop: 12 }}>Identity documents</h4>
          {docUrl ? (
            <a className="riders-detail__doc-link" href={docUrl} target="_blank" rel="noreferrer">
              View national ID document
            </a>
          ) : (
            <p className="riders-detail__empty">No document on file</p>
          )}
        </section>

        {/* Account status — separate section */}
        <section className="riders-detail__section">
          <h4>Account status</h4>
          <dl className="riders-detail__grid">
            <Field label="Status">
              <StatusChip label={account.label} tone={account.tone} />
            </Field>
            <Field label="Registered">{formatTimestamp(rider.date_joined)}</Field>
          </dl>
        </section>

        {/* Ratings & reviews — numeric rating exists; review text does not */}
        <section className="riders-detail__section">
          <h4>Ratings &amp; reviews</h4>
          <dl className="riders-detail__grid">
            <Field label="Average rating">
              {rider.rider_rating_count > 0 ? Number(rider.rider_average_rating).toFixed(2) : "—"}
            </Field>
            <Field label="Rating count">{rider.rider_rating_count ?? 0}</Field>
          </dl>
          <p className="riders-detail__empty">No written reviews available from this endpoint.</p>
        </section>

        {/* Ride history — not provided by the API */}
        <section className="riders-detail__section">
          <h4>Ride history</h4>
          <p className="riders-detail__empty">
            Ride history is not available from this endpoint.
            {completedRides != null
              ? ` Approximately ${completedRides} completed ride(s) matched in the loaded ride list.`
              : ""}
          </p>
        </section>

        {/* Account activity / audit log — not provided by the API */}
        <section className="riders-detail__section">
          <h4>Account activity</h4>
          <p className="riders-detail__empty">Activity log is not available from this endpoint.</p>
        </section>

        {/* Administrative actions (requirement 5) */}
        <section className="riders-detail__section">
          <h4>Administrative actions</h4>
          <div className="riders-detail__actions">
            <button
              type="button"
              className="admin-lib-btn"
              disabled={!canApprove}
              onClick={() => onApprove(rider)}
            >
              Approve verification
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              disabled={!canReject}
              onClick={() => onReject(rider)}
            >
              Reject verification
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => onSuspendToggle(rider)}
            >
              {rider.is_active ? "Suspend account" : "Reactivate account"}
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--danger"
              onClick={() => onDelete(rider)}
            >
              Delete account
            </button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
