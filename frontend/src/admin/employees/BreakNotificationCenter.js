import React, { useCallback, useEffect, useRef, useState } from "react";
import "./BreakNotificationCenter.css";
import { fetchEmployeeLinkage } from "./attendanceApi";
import {
  CLOCK_OUT_REMINDERS,
  WORK_SCHEDULE,
  acknowledgeBreakNotification,
  fetchBreakNotifications,
  fetchBreakStatus,
  runBreakDispatch,
} from "./breakApi";

/**
 * Automatic break notifications + clock-out reminders (Phase 4).
 *
 * The backend dispatches on the approved schedule; this view polls for the employee's pending
 * notifications and presents them as a professional popup with a notification tone.
 * A notification NEVER creates or changes an actual break record, and nobody is ever clocked
 * out automatically.
 *
 * BREAKFAST  09:55 / 10:00 / 10:25 / 10:30
 * LUNCH      12:55 / 13:00 / 13:55 / 14:00
 * CLOCK-OUT  16:55 / 17:00 / 17:05
 */

const TABS = [
  { id: "mine", label: "My Notifications" },
  { id: "schedule", label: "Schedule & Clock-out" },
  { id: "supervisor", label: "Supervisor Break Status" },
];

function message(error) {
  const detail = error?.response?.data?.detail;
  if (detail) return detail;
  if (error?.response?.status === 403) return "Your role does not permit this view.";
  return "The request could not be completed.";
}

/** A short, professional two-tone chime generated locally — no audio asset required. */
function playTone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1174].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + index * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.18 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.17);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.18);
      osc.stop(now + index * 0.18 + 0.2);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch (error) {
    // Audio is a nicety; never let it break the page.
  }
}

export default function BreakNotificationCenter() {
  const [tab, setTab] = useState("mine");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [linked, setLinked] = useState(null);
  const [pending, setPending] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [rows, setRows] = useState([]);
  const [popup, setPopup] = useState(null);
  const [dispatchInfo, setDispatchInfo] = useState(null);
  const seenIds = useRef(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "mine") {
        // Only ask for employee self-service notifications when this account is an employee,
        // so an administrator never triggers an avoidable 403.
        const linkageRes = await fetchEmployeeLinkage().catch(() => null);
        const isLinked = Boolean(linkageRes?.data?.linked);
        setLinked(isLinked);
        if (!isLinked) {
          setPending([]);
          setSchedule([]);
          return;
        }
        const response = await fetchBreakNotifications();
        const items = response.data?.notifications || [];
        setPending(items);
        setSchedule(response.data?.schedule || []);
        const fresh = items.find((item) => !seenIds.current.has(item.id));
        if (fresh) {
          seenIds.current.add(fresh.id);
          setPopup(fresh);
          playTone();
        }
      } else if (tab === "supervisor") {
        const response = await fetchBreakStatus({});
        setRows(response.data?.rows || []);
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

  // Poll for new notifications so a scheduled reminder surfaces without a manual refresh.
  useEffect(() => {
    if (tab !== "mine" || linked !== true) return undefined;
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [tab, linked, load]);

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
    <div className="bn">
      <header className="bn__head">
        <h2>Break Notifications &amp; Clock-out Reminders</h2>
        <p className="bn__sub">
          Automatic, schedule-driven notifications. They never create or modify an actual break
          record and nobody is ever clocked out automatically — they simply remind the employee.
        </p>
      </header>

      <nav className="bn__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bn__tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <div className="bn__alert bn__alert--error">{error}</div> : null}
      {notice ? <div className="bn__alert bn__alert--ok">{notice}</div> : null}
      {loading ? <div className="bn__loading">Loading…</div> : null}

      {popup ? (
        <div className="bn__popup" role="alertdialog" aria-label="Break notification">
          <div className="bn__popup-icon" aria-hidden="true">
            ⏰
          </div>
          <div className="bn__popup-body">
            <strong>{popup.title || popup.kind}</strong>
            <p>{popup.message}</p>
            <span className="bn__popup-time">{popup.due_at}</span>
          </div>
          <button
            type="button"
            className="bn__popup-btn"
            onClick={() =>
              run(async () => {
                await acknowledgeBreakNotification(popup.id);
                setPopup(null);
              }, "Notification acknowledged.")
            }
          >
            Acknowledge
          </button>
          <button
            type="button"
            className="bn__popup-close"
            aria-label="Dismiss"
            onClick={() => setPopup(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {tab === "mine" ? (
        <section className="bn__panel">
          {linked === false ? (
            <div className="bn__alert bn__alert--info">
              This account has no employee profile, so it has no break notifications of its own.
              Use the Supervisor tab to see the break status of working employees.
            </div>
          ) : null}
          <h3>Pending notifications ({pending.length})</h3>
          <div className="bn__list">
            {pending.length === 0 ? (
              <p className="bn__empty">No pending break notifications.</p>
            ) : (
              pending.map((item) => (
                <div key={item.id} className="bn__item">
                  <div>
                    <strong>{item.title || item.kind}</strong>
                    <p>{item.message}</p>
                  </div>
                  <div className="bn__item-side">
                    <span className="bn__muted">{item.due_at}</span>
                    <button
                      type="button"
                      onClick={() =>
                        run(
                          () => acknowledgeBreakNotification(item.id),
                          "Notification acknowledged."
                        )
                      }
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="bn__hint">
            Notifications are read once. Reading them marks them delivered — they never create or
            modify a break record.
          </p>
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="bn__panel">
          <h3>Clock-out reminders</h3>
          <div className="bn__cards">
            {CLOCK_OUT_REMINDERS.map((item) => (
              <div key={item.time} className="bn__card bn__card--clockout">
                <span className="bn__card-time">{item.time}</span>
                <span className="bn__card-label">{item.label}</span>
              </div>
            ))}
          </div>

          <h3>Full working-day schedule</h3>
          <div className="bn__tablewrap">
            <table className="bn__table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {WORK_SCHEDULE.map((item) => (
                  <tr key={item.time}>
                    <td className="bn__time">{item.time}</td>
                    <td>{item.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {schedule.length ? (
            <>
              <h3>Backend schedule for this employee</h3>
              <div className="bn__tablewrap">
                <table className="bn__table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Kind</th>
                      <th>Break</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((entry, index) => (
                      <tr key={`${entry.time}-${index}`}>
                        <td className="bn__time">{entry.time}</td>
                        <td>{entry.kind}</td>
                        <td>{entry.break_type || "—"}</td>
                        <td>{entry.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "supervisor" ? (
        <section className="bn__panel">
          <div className="bn__toolbar">
            <h3>Break status ({rows.length})</h3>
            <button
              type="button"
              className="bn__btn-secondary"
              onClick={() =>
                run(async () => {
                  const response = await runBreakDispatch();
                  setDispatchInfo(response.data);
                }, "Break notification dispatch sweep executed.")
              }
            >
              Run dispatch sweep
            </button>
          </div>
          {dispatchInfo ? (
            <p className="bn__hint">
              Last sweep: <strong>{dispatchInfo.dispatched ?? 0}</strong> notification(s)
              dispatched.
            </p>
          ) : null}
          <div className="bn__tablewrap">
            <table className="bn__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Mode</th>
                  <th>On break</th>
                  <th>Break type</th>
                  <th>Started</th>
                  <th>Overdue</th>
                  <th>Next notification</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="bn__empty">
                      No employees are currently clocked in.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.employee_number}>
                      <td>
                        {row.employee_name}
                        <span className="bn__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.department || "—"}</td>
                      <td>{row.work_mode}</td>
                      <td>{row.on_break ? "Yes" : "No"}</td>
                      <td>{row.break_type || "—"}</td>
                      <td>{row.break_started_at || "—"}</td>
                      <td>
                        {row.break_overdue ? (
                          <span className="bn__pill bn__pill--overdue">overdue</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.next_notification_at
                          ? `${row.next_notification_at} (${row.next_notification_kind})`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

    </div>
  );
}

