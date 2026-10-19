import React, { useEffect, useRef, useState } from "react";

import { Drawer, StatusChip } from "../components/library";
import { formatTimestamp } from "../components/library/utils/formatters";
import {
  getRiderActivity,
  getRiderAuditLogs,
  getRiderPayments,
  getRiderRideHistory,
} from "./ridersApi";
import {
  getAccountStatus,
  getCompletedRideCount,
  getVerification,
  isTestAccount,
} from "./ridersSelectors";

const RIDE_HISTORY_PAGE_SIZE = 25;

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

/** Render the empty markers honestly: null/undefined/"" -> "N/A", never a fabricated value. */
function naOr(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  return value;
}

/**
 * MRU money renderer that stays honest about missing data: a null/undefined
 * amount renders "N/A" rather than coercing to 0 (the shared formatMoney would
 * turn null into "0 MRU", which would fabricate a spend figure).
 */
function formatMru(amount) {
  if (amount === null || amount === undefined || amount === "") return "N/A";
  const num = Number(amount);
  if (Number.isNaN(num)) return "N/A";
  return `${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MRU`;
}

/** Small reusable section body that renders loading/error/empty/data states. */
function AsyncSection({ state, isEmpty, emptyLabel, children }) {
  if (state.loading) {
    return <p className="riders-detail__empty">Loading…</p>;
  }
  if (state.error) {
    return <p className="riders-detail__error">{state.error}</p>;
  }
  if (isEmpty) {
    return <p className="riders-detail__empty">{emptyLabel}</p>;
  }
  return children;
}

const INITIAL_SECTION = { loading: false, error: null, data: null };

/**
 * Rider Details drawer. In addition to the serialize_user fields it already
 * showed, it now fetches and renders the Stage 1 backend data on open:
 *   - Statistics + ride history  (GET /rides/admin/rider/<id>/history/)
 *   - Payment & refund history   (GET /payments/admin/rider/<id>/payments/)
 *   - Last login / last seen     (GET /auth/admin/rider/<id>/activity/)
 *   - Account activity audit log (GET /security/admin/audit-logs/?entity_type=customer&entity_id=<id>)
 *
 * Each section holds its own {loading, error, data} state and renders an
 * explicit loading, error, and empty state. Any null field renders "N/A"; no
 * value is ever fabricated. Verification and account status stay in two
 * separate sections (requirement 6), and all existing administrative actions
 * are preserved.
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

  const [history, setHistory] = useState(INITIAL_SECTION);
  const [historyPage, setHistoryPage] = useState(1);
  const [payments, setPayments] = useState(INITIAL_SECTION);
  const [activity, setActivity] = useState(INITIAL_SECTION);
  const [auditLogs, setAuditLogs] = useState(INITIAL_SECTION);

  const riderId = rider?.id;

  // Fetch all drawer data when the drawer opens for a rider. Keyed on open +
  // riderId + historyPage so paging the ride history refetches that section.
  useEffect(() => {
    if (!open || riderId == null) return undefined;
    let cancelled = false;

    setHistory((prev) => ({ ...prev, loading: true, error: null }));
    getRiderRideHistory(riderId, { page: historyPage, page_size: RIDE_HISTORY_PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setHistory({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) setHistory({ loading: false, error: err.message || "Failed to load ride history.", data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [open, riderId, historyPage]);

  // Payments, activity, and audit log depend only on open + riderId.
  useEffect(() => {
    if (!open || riderId == null) return undefined;
    let cancelled = false;

    setPayments((prev) => ({ ...prev, loading: true, error: null }));
    getRiderPayments(riderId)
      .then((data) => {
        if (!cancelled) setPayments({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) setPayments({ loading: false, error: err.message || "Failed to load payment history.", data: null });
      });

    setActivity((prev) => ({ ...prev, loading: true, error: null }));
    getRiderActivity(riderId)
      .then((data) => {
        if (!cancelled) setActivity({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) setActivity({ loading: false, error: err.message || "Failed to load activity.", data: null });
      });

    setAuditLogs((prev) => ({ ...prev, loading: true, error: null }));
    getRiderAuditLogs(riderId)
      .then((data) => {
        if (!cancelled) setAuditLogs({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled) setAuditLogs({ loading: false, error: err.message || "Failed to load account activity.", data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [open, riderId]);

  // Reset to the first history page each time the drawer opens for a rider.
  useEffect(() => {
    if (open) setHistoryPage(1);
  }, [open, riderId]);

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
  const canApprove = rider.rider_status !== "approved";
  const canReject = rider.rider_status !== "rejected";

  // AUTHORITATIVE completed-rides / spend source: the backend summary from
  // getRiderRideHistory (aggregated over the rider's full history, Decimal-safe).
  // The old email-match heuristic (getCompletedRideCount) is kept ONLY as a
  // graceful fallback for the completed-count display when the summary fetch
  // fails; it never drives spending (which has no client-side source).
  const summary = history.data?.summary || null;
  const heuristicCompleted = getCompletedRideCount(rider, rides);
  const completedRidesDisplay = summary
    ? summary.completed_rides
    : history.error && heuristicCompleted != null
      ? `≈ ${heuristicCompleted}`
      : "N/A";

  const historyRows = history.data?.results || [];
  const historyTotalPages = history.data?.total_pages || 1;
  const historyCount = history.data?.count ?? 0;

  const paymentRows = payments.data?.results || [];
  const refundRows = payments.data?.refunds || [];

  const auditRows = Array.isArray(auditLogs.data)
    ? auditLogs.data
    : auditLogs.data?.results || [];

  // Rides that carry a rider rating/review, for the ratings & reviews section.
  const ratedRides = historyRows.filter(
    (ride) => ride.rating != null || ride.review || ride.driver_rating != null || ride.driver_review
  );

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

        {/* Statistics — authoritative summary from the ride-history endpoint */}
        <section className="riders-detail__section">
          <h4>Statistics</h4>
          <AsyncSection state={history} isEmpty={!summary && !history.error} emptyLabel="No statistics available.">
            {summary ? (
              <dl className="riders-detail__grid">
                <Field label="Total rides">{naOr(summary.total_rides)}</Field>
                <Field label="Completed rides">{naOr(summary.completed_rides)}</Field>
                <Field label="Cancelled rides">{naOr(summary.cancelled_rides)}</Field>
                <Field label="Total spending">{formatMru(summary.total_spend_mru)}</Field>
                <Field label="Average fare">{formatMru(summary.average_fare_mru)}</Field>
              </dl>
            ) : (
              <dl className="riders-detail__grid">
                <Field label="Completed rides">{completedRidesDisplay}</Field>
              </dl>
            )}
          </AsyncSection>
        </section>

        {/* Ride history — real records, server-side paginated */}
        <section className="riders-detail__section">
          <h4>Ride history</h4>
          <AsyncSection
            state={history}
            isEmpty={historyRows.length === 0}
            emptyLabel="No rides found for this rider."
          >
            <div className="riders-detail__table-wrap">
              <table className="riders-detail__table">
                <thead>
                  <tr>
                    <th>Ride</th>
                    <th>Pickup → destination</th>
                    <th>Driver</th>
                    <th>Status</th>
                    <th>Fare</th>
                    <th>Payment</th>
                    <th>Created</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((ride) => (
                    <tr key={ride.id}>
                      <td>#{ride.id}</td>
                      <td>
                        {naOr(ride.pickup)} → {naOr(ride.destination)}
                      </td>
                      <td>
                        {naOr(ride.driver_name)}
                        {ride.driver_email ? (
                          <span className="riders-cell-hint">{ride.driver_email}</span>
                        ) : null}
                      </td>
                      <td>{naOr(ride.status)}</td>
                      <td>{formatMru(ride.fare)}</td>
                      <td>{naOr(ride.payment_status)}</td>
                      <td>{ride.created_at ? formatTimestamp(ride.created_at) : "N/A"}</td>
                      <td>{ride.completed_at ? formatTimestamp(ride.completed_at) : "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyTotalPages > 1 ? (
              <div className="riders-detail__pager">
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  disabled={historyPage <= 1 || history.loading}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="riders-cell-hint">
                  Page {historyPage} of {historyTotalPages} ({historyCount} rides)
                </span>
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  disabled={historyPage >= historyTotalPages || history.loading}
                  onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}
          </AsyncSection>
        </section>

        {/* Ratings & reviews — rider + driver ratings/reviews per ride */}
        <section className="riders-detail__section">
          <h4>Ratings &amp; reviews</h4>
          <dl className="riders-detail__grid">
            <Field label="Average rating">
              {rider.rider_rating_count > 0 ? Number(rider.rider_average_rating).toFixed(2) : "N/A"}
            </Field>
            <Field label="Rating count">{rider.rider_rating_count ?? 0}</Field>
          </dl>
          <AsyncSection
            state={history}
            isEmpty={ratedRides.length === 0}
            emptyLabel="No ride ratings or reviews yet."
          >
            <ul className="riders-detail__reviews">
              {ratedRides.map((ride) => (
                <li key={ride.id} className="riders-detail__review">
                  <span className="riders-cell-hint">Ride #{ride.id}</span>
                  <div>Rider rating: {naOr(ride.rating)}</div>
                  <div>Rider review: {naOr(ride.review)}</div>
                  <div>Driver rating: {naOr(ride.driver_rating)}</div>
                  <div>Driver review: {naOr(ride.driver_review)}</div>
                </li>
              ))}
            </ul>
          </AsyncSection>
        </section>

        {/* Payment & refund history — never exposes tokens or card data */}
        <section className="riders-detail__section">
          <h4>Payment history</h4>
          <AsyncSection
            state={payments}
            isEmpty={paymentRows.length === 0}
            emptyLabel="No payments found for this rider."
          >
            <div className="riders-detail__table-wrap">
              <table className="riders-detail__table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Ride</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((payment) => (
                    <tr key={payment.transaction_id || `${payment.ride_id}-${payment.created_at}`}>
                      <td>{naOr(payment.transaction_id)}</td>
                      <td>{payment.ride_id != null ? `#${payment.ride_id}` : "N/A"}</td>
                      <td>
                        {payment.amount != null
                          ? `${payment.amount} ${payment.currency || "MRU"}`
                          : "N/A"}
                      </td>
                      <td>{naOr(payment.method)}</td>
                      <td>{naOr(payment.status)}</td>
                      <td>{payment.created_at ? formatTimestamp(payment.created_at) : "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncSection>

          <h4 style={{ marginTop: 12 }}>Refund history</h4>
          <AsyncSection
            state={payments}
            isEmpty={refundRows.length === 0}
            emptyLabel="No refunds for this rider."
          >
            <div className="riders-detail__table-wrap">
              <table className="riders-detail__table">
                <thead>
                  <tr>
                    <th>Refund</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {refundRows.map((refund) => (
                    <tr key={refund.id}>
                      <td>#{refund.id}</td>
                      <td>
                        {refund.amount != null
                          ? `${refund.amount} ${refund.currency || "MRU"}`
                          : "N/A"}
                      </td>
                      <td>{naOr(refund.reason)}</td>
                      <td>{naOr(refund.status)}</td>
                      <td>{refund.created_at ? formatTimestamp(refund.created_at) : "N/A"}</td>
                      <td>{refund.resolved_at ? formatTimestamp(refund.resolved_at) : "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AsyncSection>
        </section>

        {/* Last login + last seen / account activity */}
        <section className="riders-detail__section">
          <h4>Last login &amp; activity</h4>
          <AsyncSection state={activity} isEmpty={false} emptyLabel="No activity available.">
            <dl className="riders-detail__grid">
              <Field label="Last login">
                {activity.data?.last_login ? formatTimestamp(activity.data.last_login) : "N/A"}
              </Field>
              <Field label="Last seen">
                {activity.data?.last_seen ? formatTimestamp(activity.data.last_seen) : "N/A"}
              </Field>
              <Field label="Last seen device">{naOr(activity.data?.last_seen_device)}</Field>
            </dl>
          </AsyncSection>
        </section>

        {/* Account activity — rider-filtered audit log */}
        <section className="riders-detail__section">
          <h4>Account activity</h4>
          <AsyncSection
            state={auditLogs}
            isEmpty={auditRows.length === 0}
            emptyLabel="No activity log entries for this rider."
          >
            <ul className="riders-detail__activity">
              {auditRows.map((log) => (
                <li key={log.id} className="riders-detail__activity-item">
                  <span className="riders-cell-hint">
                    {log.created_at ? formatTimestamp(log.created_at) : "N/A"}
                  </span>
                  <div>
                    {naOr(log.action)}
                    {log.summary ? ` — ${log.summary}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </AsyncSection>
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
