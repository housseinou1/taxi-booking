import React, { useEffect, useRef, useState } from "react";

import { Drawer, StatusChip } from "../components/library";
import AdminActionGuard from "../components/guards/AdminActionGuard";
import { formatTimestamp } from "../components/library/utils/formatters";
import {
  getAccountStatus,
  getOnlineStatus,
  getVerificationStatus,
} from "./driversSelectors";
import {
  getDriverActivity,
  getDriverAuditTrail,
  getDriverEarnings,
  getDriverPayouts,
  getDriverRideHistory,
} from "./driversApi";

const RIDE_HISTORY_PAGE_SIZE = 10;
const INITIAL_SECTION = { loading: false, error: null, data: null };

function Field({ label, children }) {
  return (
    <div className="drivers-detail__field">
      <dt>{label}</dt>
      <dd>{children ?? "—"}</dd>
    </div>
  );
}

function initials(driver) {
  const name = String(driver?.driver_name || driver?.email || "?").trim();
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

/** Format a numeric rating to two decimals, or "N/A" when unknown (never 0 for unknown). */
function formatRating(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return num.toFixed(2);
}

/** Format a completed-rides count as a number, or "N/A" when the key is absent. */
function formatCount(value) {
  if (value === null || value === undefined) return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return num;
}

/** Document-status chip tone: "valid" -> success, "expiring_soon" -> warning, "expired"/missing -> danger/neutral. */
function docTone(status) {
  if (status === "valid") return "success";
  if (status === "expiring_soon") return "warning";
  if (status === "expired") return "danger";
  return "neutral";
}

function DocRow({ label, status, expiresAt }) {
  return (
    <Field label={label}>
      <StatusChip label={status ? String(status).replace(/_/g, " ") : "N/A"} tone={docTone(status)} />
      <span className="drivers-cell-hint">
        Expires: {expiresAt ? formatTimestamp(expiresAt) : "N/A"}
      </span>
    </Field>
  );
}

/**
 * MRU money renderer that stays honest about missing data: null/undefined/""
 * renders "N/A" rather than coercing to 0 (which would fabricate a figure).
 * Backend money values arrive as Decimal strings.
 */
function formatMru(amount, currency = "MRU") {
  if (amount === null || amount === undefined || amount === "") return "N/A";
  const num = Number(amount);
  if (Number.isNaN(num)) return "N/A";
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency || "MRU"}`;
}

/** Render a timestamp or "N/A" when it is absent. */
function tsOrNa(value) {
  return value ? formatTimestamp(value) : "N/A";
}

/** Section body with explicit loading / error / empty / data states. */
function AsyncSection({ state, isEmpty, emptyLabel, children }) {
  if (state.loading) return <p className="drivers-detail__empty">Loading…</p>;
  if (state.error) return <p className="drivers-detail__error">{state.error}</p>;
  if (isEmpty) return <p className="drivers-detail__empty">{emptyLabel}</p>;
  return children;
}

/**
 * Driver Details drawer (Stage 1 + Stage 2).
 *
 * Stage 1 sections render from the driver dict already loaded by
 * AdminDashboard (GET /drivers/list/). Stage 2 adds four read-only, admin-only
 * per-driver fetches made when the drawer opens: activity (last login / last
 * seen), earnings (today / week / month / total), paginated ride history, and
 * payout history. Every fetch uses the driver dict `id` — the DriverProfile id —
 * which the backend resolves to the underlying User id. Missing data renders
 * "N/A" or an explicit empty state, never a fabricated 0.
 *
 * Earnings, commission, and payouts are kept separate: "Driver earnings (net)"
 * is the driver's share of completed fares, "Platform commission" is the app
 * fee, and "Payouts" are the actual withdrawal records in Payout history.
 *
 * Account status, identity-verification status, and online/offline status are
 * kept as three DISTINCT fields. Documents are linked via the existing public
 * /media/ getFileUrl (serving is unchanged).
 *
 * Adds focus management on top of the library Drawer (which handles
 * Escape/overlay close + aria-modal but not focus trap/return): on open focus
 * moves into the drawer, Tab is trapped, and focus returns to the invoking
 * element on close.
 */
export default function DriverDetailsDrawer({
  driver,
  open,
  getFileUrl,
  onClose,
  onApprove,
  onReject,
  onSuspendToggle,
}) {
  const drawerRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    previouslyFocusedRef.current = document.activeElement;
    const node = drawerRef.current;
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
      const previous = previouslyFocusedRef.current;
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [open]);

  // ---- Stage 2: per-driver admin data -------------------------------------
  // driver.id is the DriverProfile id; the backend maps it to User id.
  const driverId = driver?.id;
  const [activity, setActivity] = useState(INITIAL_SECTION);
  const [earnings, setEarnings] = useState(INITIAL_SECTION);
  const [history, setHistory] = useState(INITIAL_SECTION);
  const [historyPage, setHistoryPage] = useState(1);
  const [payouts, setPayouts] = useState(INITIAL_SECTION);
  const [audit, setAudit] = useState(INITIAL_SECTION);

  // Start each driver at the first ride-history page.
  useEffect(() => {
    setHistoryPage(1);
  }, [driverId]);

  // Activity, earnings, and payouts: fetched once per open + driver.
  useEffect(() => {
    if (!open || driverId == null) return undefined;
    let cancelled = false;
    const load = (setter, request, fallback) => {
      setter({ loading: true, error: null, data: null });
      request()
        .then((data) => {
          if (!cancelled) setter({ loading: false, error: null, data });
        })
        .catch((err) => {
          if (!cancelled) setter({ loading: false, error: err?.message || fallback, data: null });
        });
    };
    load(setActivity, () => getDriverActivity(driverId), "Failed to load activity.");
    load(setEarnings, () => getDriverEarnings(driverId), "Failed to load earnings.");
    load(setPayouts, () => getDriverPayouts(driverId), "Failed to load payout history.");
    load(setAudit, () => getDriverAuditTrail(driverId), "Failed to load audit history.");
    return () => {
      cancelled = true;
    };
  }, [open, driverId]);

  // Ride history: refetched when the page changes.
  useEffect(() => {
    if (!open || driverId == null) return undefined;
    let cancelled = false;
    setHistory((prev) => ({ ...prev, loading: true, error: null }));
    getDriverRideHistory(driverId, { page: historyPage, page_size: RIDE_HISTORY_PAGE_SIZE })
      .then((data) => {
        if (!cancelled) setHistory({ loading: false, error: null, data });
      })
      .catch((err) => {
        if (!cancelled)
          setHistory({ loading: false, error: err?.message || "Failed to load ride history.", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [open, driverId, historyPage]);

  if (!open || !driver) return null;

  const verification = getVerificationStatus(driver);
  const account = getAccountStatus(driver);
  const online = getOnlineStatus(driver);

  const photoUrl = driver.driver_photo ? getFileUrl?.(driver.driver_photo) : null;
  const idDocUrl = driver.national_id_document ? getFileUrl?.(driver.national_id_document) : null;
  const licenseUrl = driver.license_file ? getFileUrl?.(driver.license_file) : null;

  const suspensionReason =
    driver.application_rejection_reason || driver.account_risk_reason || null;

  const acceptanceRate =
    driver.acceptance_rate_computed != null
      ? driver.acceptance_rate_computed
      : driver.acceptance_rate;

  const canReject = driver.status !== "rejected";

  // Driver Agreement / legal e-signature status, read ONLY from the already-
  // present driver.legal_signature (serialized by the backend serialize_driver
  // -> serialize_driver_signature). The backend approve gate
  // (driver_has_complete_signature) is authoritative and unchanged; this is a
  // read-only mirror so the admin can SEE the status and anticipate the block.
  const legal = driver.legal_signature || {};
  const signatureComplete = Boolean(legal.signature_complete);
  const signatureImageUrl = legal.signature_image_url
    ? getFileUrl?.(legal.signature_image_url) || legal.signature_image_url
    : null;
  const signatureDate = legal.driver_terms_accepted_at || null;
  const agreementVersion = legal.driver_terms_version || null;

  // Approve is blocked when the driver has not completed the e-signature, in
  // addition to the existing status rule. The backend still enforces this; the
  // UI just reflects it so the admin isn't surprised by a 400.
  const canApprove = driver.status !== "approved" && signatureComplete;

  // Stage 2 derived display values (all null-safe -> "N/A").
  const activityValue = (value, render = (v) => v) => {
    if (activity.loading) return "Loading…";
    if (value === null || value === undefined || value === "") return "N/A";
    return render(value);
  };
  const earningsData = earnings.data || null;
  const earningsBuckets = earningsData
    ? [
        { key: "today", label: "Today", bucket: earningsData.today },
        { key: "week", label: "This week", bucket: earningsData.week },
        { key: "month", label: "This month", bucket: earningsData.month },
      ]
    : [];
  const historySummary = history.data?.summary || null;
  const historyRows = history.data?.results || [];
  const historyTotalPages = history.data?.total_pages || 1;
  const historyCount = history.data?.count ?? 0;
  const payoutRows = payouts.data?.results || [];
  const payoutCount = payouts.data?.count ?? payoutRows.length;
  const auditRows = Array.isArray(audit.data) ? audit.data : [];

  return (
    <Drawer open={open} title={driver.driver_name || driver.email || "Driver details"} onClose={onClose}>
      <div ref={drawerRef} tabIndex={-1} className="drivers-detail-root">
        <div className="drivers-detail__chips">
          <StatusChip label={`Verification: ${verification.label}`} tone={verification.tone} />
          <StatusChip label={`Account: ${account.label}`} tone={account.tone} />
          <StatusChip label={online.label} tone={online.tone} />
        </div>

        {/* Profile photo */}
        <section className="drivers-detail__section">
          <h4>Profile photo</h4>
          {photoUrl ? (
            <img className="drivers-detail__photo" src={photoUrl} alt={`${driver.driver_name || "Driver"} profile`} />
          ) : (
            <div className="drivers-avatar drivers-avatar--fallback drivers-detail__photo" aria-label="No profile photo">
              {initials(driver)}
            </div>
          )}
        </section>

        {/* Personal information */}
        <section className="drivers-detail__section">
          <h4>Personal information</h4>
          <dl className="drivers-detail__grid">
            <Field label="Full name">{driver.driver_name || "N/A"}</Field>
            <Field label="Email">{driver.email || "N/A"}</Field>
            <Field label="Phone">{driver.phone_number || "N/A"}</Field>
            <Field label="City / region">
              {[driver.city_name, driver.region_name].filter(Boolean).join(" · ") || "N/A"}
            </Field>
            <Field label="Registered">
              {driver.date_joined ? formatTimestamp(driver.date_joined) : "N/A"}
            </Field>
            <Field label="Driver ID">{driver.driver_code || driver.id || "N/A"}</Field>
          </dl>
        </section>

        {/* Account information — account vs verification vs online kept distinct */}
        <section className="drivers-detail__section">
          <h4>Account information</h4>
          <dl className="drivers-detail__grid">
            <Field label="Account status">
              <StatusChip label={account.label} tone={account.tone} />
            </Field>
            <Field label="Verification status">
              <StatusChip label={verification.label} tone={verification.tone} />
            </Field>
            <Field label="Availability">
              <StatusChip label={online.label} tone={online.tone} />
            </Field>
            <Field label="Suspension reason">{naOr(suspensionReason)}</Field>
            <Field label="Last login">
              {activityValue(activity.data?.last_login, formatTimestamp)}
            </Field>
            <Field label="Last seen">
              {activityValue(activity.data?.last_seen, formatTimestamp)}
            </Field>
            <Field label="Last active device">
              {activityValue(activity.data?.last_seen_device)}
            </Field>
          </dl>
          {activity.error ? (
            <p className="drivers-detail__error">{activity.error}</p>
          ) : null}
        </section>

        {/* Performance — real counters from the loaded dict; Stage-2 gaps are honest */}
        <section className="drivers-detail__section">
          <h4>Performance</h4>
          <dl className="drivers-detail__grid">
            <Field label="Completed rides">{formatCount(driver.total_rides_completed)}</Field>
            <Field label="Cancelled rides">{naOr(driver.total_rides_cancelled)}</Field>
            <Field label="Acceptance rate">
              {acceptanceRate != null ? `${acceptanceRate}%` : "N/A"}
            </Field>
            <Field label="Average rating">{formatRating(driver.average_rating)}</Field>
            <Field label="Driver earnings (net, all time)">
              {earnings.loading ? "Loading…" : formatMru(earningsData?.total?.earnings_mru)}
            </Field>
          </dl>
        </section>

        {/* Stage 2: Earnings — earnings, commission and payouts kept separate */}
        <section className="drivers-detail__section">
          <h4>Earnings</h4>
          <AsyncSection state={earnings} isEmpty={!earningsData} emptyLabel="No earnings data available.">
            <dl className="drivers-detail__grid">
              <Field label="Driver earnings (net)">{formatMru(earningsData?.total?.earnings_mru)}</Field>
              <Field label="Platform commission">{formatMru(earningsData?.total?.commission_mru)}</Field>
              <Field label="Completed rides">{naOr(earningsData?.total?.ride_count)}</Field>
            </dl>
            <div className="drivers-detail__table-wrap">
              <table className="drivers-detail__table">
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Driver earnings (net)</th>
                    <th scope="col">Platform commission</th>
                    <th scope="col">Completed rides</th>
                  </tr>
                </thead>
                <tbody>
                  {earningsBuckets.map(({ key, label, bucket }) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>{formatMru(bucket?.earnings_mru)}</td>
                      <td>{formatMru(bucket?.commission_mru)}</td>
                      <td>{naOr(bucket?.ride_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="drivers-cell-hint">
              Earnings are the driver's share of completed fares. Money actually paid out to the
              driver is listed under Payout history.
            </p>
          </AsyncSection>
        </section>

        {/* Stage 2: Ride history (server-side paginated) */}
        <section className="drivers-detail__section">
          <h4>Ride history</h4>
          {historySummary ? (
            <dl className="drivers-detail__grid">
              <Field label="Total rides">{naOr(historySummary.total_rides)}</Field>
              <Field label="Completed">{naOr(historySummary.completed_rides)}</Field>
              <Field label="Cancelled">{naOr(historySummary.cancelled_rides)}</Field>
              <Field label="Average earning per ride">
                {formatMru(historySummary.average_earning_mru)}
              </Field>
            </dl>
          ) : null}
          <AsyncSection
            state={history}
            isEmpty={historyRows.length === 0}
            emptyLabel="No rides found for this driver."
          >
            <div className="drivers-detail__table-wrap">
              <table className="drivers-detail__table">
                <thead>
                  <tr>
                    <th scope="col">Ride</th>
                    <th scope="col">Pickup → destination</th>
                    <th scope="col">Rider</th>
                    <th scope="col">Status</th>
                    <th scope="col">Fare</th>
                    <th scope="col">Driver earning</th>
                    <th scope="col">Payment</th>
                    <th scope="col">Created</th>
                    <th scope="col">Completed</th>
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
                        {naOr(ride.rider_name)}
                        {ride.rider_email ? (
                          <span className="drivers-cell-hint">{ride.rider_email}</span>
                        ) : null}
                      </td>
                      <td>{naOr(ride.status)}</td>
                      <td>{formatMru(ride.fare)}</td>
                      <td>{formatMru(ride.driver_earning)}</td>
                      <td>{naOr(ride.payment_status)}</td>
                      <td>{tsOrNa(ride.created_at)}</td>
                      <td>{tsOrNa(ride.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {historyTotalPages > 1 ? (
              <div className="drivers-detail__pager">
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  disabled={historyPage <= 1 || history.loading}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="drivers-cell-hint">
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

        {/* Driver audit history (approvals, rejections, blocks, reintegration) */}
        <section className="drivers-detail__section">
          <h3>Audit history</h3>
          <AsyncSection
            state={audit}
            isEmpty={auditRows.length === 0}
            emptyLabel="No administrative actions recorded for this driver yet."
          >
            <div className="drivers-detail__table-wrap">
              <table className="drivers-detail__table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Administrator</th>
                    <th scope="col">Previous → new status</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id}>
                      <td>{tsOrNa(row.created_at)}</td>
                      <td>{naOr(row.action)}</td>
                      <td>
                        {naOr(row.actor_name || row.actor_email)}
                      </td>
                      <td>
                        {naOr(row.details?.previous_status)} → {naOr(row.details?.new_status)}
                      </td>
                      <td>{naOr(row.details?.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="drivers-cell-hint">
              Read-only audit trail. Documents and signature images are never stored here.
            </p>
          </AsyncSection>
        </section>

        {/* Stage 2: Payout / withdrawal history (no token, no card number) */}
        <section className="drivers-detail__section">
          <h4>Payout history</h4>
          <AsyncSection
            state={payouts}
            isEmpty={payoutRows.length === 0}
            emptyLabel="No payouts found for this driver."
          >
            <div className="drivers-detail__table-wrap">
              <table className="drivers-detail__table">
                <thead>
                  <tr>
                    <th scope="col">Payout</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col">Method</th>
                    <th scope="col">Approved</th>
                    <th scope="col">Paid</th>
                    <th scope="col">Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {payoutRows.map((payout) => (
                    <tr key={payout.id}>
                      <td>#{payout.id}</td>
                      <td>{formatMru(payout.amount, payout.currency)}</td>
                      <td>{naOr(payout.status)}</td>
                      <td>{naOr(payout.payout_method_label)}</td>
                      <td>{tsOrNa(payout.approved_at)}</td>
                      <td>{tsOrNa(payout.paid_at)}</td>
                      <td>{tsOrNa(payout.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="drivers-cell-hint">
              {payoutCount} withdrawal request(s). "Approved" does not mean paid — only a Paid date
              confirms the money was sent.
            </p>
          </AsyncSection>
        </section>

        {/* Identity verification */}
        <section className="drivers-detail__section">
          <h4>Identity verification</h4>
          <dl className="drivers-detail__grid">
            <Field label="Status">
              <StatusChip label={verification.label} tone={verification.tone} />
            </Field>
            <Field label="National ID number">{naOr(driver.national_id_number)}</Field>
          </dl>
          <h4 style={{ marginTop: 12 }}>Identity document</h4>
          {idDocUrl ? (
            <a className="drivers-detail__doc-link" href={idDocUrl} target="_blank" rel="noreferrer">
              View national ID document
            </a>
          ) : (
            <p className="drivers-detail__empty">No document on file</p>
          )}
        </section>

        {/* Driver Agreement / Legal e-signature (read-only mirror of backend gate) */}
        <section className="drivers-detail__section">
          <h4>Driver Agreement / Legal</h4>
          <dl className="drivers-detail__grid">
            <Field label="Electronic signature">
              <StatusChip
                label={signatureComplete ? "Signed" : "Not signed"}
                tone={signatureComplete ? "success" : "danger"}
              />
            </Field>
            <Field label="Signature date">
              {signatureDate ? formatTimestamp(signatureDate) : "N/A"}
            </Field>
            <Field label="Agreement version">{naOr(agreementVersion)}</Field>
          </dl>

          {signatureComplete ? (
            signatureImageUrl ? (
              <>
                <h4 style={{ marginTop: 12 }}>Agreement signature</h4>
                <img
                  className="drivers-detail__signature"
                  src={signatureImageUrl}
                  alt={`${driver.driver_name || "Driver"} agreement signature`}
                />
              </>
            ) : null
          ) : (
            <p className="drivers-detail__error" style={{ marginTop: 8 }}>
              Driver must complete the electronic signature in the Yala Driver app before approval.
            </p>
          )}
        </section>

        {/* Vehicle & documents */}
        <section className="drivers-detail__section">
          <h4>Vehicle information</h4>
          <dl className="drivers-detail__grid">
            <Field label="Category">{naOr(driver.driver_category_label || driver.car_type)}</Field>
            <Field label="Make">{naOr(driver.vehicle_make)}</Field>
            <Field label="Model">{naOr(driver.vehicle_model)}</Field>
            <Field label="Color">{naOr(driver.vehicle_color)}</Field>
            <Field label="Plate">{naOr(driver.vehicle_plate || driver.plate_number)}</Field>
          </dl>

          <h4 style={{ marginTop: 12 }}>Vehicle documents</h4>
          <dl className="drivers-detail__grid">
            <Field label="Driver license">
              <StatusChip
                label={driver.license_status ? String(driver.license_status).replace(/_/g, " ") : "N/A"}
                tone={docTone(driver.license_status)}
              />
              <span className="drivers-cell-hint">
                Expires: {driver.license_expires_at ? formatTimestamp(driver.license_expires_at) : "N/A"}
              </span>
              {licenseUrl ? (
                <a className="drivers-detail__doc-link" href={licenseUrl} target="_blank" rel="noreferrer">
                  View license
                </a>
              ) : null}
            </Field>
            <DocRow
              label="Carte Grise (registration)"
              status={driver.vehicle_registration_status}
              expiresAt={driver.vehicle_registration_expires_at}
            />
            <DocRow
              label="Insurance"
              status={driver.insurance_status}
              expiresAt={driver.insurance_expires_at}
            />
            <DocRow
              label="Vignette"
              status={driver.vignette_status}
              expiresAt={driver.vignette_expires_at}
            />
          </dl>
        </section>

        {/* Administrative actions — gating is applied by the caller (DriversManagement) */}
        <section className="drivers-detail__section">
          <h4>Administrative actions</h4>
          {!signatureComplete && driver.status !== "approved" ? (
            <p className="drivers-detail__error" style={{ marginTop: 0, marginBottom: 8 }}>
              Approve is disabled: the driver must complete the electronic signature
              in the Yala Driver app before approval.
            </p>
          ) : null}
          <div className="drivers-detail__actions">
            <AdminActionGuard action="drivers.edit" mode="disable">
              <button
                type="button"
                className="admin-lib-btn"
                disabled={!canApprove}
                title={
                  !signatureComplete && driver.status !== "approved"
                    ? "Driver must complete the electronic signature in the Yala Driver app before approval."
                    : undefined
                }
                onClick={() => onApprove(driver)}
              >
                Approve
              </button>
            </AdminActionGuard>
            <AdminActionGuard action="drivers.edit" mode="disable">
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                disabled={!canReject}
                onClick={() => onReject(driver)}
              >
                Reject
              </button>
            </AdminActionGuard>
            <AdminActionGuard action="drivers.edit" mode="disable">
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() => onSuspendToggle(driver)}
              >
                {driver.is_active === false ? "Reactivate account" : "Suspend account"}
              </button>
            </AdminActionGuard>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
