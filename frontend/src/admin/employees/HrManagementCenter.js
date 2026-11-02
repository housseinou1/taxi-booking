import React, { useCallback, useEffect, useState } from "react";
import "./HrManagementCenter.css";
import {
  ABSENCE_CATEGORIES,
  DISCIPLINE_STAGES,
  DISCIPLINE_STATUSES,
  RECOGNITION_CATEGORIES,
  TASK_PERIODS,
  TASK_STATUSES,
  VIOLATION_TYPES,
  absenceAction,
  acknowledgePolicy,
  assignPerformanceTask,
  assignTraining,
  awardRecognition,
  completeTraining,
  disciplineAction,
  exitPermissionAction,
  fetchAbsences,
  fetchDisciplineCases,
  fetchExitPermissions,
  fetchPerformanceReviews,
  fetchPerformanceTasks,
  fetchPolicyAcknowledgments,
  fetchRecognition,
  fetchTraining,
  openDisciplineCase,
  performanceTaskAction,
  reportAbsence,
  requestExitPermission,
  writePerformanceReview,
} from "./hrApi";
import useUrlTab from "../layouts/useUrlTab";

/**
 * Employee HR Management Center (Phase 3).
 *
 * Sections: Exit Permissions, Absence Notifications, Discipline, Performance, Training,
 * Recognition, Policy Acknowledgment. Every action is a deliberate, named human step; the
 * backend enforces the RBAC tier and nothing here approves, disciplines, scores or pays
 * automatically. Employee self-service rows are only offered to a signed-in employee.
 */

const TABS = [
  { id: "exit", label: "Exit Permissions" },
  { id: "absence", label: "Absence Notifications" },
  { id: "discipline", label: "Discipline" },
  { id: "performance", label: "Performance" },
  { id: "training", label: "Training" },
  { id: "recognition", label: "Recognition" },
  { id: "policy", label: "Policy Acknowledgment" },
];

const EMPTY_EXIT = {
  employee_number: "",
  date: "",
  requested_departure: "",
  expected_return: "",
  reason: "",
  is_emergency: false,
};

const EMPTY_ABSENCE = {
  employee_number: "",
  date: "",
  category: "illness",
  reason: "",
  expected_return_date: "",
};

const EMPTY_CASE = {
  employee_number: "",
  violation: "other",
  summary: "",
  evidence: "",
  stage: "coaching",
};

const EMPTY_TASK = { employee_number: "", title: "", period: "daily", due_date: "" };
const EMPTY_TRAINING = { employee_number: "", title: "", due_date: "" };
const EMPTY_RECOGNITION = {
  employee_number: "",
  category: "performance",
  title: "",
  description: "",
  evidence: "",
  period: "",
};

function message(error) {
  const detail = error?.response?.data?.detail;
  if (detail) return detail;
  if (error?.response?.status === 403) {
    return "Your role does not permit this action.";
  }
  return "The request could not be completed.";
}


export default function HrManagementCenter() {
  const [tab, setTab] = useUrlTab(TABS.map((item) => item.id), "exit");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [exitRequests, setExitRequests] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [cases, setCases] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [training, setTraining] = useState([]);
  const [recognitions, setRecognitions] = useState([]);
  const [acknowledgments, setAcknowledgments] = useState([]);

  const [exitForm, setExitForm] = useState(EMPTY_EXIT);
  const [absenceForm, setAbsenceForm] = useState(EMPTY_ABSENCE);
  const [caseForm, setCaseForm] = useState(EMPTY_CASE);
  const [taskForm, setTaskForm] = useState(EMPTY_TASK);
  const [trainingForm, setTrainingForm] = useState(EMPTY_TRAINING);
  const [recognitionForm, setRecognitionForm] = useState(EMPTY_RECOGNITION);
  const [policyForm, setPolicyForm] = useState({ policy_key: "", policy_version: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (tab === "exit") {
        const response = await fetchExitPermissions({});
        setExitRequests(response.data?.exit_requests || []);
      } else if (tab === "absence") {
        const response = await fetchAbsences({});
        setAbsences(response.data?.absences || []);
      } else if (tab === "discipline") {
        const response = await fetchDisciplineCases({});
        setCases(response.data?.cases || []);
      } else if (tab === "performance") {
        const [taskRes, reviewRes] = await Promise.all([
          fetchPerformanceTasks({}),
          fetchPerformanceReviews({}),
        ]);
        setTasks(taskRes.data?.tasks || []);
        setReviews(reviewRes.data?.reviews || []);
        setCriteria(reviewRes.data?.criteria || []);
      } else if (tab === "training") {
        const response = await fetchTraining({});
        setTraining(response.data?.training || []);
      } else if (tab === "recognition") {
        const response = await fetchRecognition({});
        setRecognitions(response.data?.recognitions || []);
      } else if (tab === "policy") {
        const response = await fetchPolicyAcknowledgments({});
        setAcknowledgments(response.data?.acknowledgments || []);
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

  const run = async (action, successMessage) => {
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await load();
      return true;
    } catch (err) {
      setError(message(err));
      return false;
    }
  };

  return (
    <div className="hr-center">
      <header className="hr-center__head">
        <div>
          <h2>HR Management</h2>
          <p className="hr-center__sub">
            Human-driven HR workflows. Nothing is approved, disciplined, scored or paid
            automatically — every change is a named, audited action.
          </p>
        </div>
      </header>

      <nav className="hr-center__tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`hr-center__tab ${tab === item.id ? "is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <div className="hr-center__alert hr-center__alert--error">{error}</div> : null}
      {notice ? <div className="hr-center__alert hr-center__alert--ok">{notice}</div> : null}
      {loading ? <div className="hr-center__loading">Loading…</div> : null}

      {tab === "exit" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await requestExitPermission({
                  date: exitForm.date || undefined,
                  requested_departure: exitForm.requested_departure,
                  expected_return: exitForm.expected_return,
                  reason: exitForm.reason,
                  is_emergency: exitForm.is_emergency,
                });
                setExitForm(EMPTY_EXIT);
              }, "Exit permission requested.");
            }}
          >
            <h3>Request exit permission</h3>
            <p className="hr-center__hint">
              Creates a request for the signed-in employee account. A supervisor or HR
              member then approves or rejects it.
            </p>
            <div className="hr-center__grid">
              <label>
                Date
                <input
                  type="date"
                  value={exitForm.date}
                  onChange={(e) => setExitForm({ ...exitForm, date: e.target.value })}
                />
              </label>
              <label>
                Departure (HH:MM)
                <input
                  required
                  placeholder="11:00"
                  value={exitForm.requested_departure}
                  onChange={(e) =>
                    setExitForm({ ...exitForm, requested_departure: e.target.value })
                  }
                />
              </label>
              <label>
                Expected return (HH:MM)
                <input
                  required
                  placeholder="12:00"
                  value={exitForm.expected_return}
                  onChange={(e) => setExitForm({ ...exitForm, expected_return: e.target.value })}
                />
              </label>
              <label>
                Reason
                <input
                  value={exitForm.reason}
                  onChange={(e) => setExitForm({ ...exitForm, reason: e.target.value })}
                />
              </label>
              <label className="hr-center__check">
                <input
                  type="checkbox"
                  checked={exitForm.is_emergency}
                  onChange={(e) => setExitForm({ ...exitForm, is_emergency: e.target.checked })}
                />
                Emergency request
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Submit request
            </button>
          </form>

          <h3>Exit permission requests ({exitRequests.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Departure</th>
                  <th>Return</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exitRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="hr-center__empty">
                      No exit permission requests.
                    </td>
                  </tr>
                ) : (
                  exitRequests.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.date}</td>
                      <td>{row.requested_departure}</td>
                      <td>{row.expected_return}</td>
                      <td>
                        <span className={`hr-center__pill hr-center__pill--${row.status}`}>
                          {row.status}
                        </span>
                        {row.is_emergency ? (
                          <span className="hr-center__pill hr-center__pill--emergency">
                            emergency
                          </span>
                        ) : null}
                      </td>
                      <td className="hr-center__actions">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => exitPermissionAction(row.id, "decide", { approve: true }),
                              "Exit request approved."
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => exitPermissionAction(row.id, "decide", { approve: false }),
                              "Exit request rejected."
                            )
                          }
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "absence" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await reportAbsence({
                  date: absenceForm.date || undefined,
                  category: absenceForm.category,
                  reason: absenceForm.reason,
                  expected_return_date: absenceForm.expected_return_date || undefined,
                });
                setAbsenceForm(EMPTY_ABSENCE);
              }, "Absence notification submitted.");
            }}
          >
            <h3>Report an emergency absence</h3>
            <p className="hr-center__hint">
              Reported for the signed-in employee account. A reason is optional — no employee
              is ever required to disclose medical details, and a notification is never
              automatically treated as misconduct.
            </p>
            <div className="hr-center__grid">
              <label>
                Date
                <input
                  type="date"
                  value={absenceForm.date}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, date: e.target.value })}
                />
              </label>
              <label>
                Category
                <select
                  value={absenceForm.category}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, category: e.target.value })}
                >
                  {ABSENCE_CATEGORIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Expected return date
                <input
                  type="date"
                  value={absenceForm.expected_return_date}
                  onChange={(e) =>
                    setAbsenceForm({ ...absenceForm, expected_return_date: e.target.value })
                  }
                />
              </label>
              <label>
                General reason (optional)
                <input
                  value={absenceForm.reason}
                  onChange={(e) => setAbsenceForm({ ...absenceForm, reason: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Submit notification
            </button>
          </form>

          <h3>Absence notifications ({absences.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {absences.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hr-center__empty">
                      No absence notifications.
                    </td>
                  </tr>
                ) : (
                  absences.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.date}</td>
                      <td>{row.category}</td>
                      <td>
                        <span className={`hr-center__pill hr-center__pill--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="hr-center__actions">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => absenceAction(row.id, "acknowledge", {}),
                              "Absence acknowledged."
                            )
                          }
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => absenceAction(row.id, "review", { approve: true }),
                              "Absence approved."
                            )
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => absenceAction(row.id, "review", { approve: false }),
                              "Absence rejected."
                            )
                          }
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "discipline" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await openDisciplineCase(caseForm);
                setCaseForm(EMPTY_CASE);
              }, "Discipline case opened. No penalty is applied automatically.");
            }}
          >
            <h3>Open a discipline case (HR Manager)</h3>
            <p className="hr-center__hint">
              Documentation only. The employee is invited to respond before any decision, and
              no suspension, termination or wage deduction is ever automatic.
            </p>
            <div className="hr-center__grid">
              <label>
                Employee number
                <input
                  required
                  placeholder="YAM110001LAR"
                  value={caseForm.employee_number}
                  onChange={(e) => setCaseForm({ ...caseForm, employee_number: e.target.value })}
                />
              </label>
              <label>
                Violation
                <select
                  value={caseForm.violation}
                  onChange={(e) => setCaseForm({ ...caseForm, violation: e.target.value })}
                >
                  {VIOLATION_TYPES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stage
                <select
                  value={caseForm.stage}
                  onChange={(e) => setCaseForm({ ...caseForm, stage: e.target.value })}
                >
                  {DISCIPLINE_STAGES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hr-center__wide">
                Summary
                <input
                  required
                  value={caseForm.summary}
                  onChange={(e) => setCaseForm({ ...caseForm, summary: e.target.value })}
                />
              </label>
              <label className="hr-center__wide">
                Evidence
                <textarea
                  rows={2}
                  value={caseForm.evidence}
                  onChange={(e) => setCaseForm({ ...caseForm, evidence: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Open case
            </button>
          </form>

          <h3>Discipline cases ({cases.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Violation</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Response</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cases.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="hr-center__empty">
                      No discipline cases.
                    </td>
                  </tr>
                ) : (
                  cases.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.violation}</td>
                      <td>{row.stage}</td>
                      <td>
                        <span className={`hr-center__pill hr-center__pill--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="hr-center__muted">{row.employee_response || "—"}</td>
                      <td className="hr-center__actions">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            run(
                              () =>
                                disciplineAction(row.id, "decide", {
                                  status: e.target.value,
                                  note: "Decision recorded in HR Management.",
                                }),
                              "Discipline decision recorded."
                            );
                          }}
                        >
                          <option value="">Record decision…</option>
                          {DISCIPLINE_STATUSES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "performance" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await assignPerformanceTask(taskForm);
                setTaskForm(EMPTY_TASK);
              }, "Objective assigned.");
            }}
          >
            <h3>Assign an objective</h3>
            <div className="hr-center__grid">
              <label>
                Employee number
                <input
                  required
                  placeholder="YAM110001LAR"
                  value={taskForm.employee_number}
                  onChange={(e) => setTaskForm({ ...taskForm, employee_number: e.target.value })}
                />
              </label>
              <label>
                Period
                <select
                  value={taskForm.period}
                  onChange={(e) => setTaskForm({ ...taskForm, period: e.target.value })}
                >
                  {TASK_PERIODS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                />
              </label>
              <label>
                Title
                <input
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Assign objective
            </button>
          </form>

          <h3>Objectives ({tasks.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Objective</th>
                  <th>Period</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Quality</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="hr-center__empty">
                      No objectives assigned.
                    </td>
                  </tr>
                ) : (
                  tasks.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.title}</td>
                      <td>{row.period}</td>
                      <td>{row.progress}%</td>
                      <td>
                        <span className={`hr-center__pill hr-center__pill--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>{row.quality_score ?? "—"}</td>
                      <td className="hr-center__actions">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () =>
                                performanceTaskAction(row.id, "update", {
                                  status: "completed",
                                  progress: 100,
                                }),
                              "Objective marked complete."
                            )
                          }
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const score = window.prompt("Quality score (1-5)", "4");
                            if (!score) return;
                            run(
                              () =>
                                performanceTaskAction(row.id, "score", {
                                  quality_score: Number(score),
                                  feedback: "Recorded by supervisor.",
                                }),
                              "Objective scored."
                            );
                          }}
                        >
                          Score
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3>Performance reviews ({reviews.length})</h3>
          <p className="hr-center__hint">
            {criteria.length} Founder/CEO evaluation criteria. All scores are human-entered —
            no productivity statistic is ever invented.
          </p>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Criteria scored</th>
                  <th>Strengths</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="hr-center__empty">
                      No performance reviews.
                    </td>
                  </tr>
                ) : (
                  reviews.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>
                        {row.period_start} → {row.period_end}
                      </td>
                      <td>{Object.keys(row.scores || {}).length}</td>
                      <td className="hr-center__muted">{row.strengths || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "training" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await assignTraining(trainingForm);
                setTrainingForm(EMPTY_TRAINING);
              }, "Training assigned.");
            }}
          >
            <h3>Assign training (HR Manager)</h3>
            <div className="hr-center__grid">
              <label>
                Employee number
                <input
                  required
                  placeholder="YAM110001LAR"
                  value={trainingForm.employee_number}
                  onChange={(e) =>
                    setTrainingForm({ ...trainingForm, employee_number: e.target.value })
                  }
                />
              </label>
              <label>
                Title
                <input
                  required
                  value={trainingForm.title}
                  onChange={(e) => setTrainingForm({ ...trainingForm, title: e.target.value })}
                />
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={trainingForm.due_date}
                  onChange={(e) => setTrainingForm({ ...trainingForm, due_date: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Assign training
            </button>
          </form>

          <h3>Training records ({training.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {training.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="hr-center__empty">
                      No training records.
                    </td>
                  </tr>
                ) : (
                  training.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.title}</td>
                      <td>{row.category}</td>
                      <td>
                        <span className={`hr-center__pill hr-center__pill--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>{row.assessment_score ?? "—"}</td>
                      <td className="hr-center__actions">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () =>
                                completeTraining(row.id, {
                                  learning_progress: "Marked complete in HR Management.",
                                }),
                              "Training completion recorded."
                            )
                          }
                        >
                          Record completion
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "recognition" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await awardRecognition(recognitionForm);
                setRecognitionForm(EMPTY_RECOGNITION);
              }, "Recognition awarded (non-monetary).");
            }}
          >
            <h3>Award recognition (HR Manager)</h3>
            <p className="hr-center__hint">
              Evidence-based and strictly non-monetary. No financial reward is created.
            </p>
            <div className="hr-center__grid">
              <label>
                Employee number
                <input
                  required
                  placeholder="YAM110001LAR"
                  value={recognitionForm.employee_number}
                  onChange={(e) =>
                    setRecognitionForm({ ...recognitionForm, employee_number: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  value={recognitionForm.category}
                  onChange={(e) =>
                    setRecognitionForm({ ...recognitionForm, category: e.target.value })
                  }
                >
                  {RECOGNITION_CATEGORIES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  required
                  value={recognitionForm.title}
                  onChange={(e) =>
                    setRecognitionForm({ ...recognitionForm, title: e.target.value })
                  }
                />
              </label>
              <label>
                Period
                <input
                  placeholder="2026-10"
                  value={recognitionForm.period}
                  onChange={(e) =>
                    setRecognitionForm({ ...recognitionForm, period: e.target.value })
                  }
                />
              </label>
              <label className="hr-center__wide">
                Evidence
                <input
                  value={recognitionForm.evidence}
                  onChange={(e) =>
                    setRecognitionForm({ ...recognitionForm, evidence: e.target.value })
                  }
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Award recognition
            </button>
          </form>

          <h3>Recognition history ({recognitions.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Category</th>
                  <th>Title</th>
                  <th>Evidence</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {recognitions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hr-center__empty">
                      No recognition awarded.
                    </td>
                  </tr>
                ) : (
                  recognitions.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.category}</td>
                      <td>{row.title}</td>
                      <td className="hr-center__muted">{row.evidence || "—"}</td>
                      <td>{row.period || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "policy" ? (
        <section className="hr-center__panel">
          <form
            className="hr-center__form"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await acknowledgePolicy({
                  policy_key: policyForm.policy_key,
                  policy_version: policyForm.policy_version,
                  auth_context: "Admin HR Management self-service acknowledgment",
                });
              }, "Policy acknowledged.");
            }}
          >
            <h3>Acknowledge a policy</h3>
            <p className="hr-center__hint">
              Recorded for the signed-in employee account and kept entirely separate from the
              Employee ID Card signature. Re-acknowledging the same version is idempotent.
            </p>
            <div className="hr-center__grid">
              <label>
                Policy key
                <input
                  required
                  placeholder="code-of-conduct"
                  value={policyForm.policy_key}
                  onChange={(e) => setPolicyForm({ ...policyForm, policy_key: e.target.value })}
                />
              </label>
              <label>
                Policy version
                <input
                  required
                  placeholder="2026.1"
                  value={policyForm.policy_version}
                  onChange={(e) => setPolicyForm({ ...policyForm, policy_version: e.target.value })}
                />
              </label>
            </div>
            <button type="submit" className="hr-center__btn">
              Acknowledge policy
            </button>
          </form>

          <h3>Acknowledgment history ({acknowledgments.length})</h3>
          <div className="hr-center__tablewrap">
            <table className="hr-center__table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Policy</th>
                  <th>Version</th>
                  <th>Acknowledged at</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {acknowledgments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hr-center__empty">
                      No policy acknowledgments.
                    </td>
                  </tr>
                ) : (
                  acknowledgments.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.employee_name}
                        <span className="hr-center__muted"> {row.employee_number}</span>
                      </td>
                      <td>{row.policy_key}</td>
                      <td>{row.policy_version}</td>
                      <td>{row.acknowledged_at}</td>
                      <td className="hr-center__muted">{row.auth_context || "—"}</td>
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

