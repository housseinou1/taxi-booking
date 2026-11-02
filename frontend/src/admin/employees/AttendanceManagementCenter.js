import React, { useCallback, useEffect, useState } from "react";

import { AlertBanner, InlineError, TableSkeleton } from "../components/library";
import {
  LEAVE_TYPES,
  SCHEDULE_TYPES,
  WORK_MODES,
  clockIn,
  clockInByQr,
  clockInByTablet,
  clockOut,
  createHoliday,
  createLeave,
  endBreak,
  exportAttendance,
  fetchAttendanceStatus,
  fetchEmployeeLinkage,
  fetchCorrections,
  fetchDashboard,
  fetchHolidays,
  fetchIssues,
  fetchLeave,
  fetchMyAttendance,
  fetchWorkSchedules,
  requestCorrection,
  reviewCorrection,
  saveWorkSchedule,
  startBreak,
} from "./attendanceApi";
import useUrlTab from "../layouts/useUrlTab";

/**
 * Employees & HR -> Attendance Management (office + remote).
 *
 * Employees clock in/out (portal, authorized office tablet, or ID-card QR) and manage breaks;
 * HR sees the daily/weekly/monthly dashboard, late arrivals, absences, overtime, department
 * breakdown, corrections, leave, schedules and CSV/PDF exports. The CEO overview lives in the
 * CEO Command Center. No GPS, camera or facial recognition is used anywhere.
 */

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "late", label: "Late arrivals" },
  { id: "absences", label: "Absences" },
  { id: "overtime", label: "Overtime" },
  { id: "corrections", label: "Corrections" },
  { id: "leave", label: "Leave" },
  { id: "schedules", label: "Schedules" },
  { id: "exports", label: "Reports & exports" },
];

const CITIES = ["", "Nouakchott", "Nouadhibou"];

export function minutesToHours(minutes) {
  const value = Number(minutes) || 0;
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`;
}

export function clockTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AttendanceManagementCenter() {
  const [tab, setTab] = useUrlTab(TABS.map((item) => item.id), "dashboard");
  const [city, setCity] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [view, setView] = useState("daily");

  const [status, setStatus] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [mine, setMine] = useState(null);
  const [issues, setIssues] = useState(null);
  const [corrections, setCorrections] = useState([]);
  const [leave, setLeave] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workMode, setWorkMode] = useState("office");
  const [workLocation, setWorkLocation] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [tabletNumber, setTabletNumber] = useState("");
  const [correction, setCorrection] = useState({
    work_date: "",
    requested_clock_out: "",
    reason: "",
  });
  const [leaveForm, setLeaveForm] = useState({
    employee_number: "",
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [scheduleForm, setScheduleForm] = useState({
    employee_number: "",
    schedule_type: "full_time",
    work_mode: "office",
    arrangement: "",
    timezone: "Africa/Nouakchott",
  });
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "", city: "" });

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    // The two employee SELF-SERVICE endpoints below only work for an account that is linked
    // to an employee profile. An administrator is normally not an employee, so calling them
    // would always return 403 "No employee record is linked to this account." We probe the
    // caller's own linkage first and skip those calls entirely when there is none, so the
    // admin UI does not generate avoidable failed requests.
    const linkageRes = await fetchEmployeeLinkage().catch(() => null);
    const linked = Boolean(linkageRes?.data?.linked);
    const [statusRes, dashRes, mineRes] = await Promise.all([
      linked ? fetchAttendanceStatus().catch(() => null) : Promise.resolve(null),
      fetchDashboard({ date, city: city || undefined, view }).catch(() => null),
      linked ? fetchMyAttendance({}).catch(() => null) : Promise.resolve(null),
    ]);
    setStatus(statusRes?.data || null);
    setDashboard(dashRes?.data || null);
    setMine(mineRes?.data || null);
    setLoading(false);
  }, [city, date, view]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const loadTab = useCallback(async () => {
    try {
      if (["late", "absences", "overtime"].includes(tab)) {
        const response = await fetchIssues({ kind: tab, date, city: city || undefined });
        setIssues(response.data);
      } else if (tab === "corrections") {
        const response = await fetchCorrections({});
        setCorrections(response.data?.corrections || []);
      } else if (tab === "leave") {
        const [leaveRes, holidayRes] = await Promise.all([
          fetchLeave({ city: city || undefined }),
          fetchHolidays({}),
        ]);
        setLeave(leaveRes.data?.leave || []);
        setHolidays(holidayRes.data?.holidays || []);
      } else if (tab === "schedules") {
        const response = await fetchWorkSchedules({ city: city || undefined });
        setSchedules(response.data?.schedules || []);
      }
    } catch (err) {
      setError("Could not load this section.");
    }
  }, [city, date, tab]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const run = async (action, successMessage) => {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await loadCore();
      await loadTab();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : err?.response?.status === 403
            ? "You are not authorized to perform this action."
            : "The action could not be completed."
      );
    } finally {
      setWorking(false);
    }
  };

  const clockedIn = Boolean(status?.clocked_in);
  const onBreak = Boolean(status?.on_break);

  return (
    <section className="attendance">
      <header className="attendance__head">
        <div>
          <span>Employees &amp; HR</span>
          <h2>Attendance Management</h2>
          <p>
            Office and remote clock-in/out, breaks, overtime and HR oversight. Timestamps are
            recorded server-side in UTC and reported on Africa/Nouakchott.
          </p>
        </div>
        <div className="attendance__filters">
          <label>
            <span>View</span>
            <select value={view} onChange={(event) => setView(event.target.value)}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Office</span>
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              {CITIES.map((item) => (
                <option key={item || "all"} value={item}>
                  {item || "All offices"}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {error ? <InlineError message={error} /> : null}
      {notice ? <AlertBanner tone="success">{notice}</AlertBanner> : null}

      <div className="attendance__grid">
        <section className="attendance__card">
          <h3>My clock</h3>
          {status?.employee_number ? (
            <p className="attendance__meta">
              {status.employee_number} · {status.city || "—"} ·{" "}
              {clockedIn ? (onBreak ? "On break" : "Clocked in") : "Clocked out"}
            </p>
          ) : (
            <p className="attendance__meta">
              No employee record is linked to this account. HR can still use the tablet or QR
              clock-in.
            </p>
          )}

          <div className="attendance__clock-row">
            <label>
              <span>Work mode</span>
              <select
                value={workMode}
                onChange={(event) => setWorkMode(event.target.value)}
                aria-label="Work mode"
              >
                {WORK_MODES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Work location / arrangement</span>
              <input
                type="text"
                value={workLocation}
                placeholder="e.g. Nouakchott office, Home"
                onChange={(event) => setWorkLocation(event.target.value)}
                aria-label="Work location"
              />
            </label>
          </div>

          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || clockedIn}
              onClick={() =>
                run(
                  () => clockIn({ workMode, workLocation: workLocation || undefined }),
                  "Clocked in."
                )
              }
            >
              Clock in
            </button>
            <button
              type="button"
              disabled={working || !clockedIn}
              onClick={() => run(() => clockOut(), "Clocked out.")}
            >
              Clock out
            </button>
            <button
              type="button"
              disabled={working || !clockedIn || onBreak}
              onClick={() => run(() => startBreak(), "Break started.")}
            >
              Start break
            </button>
            <button
              type="button"
              disabled={working || !onBreak}
              onClick={() => run(() => endBreak(), "Break ended.")}
            >
              End break
            </button>
          </div>

          {status?.record ? (
            <dl className="attendance__today">
              <div>
                <dt>Clock in</dt>
                <dd>{clockTime(status.record.clock_in)}</dd>
              </div>
              <div>
                <dt>Clock out</dt>
                <dd>{clockTime(status.record.clock_out)}</dd>
              </div>
              <div>
                <dt>Break</dt>
                <dd>{minutesToHours(status.record.break_minutes)}</dd>
              </div>
              <div>
                <dt>Worked</dt>
                <dd>{minutesToHours(status.record.worked_minutes)}</dd>
              </div>
              <div>
                <dt>Overtime</dt>
                <dd>{minutesToHours(status.record.overtime_minutes)}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="attendance__card">
          <h3>Office clock-in methods</h3>
          <p className="attendance__meta">
            A QR scan alone never authenticates an employee — it runs under an authorized staff
            session and is verified server-side.
          </p>
          <label>
            <span>Attendance tablet — employee number</span>
            <input
              type="text"
              value={tabletNumber}
              placeholder="YAM110001LAR"
              onChange={(event) => setTabletNumber(event.target.value)}
              aria-label="Tablet employee number"
            />
          </label>
          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || !tabletNumber}
              onClick={() =>
                run(
                  () => clockInByTablet(tabletNumber, { workMode: "office" }),
                  "Tablet clock-in recorded."
                )
              }
            >
              Tablet clock-in
            </button>
          </div>
          <label>
            <span>ID-card QR scan value</span>
            <input
              type="text"
              value={scanValue}
              placeholder="Paste the scanned card value"
              onChange={(event) => setScanValue(event.target.value)}
              aria-label="Card QR value"
            />
          </label>
          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || !scanValue}
              onClick={() => run(() => clockInByQr(scanValue), "QR clock-in recorded.")}
            >
              QR clock-in
            </button>
          </div>
        </section>
      </div>

      <nav className="attendance__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : tab === "dashboard" && dashboard ? (
        <>
          <div className="attendance__stats">
            {[
              ["Total employees", dashboard.total_employees],
              ["Currently working", dashboard.working],
              ["Office working", dashboard.office_working],
              ["Remote working", dashboard.remote_working],
              ["On break", dashboard.on_break],
              ["Late arrivals", dashboard.late_arrivals],
              ["Absent", dashboard.absent],
              ["On approved leave", dashboard.on_approved_leave],
              ["Completed shifts", dashboard.completed_shifts],
              ["Missing clock-outs", dashboard.missed_clock_outs],
              ["Overtime", minutesToHours(dashboard.overtime_minutes)],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </article>
            ))}
          </div>

          {dashboard.holiday ? (
            <p className="attendance__meta">
              Holiday: {dashboard.holiday.name} ({dashboard.holiday.date})
            </p>
          ) : null}

          <h3>Department attendance</h3>
          {dashboard.departments?.length ? (
            <table className="attendance__table">
              <thead>
                <tr>
                  <th>Department</th>
                  <th>Present</th>
                  <th>Late</th>
                  <th>Remote</th>
                  <th>Completed</th>
                  <th>Overtime</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.departments.map((row) => (
                  <tr key={row.department}>
                    <td>{row.department}</td>
                    <td>{row.present}</td>
                    <td>{row.late}</td>
                    <td>{row.remote}</td>
                    <td>{row.completed}</td>
                    <td>{minutesToHours(row.overtime_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="attendance__meta">No attendance recorded for this day yet.</p>
          )}

          {dashboard.period ? (
            <>
              <h3>{dashboard.view === "weekly" ? "Weekly" : "Monthly"} totals</h3>
              <p className="attendance__meta">
                {dashboard.period.start} → {dashboard.period.end} · worked{" "}
                {minutesToHours(dashboard.period.totals.worked_minutes)} · overtime{" "}
                {dashboard.period.totals.overtime_hours}h · breaks{" "}
                {minutesToHours(dashboard.period.totals.break_minutes)}
              </p>
            </>
          ) : null}
        </>
      ) : null}

      {tab === "corrections" ? (
        <>
          <h3>Request a correction</h3>
          <p className="attendance__meta">
            Corrections never overwrite the original record: HR approval applies the new time and
            the original is preserved with a full audit trail.
          </p>
          <div className="attendance__clock-row">
            <label>
              <span>Work date</span>
              <input
                type="date"
                value={correction.work_date}
                onChange={(event) =>
                  setCorrection({ ...correction, work_date: event.target.value })
                }
                aria-label="Correction work date"
              />
            </label>
            <label>
              <span>Corrected clock-out</span>
              <input
                type="datetime-local"
                value={correction.requested_clock_out}
                onChange={(event) =>
                  setCorrection({ ...correction, requested_clock_out: event.target.value })
                }
                aria-label="Corrected clock out"
              />
            </label>
          </div>
          <label>
            <span>Reason</span>
            <input
              type="text"
              value={correction.reason}
              onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}
              aria-label="Correction reason"
            />
          </label>
          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || !correction.work_date || !correction.reason}
              onClick={() =>
                run(
                  () =>
                    requestCorrection({
                      work_date: correction.work_date,
                      requested_clock_out: correction.requested_clock_out
                        ? new Date(correction.requested_clock_out).toISOString()
                        : undefined,
                      reason: correction.reason,
                    }),
                  "Correction request submitted."
                )
              }
            >
              Submit request
            </button>
          </div>

          <h3>Correction requests</h3>
          <table className="attendance__table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Date</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.employee_name} ({row.employee_number})
                  </td>
                  <td>{row.work_date}</td>
                  <td>{row.reason}</td>
                  <td>{row.status}</td>
                  <td>
                    {row.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            run(() => reviewCorrection(row.id, "approve"), "Correction approved.")
                          }
                        >
                          Approve
                        </button>{" "}
                        <button
                          type="button"
                          disabled={working}
                          onClick={() =>
                            run(() => reviewCorrection(row.id, "reject"), "Correction rejected.")
                          }
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={5}>No correction requests.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}

      {["late", "absences", "overtime"].includes(tab) ? (
        <>
          <h3>
            {tab === "late" ? "Late arrivals" : tab === "absences" ? "Absences" : "Overtime"}
          </h3>
          {tab === "absences" ? (
            <>
              <h4>On approved leave</h4>
              <ul>
                {(issues?.on_leave || []).map((row) => (
                  <li key={row.employee_number}>
                    {row.employee_name} ({row.employee_number})
                  </li>
                ))}
                {(issues?.on_leave || []).length === 0 ? <li>None</li> : null}
              </ul>
              <h4>Absent</h4>
              <ul>
                {(issues?.absent || []).map((row) => (
                  <li key={row.employee_number}>
                    {row.employee_name} ({row.employee_number})
                  </li>
                ))}
                {(issues?.absent || []).length === 0 ? <li>None</li> : null}
              </ul>
            </>
          ) : (
            <table className="attendance__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>{tab === "late" ? "Late" : "Overtime"}</th>
                  <th>Worked</th>
                </tr>
              </thead>
              <tbody>
                {(issues?.rows || []).map((row) => (
                  <tr key={row.employee_number}>
                    <td>
                      {row.employee_name} ({row.employee_number})
                    </td>
                    <td>
                      {minutesToHours(tab === "late" ? row.late_minutes : row.overtime_minutes)}
                    </td>
                    <td>{row.worked_minutes ? minutesToHours(row.worked_minutes) : "—"}</td>
                  </tr>
                ))}
                {(issues?.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={3}>Nothing recorded for this day.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </>
      ) : null}

      {tab === "leave" ? (
        <>
          <h3>Record leave (HR Manager)</h3>
          <div className="attendance__clock-row">
            <label>
              <span>Employee number</span>
              <input
                type="text"
                value={leaveForm.employee_number}
                onChange={(event) =>
                  setLeaveForm({ ...leaveForm, employee_number: event.target.value })
                }
                aria-label="Leave employee number"
              />
            </label>
            <label>
              <span>Type</span>
              <select
                value={leaveForm.leave_type}
                onChange={(event) =>
                  setLeaveForm({ ...leaveForm, leave_type: event.target.value })
                }
                aria-label="Leave type"
              >
                {LEAVE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>From</span>
              <input
                type="date"
                value={leaveForm.start_date}
                onChange={(event) =>
                  setLeaveForm({ ...leaveForm, start_date: event.target.value })
                }
                aria-label="Leave start"
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date"
                value={leaveForm.end_date}
                onChange={(event) => setLeaveForm({ ...leaveForm, end_date: event.target.value })}
                aria-label="Leave end"
              />
            </label>
          </div>
          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || !leaveForm.employee_number || !leaveForm.start_date}
              onClick={() => run(() => createLeave(leaveForm), "Leave recorded and approved.")}
            >
              Save leave
            </button>
          </div>

          <h4>Leave records</h4>
          <table className="attendance__table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Type</th>
                <th>Period</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leave.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.employee_name} ({row.employee_number})
                  </td>
                  <td>{row.leave_type}</td>
                  <td>
                    {row.start_date} → {row.end_date}
                  </td>
                  <td>{row.status}</td>
                </tr>
              ))}
              {leave.length === 0 ? (
                <tr>
                  <td colSpan={4}>No leave recorded.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}

      {tab === "schedules" ? (
        <>
          <h3>Assign a work schedule (HR Manager)</h3>
          <p className="attendance__meta">
            Supports full-time, part-time, flexible, office-based, remote and hybrid arrangements,
            each with the employee&apos;s own display timezone (remote staff abroad included).
          </p>
          <div className="attendance__clock-row">
            <label>
              <span>Employee number</span>
              <input
                type="text"
                value={scheduleForm.employee_number}
                onChange={(event) =>
                  setScheduleForm({ ...scheduleForm, employee_number: event.target.value })
                }
                aria-label="Schedule employee number"
              />
            </label>
            <label>
              <span>Schedule</span>
              <select
                value={scheduleForm.schedule_type}
                onChange={(event) =>
                  setScheduleForm({ ...scheduleForm, schedule_type: event.target.value })
                }
                aria-label="Schedule type"
              >
                {SCHEDULE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Work mode</span>
              <select
                value={scheduleForm.work_mode}
                onChange={(event) =>
                  setScheduleForm({ ...scheduleForm, work_mode: event.target.value })
                }
                aria-label="Schedule work mode"
              >
                {WORK_MODES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Arrangement</span>
              <input
                type="text"
                value={scheduleForm.arrangement}
                placeholder="e.g. Hybrid: Mon/Wed in office"
                onChange={(event) =>
                  setScheduleForm({ ...scheduleForm, arrangement: event.target.value })
                }
                aria-label="Schedule arrangement"
              />
            </label>
            <label>
              <span>Display timezone</span>
              <input
                type="text"
                value={scheduleForm.timezone}
                onChange={(event) =>
                  setScheduleForm({ ...scheduleForm, timezone: event.target.value })
                }
                aria-label="Schedule timezone"
              />
            </label>
          </div>
          <div className="attendance__actions">
            <button
              type="button"
              disabled={working || !scheduleForm.employee_number}
              onClick={() => run(() => saveWorkSchedule(scheduleForm), "Work schedule saved.")}
            >
              Save schedule
            </button>
          </div>

          <h4>Assigned schedules</h4>
          <table className="attendance__table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Office</th>
                <th>Schedule</th>
                <th>Work mode</th>
                <th>Timezone</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((row) => (
                <tr key={row.employee_number}>
                  <td>
                    {row.employee_name} ({row.employee_number})
                  </td>
                  <td>{row.department || "—"}</td>
                  <td>{row.office}</td>
                  <td>{row.schedule_type}</td>
                  <td>{row.work_mode}</td>
                  <td>{row.timezone}</td>
                </tr>
              ))}
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={6}>No schedules assigned yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}

      {tab === "exports" ? (
        <>
          <h3>Reports &amp; exports</h3>
          <p className="attendance__meta">
            Authorised CSV and PDF exports for the selected period and office. Grouped reports
            summarise by department, work mode (office/remote) or office.
          </p>
          <div className="attendance__actions">
            {[
              ["Daily CSV", { format: "csv" }],
              ["Daily PDF", { format: "pdf" }],
              ["Department CSV", { format: "csv", group: "department" }],
              ["Office / remote CSV", { format: "csv", group: "work_mode" }],
              ["Remote only CSV", { format: "csv", work_mode: "remote" }],
            ].map(([label, options]) => (
              <button
                key={label}
                type="button"
                disabled={working}
                onClick={() =>
                  run(
                    () =>
                      exportAttendance({
                        start: date,
                        end: date,
                        city: city || undefined,
                        ...options,
                      }),
                    `${label} downloaded.`
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
