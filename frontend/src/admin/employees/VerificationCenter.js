import React, { useCallback, useEffect, useState } from "react";
import "./VerificationCenter.css";
import { fetchEmployeeLinkage } from "./attendanceApi";
import {
  fetchVerificationCeoOverview,
  fetchVerificationMonitoring,
  fetchVerificationStatus,
  requestVerificationRecovery,
  resendVerificationCode,
  runVerificationSweep,
  submitVerificationCode,
} from "./verificationApi";

/**
 * Hourly Employee Verification (Phase 4).
 *
 * Three views in one place:
 *   1. Employee  — the verification prompt, six-digit entry, countdown, resend, secure recovery.
 *   2. Supervisor— live monitoring (who is verified, pending, missed, on an authorized break).
 *   3. CEO       — aggregate verification figures for the Command Center.
 *
 * A verification code is never displayed, logged or stored by this component — the backend
 * only ever returns the lock state.
 */

const TABS = [
  { id: "verify", label: "My Verification" },
  { id: "monitor", label: "Supervisor Monitoring" },
  { id: "ceo", label: "CEO Overview" },
];

function secondsLeft(expiresAt) {
  if (!expiresAt) return 0;
  const diff = Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000);
  return diff > 0 ? diff : 0;
}

function clock(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function message(error) {
  const detail = error?.response?.data?.detail;
  if (detail) return detail;
  if (error?.response?.status === 403) return "Your role does not permit this view.";
  return "The request could not be completed.";
}

export default function VerificationCenter() {
  const [tab, setTab] = useState("verify");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [status, setStatus] = useState(null);
  const [linked, setLinked] = useState(null);
  const [code, setCode] = useState("");
  const [recoveryNote, setRecoveryNote] = useState("");
  const [remaining, setRemaining] = useState(0);

  const [rows, setRows] = useState([]);
  const [smsProvider, setSmsProvider] = useState("");
  const [overview, setOverview] = useState(null);
  const [sweep, setSweep] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "verify") {
        // Verification status is employee self-service. Probe linkage first so an
        // administrator without an employee profile does not generate an avoidable 403.
        const linkageRes = await fetchEmployeeLinkage().catch(() => null);
        const isLinked = Boolean(linkageRes?.data?.linked);
        setLinked(isLinked);
        if (!isLinked) {
          setStatus(null);
          return;
        }
        const response = await fetchVerificationStatus();
        setStatus(response.data);
        setRemaining(secondsLeft(response.data?.challenge?.expires_at));
      } else if (tab === "monitor") {
        const response = await fetchVerificationMonitoring({});
        setRows(response.data?.rows || []);
        setSmsProvider(response.data?.sms_provider || "");
      } else if (tab === "ceo") {
        const response = await fetchVerificationCeoOverview({});
        setOverview(response.data);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  // Live countdown for the five-minute code expiry.
  useEffect(() => {
    if (tab !== "verify" || !status?.challenge?.expires_at) return undefined;
    const timer = setInterval(() => {
      setRemaining(secondsLeft(status.challenge.expires_at));
    }, 1000);
    return () => clearInterval(timer);
  }, [tab, status]);

  const run = async (action, ok) => {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(ok);
      await load();
    } catch (err) {
      setError(message(err));
    }
  };

  return (
    <div className="vc">
      <header className="vc__head">
        <h2>Hourly Employee Verification</h2>
        <p className="vc__sub">
          A secure six-digit code is issued after 60 minutes of scheduled work and sent to the
          employee&apos;s verified phone. Codes are generated server-side, stored hashed, expire
          in five minutes, are single-use, and are never exposed to this interface.
        </p>
      </header>

      <nav className="vc__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`vc__tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <div className="vc__alert vc__alert--error">{error}</div> : null}
      {notice ? <div className="vc__alert vc__alert--ok">{notice}</div> : null}
      {loading ? <div className="vc__loading">Loading…</div> : null}

      {tab === "verify" ? (
        <section className="vc__panel">
          {linked === false ? (
            <div className="vc__alert vc__alert--info">
              This account has no employee profile, so it has no hourly verification of its own.
              Use the Supervisor Monitoring or CEO Overview tab instead.
            </div>
          ) : null}
          {status ? (
            <>
              <div className={`vc__state vc__state--${status.locked ? "locked" : "ok"}`}>
                <strong>
                  {status.locked ? "Session locked — verification required" : "Session active"}
                </strong>
                <span>{status.message}</span>
              </div>

              {status.challenge ? (
                <div className="vc__challenge">
                  <div className="vc__countdown">
                    <span className="vc__countdown-label">Code expires in</span>
                    <span className="vc__countdown-value">{clock(remaining)}</span>
                  </div>
                  <ul className="vc__meta">
                    <li>
                      Attempts remaining: <strong>{status.challenge.attempts_remaining}</strong>
                    </li>
                    <li>
                      Resends remaining: <strong>{status.challenge.resends_remaining}</strong>
                    </li>
                    <li>
                      Code sent to:{" "}
                      <strong>••••&nbsp;{status.challenge.phone_last4 || "----"}</strong>
                    </li>
                    <li>
                      Delivery: <strong>{status.challenge.sms_status || "mock"}</strong>
                    </li>
                  </ul>

                  <form
                    className="vc__form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await submitVerificationCode(code);
                        setCode("");
                      }, "Verification successful — your session is unlocked.");
                    }}
                  >
                    <label>
                      Enter the six-digit code
                      <input
                        className="vc__code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                    </label>
                    <button
                      type="submit"
                      className="vc__btn"
                      disabled={code.length !== 6 || remaining === 0}
                    >
                      Verify
                    </button>
                  </form>

                  <div className="vc__actions">
                    <button
                      type="button"
                      onClick={() =>
                        run(resendVerificationCode, "A new code has been sent to your phone.")
                      }
                      disabled={status.challenge.resends_remaining === 0}
                    >
                      Resend code
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="vc__recovery">
                <h3>Secure recovery</h3>
                <p className="vc__hint">
                  Cannot receive the code? Escalate to your supervisor. The session stays locked
                  until the recovery is reviewed by a human — it is never bypassed automatically.
                </p>
                <input
                  placeholder="Optional note for your supervisor"
                  value={recoveryNote}
                  onChange={(e) => setRecoveryNote(e.target.value)}
                />
                <button
                  type="button"
                  className="vc__btn vc__btn--secondary"
                  onClick={() =>
                    run(
                      () => requestVerificationRecovery(recoveryNote),
                      "Your supervisor has been notified."
                    )
                  }
                >
                  Request recovery
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "monitor" ? (
        <section className="vc__panel">
          <div className="vc__toolbar">
            <h3>Live verification monitoring ({rows.length})</h3>
            <button
              type="button"
              className="vc__btn vc__btn--secondary"
              onClick={() =>
                run(async () => {
                  const response = await runVerificationSweep();
                  setSweep(response.data);
                }, "Scheduler and expiry sweep executed.")
              }
            >
              Run scheduler sweep
            </button>
          </div>
          {sweep ? (
            <p className="vc__hint">
              Last sweep: <strong>{sweep.issued}</strong> code(s) issued,{" "}
              <strong>{sweep.missed}</strong> marked missed.
            </p>
          ) : null}
          <p className="vc__hint">
            Verification codes are never exposed through this view. SMS provider:{" "}
            <strong>{smsProvider || "mock"}</strong>.
          </p>
          <div className="vc__tablewrap">
            <table className="vc__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Mode</th>
                  <th>Clock-in</th>
                  <th>Last verified</th>
                  <th>Next due</th>
                  <th>Status</th>
                  <th>Missed</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="vc__empty">
                      No employees are currently working.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.employee_number}>
                      <td>
                        {row.employee_name}
                        <span className="vc__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.department || "—"}</td>
                      <td>{row.work_location || "—"}</td>
                      <td>{row.remote ? "Remote" : "Onsite"}</td>
                      <td>{row.clock_in || "—"}</td>
                      <td>{row.last_verified_at || "—"}</td>
                      <td>{row.next_due_at || "—"}</td>
                      <td>
                        <span className={`vc__pill vc__pill--${row.status}`}>{row.status}</span>
                        {row.exemption ? (
                          <span className="vc__pill vc__pill--exempt">{row.exemption}</span>
                        ) : null}
                      </td>
                      <td>{row.missed_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "ceo" ? (
        <section className="vc__panel">
          {overview ? (
            <>
              <div className="vc__cards">
                {[
                  ["Working", overview.total_working],
                  ["Onsite", overview.onsite],
                  ["Remote", overview.remote],
                  ["Verified", overview.verified],
                  ["Awaiting verification", overview.awaiting_verification],
                  ["Missed", overview.missed_verifications],
                  ["On authorized break", overview.on_authorized_break],
                  ["Needs review", overview.requiring_supervisor_review],
                ].map(([label, value]) => (
                  <div key={label} className="vc__card">
                    <span className="vc__card-value">{value ?? 0}</span>
                    <span className="vc__card-label">{label}</span>
                  </div>
                ))}
              </div>

              <h3>By city</h3>
              <div className="vc__tablewrap">
                <table className="vc__table">
                  <thead>
                    <tr>
                      <th>City</th>
                      <th>Working</th>
                      <th>Verified</th>
                      <th>Pending</th>
                      <th>Missed</th>
                      <th>On break</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(overview.cities || {}).map(([city, stats]) => (
                      <tr key={city}>
                        <td>{city}</td>
                        <td>{stats.working}</td>
                        <td>{stats.verified}</td>
                        <td>{stats.pending}</td>
                        <td>{stats.missed}</td>
                        <td>{stats.on_break}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3>By department</h3>
              <div className="vc__tablewrap">
                <table className="vc__table">
                  <thead>
                    <tr>
                      <th>Department</th>
                      <th>Working</th>
                      <th>Verified</th>
                      <th>Pending</th>
                      <th>Missed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.departments || []).map((dept) => (
                      <tr key={dept.department}>
                        <td>{dept.department}</td>
                        <td>{dept.working}</td>
                        <td>{dept.verified}</td>
                        <td>{dept.pending}</td>
                        <td>{dept.missed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

    </div>
  );
}
