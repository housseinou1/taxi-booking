import React, { useCallback, useEffect, useMemo, useState } from "react";

import { ConfirmationDialog, Modal } from "../components/library";
import DriversManagement from "./DriversManagement";
import {
  approveDriverAccount,
  getDriverDirectory,
  rejectDriverAccount,
  setDriverUserBlocked,
} from "./driverAdminApi";
import "./drivers.css";

/**
 * Standalone "Drivers Management" page mounted at /admin/drivers.
 *
 * Previously /admin/drivers rendered the generic module hub (tile links to
 * Fleet/Approvals/Academy), so "Open driver management" from Vehicle
 * Management never reached an actual driver record. This page mounts the real
 * DriversManagement directory inside AdminShellPage (PermissionProvider is
 * supplied by the shell) and wires the account actions to the audited backend
 * endpoints:
 *
 *   POST /drivers/approve/<id>/   — phone + plate + e-signature enforced, audited
 *   POST /drivers/reject/<id>/    — reason required (>=5 chars), audited
 *   POST /auth/users/<id>/block|unblock/ — login suspend/reactivate, audited
 *
 * Deep-linking: /admin/drivers?driver=<DriverProfile id or user id> opens the
 * matching driver details drawer automatically, so navigation from Vehicle
 * Management / Fleet keeps the selected driver context.
 */

function readDriverParam() {
  try {
    return new URLSearchParams(window.location.search).get("driver") || "";
  } catch {
    return "";
  }
}

function extractError(err, fallback) {
  const data = err?.response?.data;
  if (data && typeof data === "object") {
    if (data.error) return data.error;
    if (data.detail) return data.detail;
  }
  return err?.message || fallback;
}

export default function DriversManagementPage() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [approveTarget, setApproveTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Read once on mount — the param names the DriverProfile id (preferred) or
  // the user id; the directory lookup below resolves either.
  const initialDriverId = useMemo(readDriverParam, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getDriverDirectory();
      setDrivers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(extractError(err, "Failed to load drivers."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const findDriver = useCallback(
    (id) =>
      drivers.find(
        (d) => String(d.id) === String(id) || String(d.user_id) === String(id)
      ) || null,
    [drivers]
  );

  const driverLabel = (driver) =>
    driver?.driver_name || driver?.full_name || driver?.email || `driver #${driver?.id}`;

  // Approve/reject handlers receive the DriverProfile id from DriversManagement.
  const requestApprove = (id) => setApproveTarget(findDriver(id) || { id });

  const confirmApprove = async () => {
    if (!approveTarget || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await approveDriverAccount(approveTarget.id);
      setNotice(`${driverLabel(approveTarget)} approved.`);
      await load();
    } catch (err) {
      setError(extractError(err, `Could not approve ${driverLabel(approveTarget)}.`));
    } finally {
      setApproveTarget(null);
      setBusy(false);
    }
  };

  const requestReject = (id) => {
    setRejectTarget(findDriver(id) || { id });
    setRejectReason("");
    setError("");
  };

  const confirmReject = async () => {
    if (!rejectTarget || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await rejectDriverAccount(rejectTarget.id, rejectReason);
      setNotice(`${driverLabel(rejectTarget)} rejected.`);
      await load();
    } catch (err) {
      setError(extractError(err, `Could not reject ${driverLabel(rejectTarget)}.`));
    } finally {
      setRejectTarget(null);
      setBusy(false);
    }
  };

  const handleBlockUser = async (userId, shouldBlock) => {
    setError("");
    setNotice("");
    try {
      await setDriverUserBlocked(userId, shouldBlock);
      setNotice(shouldBlock ? "Account suspended." : "Account reactivated.");
      await load();
    } catch (err) {
      setError(extractError(err, "Could not update the account status."));
    }
  };

  return (
    <div className="drivers-page">
      {notice ? (
        <p className="drivers-detail__empty" role="status" style={{ margin: "0 0 8px" }}>
          {notice}
        </p>
      ) : null}
      <DriversManagement
        drivers={drivers}
        loading={loading}
        error={error || null}
        initialDriverId={initialDriverId}
        onApproveDriver={requestApprove}
        onRejectDriver={requestReject}
        onBlockUser={handleBlockUser}
      />

      <ConfirmationDialog
        open={Boolean(approveTarget)}
        title="Approve driver"
        message={`Approve ${approveTarget ? driverLabel(approveTarget) : "this driver"}? The backend enforces the phone, plate and e-signature requirements and records this decision in the audit log.`}
        confirmLabel={busy ? "Approving…" : "Approve"}
        tone="primary"
        onConfirm={confirmApprove}
        onCancel={() => setApproveTarget(null)}
      />

      <Modal
        open={Boolean(rejectTarget)}
        title="Reject driver"
        onClose={() => setRejectTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => setRejectTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--danger"
              disabled={busy || rejectReason.trim().length < 5}
              onClick={confirmReject}
            >
              {busy ? "Rejecting…" : "Confirm rejection"}
            </button>
          </>
        }
      >
        <p>
          Reject {rejectTarget ? driverLabel(rejectTarget) : "this driver"}? A clear
          reason is required (audited) and the account is deactivated.
        </p>
        <label
          className="drivers-cell-hint"
          style={{ display: "block", margin: "0 0 4px" }}
          htmlFor="driver-reject-reason"
        >
          Rejection reason (required — audited)
        </label>
        <textarea
          id="driver-reject-reason"
          rows={3}
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          style={{ width: "100%", boxSizing: "border-box" }}
        />
      </Modal>
    </div>
  );
}
