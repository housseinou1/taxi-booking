import React, { useCallback, useEffect, useState } from "react";

import {
  assignCourse,
  bulkAssignCourse,
  completeModule,
  createCourse,
  createModule,
  createQuestion,
  exportTrainingReportCsv,
  fetchAcademyDashboard,
  fetchAcademyResults,
  fetchAdminCertificates,
  fetchAdminCourses,
  fetchAdminEnrollments,
  fetchAvailableCourses,
  fetchCertificationReport,
  fetchCourseDetail,
  fetchDepartmentProgressReport,
  fetchExpiredCertificationsReport,
  fetchLearningDashboard,
  fetchMyCertificates,
  fetchMyEnrollments,
  fetchTrainingReport,
  issueCertificate,
  safeFetch,
  startAssessment,
  submitAssessment,
  suspendCertificate,
} from "./academyApi";
import "../beta/BetaDashboard.css";
import "./AcademyCenter.css";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "learn", label: "My Learning" },
  { id: "admin", label: "Admin Portal" },
  { id: "reports", label: "Reports" },
];

const AUDIENCES = [
  "rider", "driver", "courier", "merchant", "support", "operations",
  "finance", "supervisor", "collector", "landlord", "maintenance", "executive",
];

function MetricCard({ label, value }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="academy-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function AcademyCenter() {
  const [tab, setTab] = useState("dashboard");
  const [dashboard, setDashboard] = useState(null);
  const [learningDashboard, setLearningDashboard] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [available, setAvailable] = useState([]);
  const [adminCourses, setAdminCourses] = useState([]);
  const [adminEnrollments, setAdminEnrollments] = useState([]);
  const [adminCertificates, setAdminCertificates] = useState([]);
  const [results, setResults] = useState([]);
  const [certs, setCerts] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attempt, setAttempt] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examExpiresAt, setExamExpiresAt] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const notify = (msg) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  const load = useCallback(async () => {
    try {
      setError("");
      const [learnData, myEnrollments, myCerts, availableCourses] = await Promise.all([
        fetchLearningDashboard(),
        fetchMyEnrollments(),
        fetchMyCertificates(),
        fetchAvailableCourses(),
      ]);
      setLearningDashboard(learnData);
      setEnrollments(myEnrollments);
      setCerts(myCerts);
      setAvailable(availableCourses);

      setDashboard(await safeFetch(fetchAcademyDashboard));
      setAdminCourses(await safeFetch(fetchAdminCourses, []));
      setAdminEnrollments(await safeFetch(fetchAdminEnrollments, []));
      setAdminCertificates(await safeFetch(fetchAdminCertificates, []));
      setResults(await safeFetch(fetchAcademyResults, []));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load academy data");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateCourse = async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      title: form.title.value,
      description: form.description.value,
      audience: form.audience.value,
      passing_score: parseInt(form.passing_score.value, 10),
      exam_duration_minutes: parseInt(form.exam_duration_minutes.value, 10) || 0,
      validity_months: parseInt(form.validity_months.value, 10),
      randomize_questions: form.randomize_questions.checked,
      status: form.status.value,
    };
    try {
      await createCourse(payload);
      notify("Course created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCreateModule = async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = {
      course: parseInt(form.course.value, 10),
      title: form.title.value,
      content_type: form.content_type.value,
      content: form.content.value,
      url: form.url.value,
      order: parseInt(form.order.value, 10),
    };
    try {
      await createModule(payload);
      notify("Module created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    const form = e.target;
    const options = form.options.value.split(",").map((s) => s.trim()).filter(Boolean);
    const payload = {
      course: parseInt(form.course.value, 10),
      question_type: form.question_type.value,
      text: form.text.value,
      options: options,
      correct_answer: form.correct_answer.value,
      points: parseInt(form.points.value, 10),
      order: parseInt(form.order.value, 10),
    };
    try {
      await createQuestion(payload);
      notify("Question created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await assignCourse({
        user_id: parseInt(form.user_id.value, 10),
        course_id: parseInt(form.course_id.value, 10),
        due_date: form.due_date.value || undefined,
      });
      notify("Course assigned.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleCompleteModule = async (moduleId) => {
    try {
      await completeModule(moduleId);
      notify("Module marked complete.");
      const detail = await fetchCourseDetail(selectedCourse.id);
      setSelectedCourse(detail);
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleStartAssessment = async (courseId) => {
    try {
      const data = await startAssessment(courseId);
      setAttempt(data);
      setExamQuestions(data.questions || []);
      setExamExpiresAt(data.expires_at || null);
      setAnswers({});
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const handleSubmitAssessment = async () => {
    try {
      const data = await submitAssessment(attempt.id, answers);
      setAttempt(null);
      notify(data.passed ? "You passed!" : `Score: ${data.score_pct}%`);
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  const renderDashboard = () => (
    <>
      <div className="academy-grid">
        <MetricCard label="Published Courses" value={dashboard?.total_courses} />
        <MetricCard label="Total Enrollments" value={dashboard?.total_enrollments} />
        <MetricCard label="Completion %" value={`${dashboard?.completion_pct}%`} />
        <MetricCard label="Certified Drivers" value={dashboard?.certified_drivers} />
        <MetricCard label="Certified Couriers" value={dashboard?.certified_couriers} />
        <MetricCard label="Certified Merchants" value={dashboard?.certified_merchants} />
        <MetricCard label="Expiring Soon" value={dashboard?.expiring_soon} />
        <MetricCard label="Retraining Required" value={dashboard?.employees_requiring_retraining} />
      </div>
      <Section title="Enrollments by Audience">
        <ul className="academy-list">
          {Object.entries(dashboard?.enrollments_by_audience || {}).map(([k, v]) => (
            <li key={k}>{k}: {typeof v === "object" ? `${v.completion_pct}% complete (${v.completed}/${v.enrollments})` : v}</li>
          ))}
        </ul>
      </Section>
    </>
  );

  const renderLearning = () => (
    <>
      <Section title="Learning Overview">
        <div className="academy-grid">
          <MetricCard label="Assigned" value={learningDashboard?.assigned_courses} />
          <MetricCard label="Completed" value={learningDashboard?.completed_courses} />
          <MetricCard label="Avg Progress" value={`${learningDashboard?.average_progress_pct ?? 0}%`} />
          <MetricCard label="Certificates" value={learningDashboard?.certificates_earned} />
          <MetricCard label="Overdue" value={learningDashboard?.overdue_assignments} />
        </div>
      </Section>

      <Section title="Upcoming Renewals">
        <ul className="academy-list">
          {(learningDashboard?.upcoming_renewals || []).map((r) => (
            <li key={r.id}>{r.enrollment__course__title} — expires {r.expiration_date}</li>
          ))}
        </ul>
      </Section>
      <Section title="My Enrollments">
        <table className="academy-table">
          <thead>
            <tr><th>Course</th><th>Status</th><th>Progress</th><th>Due</th></tr>
          </thead>
          <tbody>
            {enrollments.map((e) => (
              <tr key={e.id}>
                <td>{e.course_title}</td>
                <td>{e.status}</td>
                <td>{e.progress_pct}%</td>
                <td>{e.due_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="My Certificates">
        <ul className="academy-list">
          {certs.map((c) => (
            <li key={c.id}>{c.course_title} — {c.certificate_number} (expires {c.expiration_date})</li>
          ))}
        </ul>
      </Section>

      <Section title="Available Courses">
        <ul className="academy-list">
          {available.map((c) => (
            <li key={c.id}>
              <button className="academy-link" onClick={async () => setSelectedCourse(await fetchCourseDetail(c.id))}>
                {c.title} ({c.audience})
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {selectedCourse && (
        <Section title={selectedCourse.title}>
          <p>{selectedCourse.description}</p>
          <h4>Modules</h4>
          <ul className="academy-list">
            {(selectedCourse.modules || []).map((m) => (
              <li key={m.id}>
                {m.title} ({m.content_type})
                <button onClick={() => handleCompleteModule(m.id)}>Mark Complete</button>
              </li>
            ))}
          </ul>
          <h4>Assessment</h4>
          {!attempt ? (
            <button onClick={() => handleStartAssessment(selectedCourse.id)}>Start Assessment</button>
          ) : (
            <div>
              {examExpiresAt ? (
                <p className="academy-timer">Timed exam — expires {new Date(examExpiresAt).toLocaleString()}</p>
              ) : null}
              {(examQuestions.length ? examQuestions : selectedCourse.questions || []).map((q) => (
                <div key={q.id} className="academy-question">
                  <p>{q.text}</p>
                  {q.question_type === "mc" && (
                    <select onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                      <option value="">Select</option>
                      {(q.options || []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                  {q.question_type === "tf" && (
                    <select onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                      <option value="">Select</option>
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  )}
                  {q.question_type === "scenario" && (
                    <input
                      placeholder="Answer"
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <button onClick={handleSubmitAssessment}>Submit</button>
            </div>
          )}
        </Section>
      )}
    </>
  );

  const renderAdmin = () => (
    <>
      <Section title="Create Course">
        <form onSubmit={handleCreateCourse} className="academy-form">
          <input name="title" placeholder="Title" required />
          <textarea name="description" placeholder="Description" />
          <select name="audience" required>
            {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input name="passing_score" type="number" defaultValue={70} placeholder="Passing score" />
          <input name="exam_duration_minutes" type="number" defaultValue={0} placeholder="Exam minutes (0=untimed)" />
          <input name="validity_months" type="number" defaultValue={12} placeholder="Validity months" />
          <label><input name="randomize_questions" type="checkbox" defaultChecked /> Randomize questions</label>
          <select name="status">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <button type="submit">Create Course</button>
        </form>
      </Section>

      <Section title="Create Module">
        <form onSubmit={handleCreateModule} className="academy-form">
          <input name="course" type="number" placeholder="Course ID" required />
          <input name="title" placeholder="Title" required />
          <select name="content_type">
            <option value="video">Video</option>
            <option value="pdf">PDF</option>
            <option value="slides">Slides</option>
            <option value="text">Text</option>
            <option value="quiz">Quiz</option>
          </select>
          <textarea name="content" placeholder="Content" />
          <input name="url" placeholder="URL" />
          <input name="order" type="number" defaultValue={0} placeholder="Order" />
          <button type="submit">Create Module</button>
        </form>
      </Section>

      <Section title="Create Question">
        <form onSubmit={handleCreateQuestion} className="academy-form">
          <input name="course" type="number" placeholder="Course ID" required />
          <select name="question_type">
            <option value="mc">Multiple Choice</option>
            <option value="tf">True/False</option>
            <option value="scenario">Scenario</option>
          </select>
          <textarea name="text" placeholder="Question text" required />
          <input name="options" placeholder="Options (comma separated)" />
          <input name="correct_answer" placeholder="Correct answer" required />
          <input name="points" type="number" defaultValue={1} placeholder="Points" />
          <input name="order" type="number" defaultValue={0} placeholder="Order" />
          <button type="submit">Create Question</button>
        </form>
      </Section>

      <Section title="Assign Course">
        <form onSubmit={handleAssign} className="academy-form">
          <input name="user_id" type="number" placeholder="User ID" required />
          <input name="course_id" type="number" placeholder="Course ID" required />
          <input name="due_date" type="date" />
          <button type="submit">Assign</button>
        </form>
      </Section>

      <Section title="Bulk Assign by Audience">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target;
            try {
              const result = await bulkAssignCourse({
                course_id: parseInt(form.course_id.value, 10),
                due_date: form.due_date.value || undefined,
              });
              notify(`Bulk assigned to ${result.assigned_count} users.`);
              form.reset();
              load();
            } catch (err) {
              setError(err?.response?.data?.detail || err?.message);
            }
          }}
          className="academy-form"
        >
          <input name="course_id" type="number" placeholder="Course ID" required />
          <input name="due_date" type="date" />
          <button type="submit">Bulk Assign</button>
        </form>
      </Section>

      <Section title="Certificates">
        <table className="academy-table">
          <thead>
            <tr><th>User</th><th>Course</th><th>Number</th><th>Status</th><th>Expires</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {adminCertificates.map((c) => (
              <tr key={c.id}>
                <td>{c.user_name}</td>
                <td>{c.course_title}</td>
                <td>{c.certificate_number}</td>
                <td>{c.status}</td>
                <td>{c.expiration_date}</td>
                <td>
                  {c.status === "active" ? (
                    <button onClick={() => suspendCertificate(c.id).then(() => { notify("Suspended"); load(); })}>
                      Suspend
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Enrollments">
        <table className="academy-table">
          <thead>
            <tr><th>User</th><th>Course</th><th>Status</th><th>Progress</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {adminEnrollments.map((e) => (
              <tr key={e.id}>
                <td>{e.user_name}</td>
                <td>{e.course_title}</td>
                <td>{e.status}</td>
                <td>{e.progress_pct}%</td>
                <td>
                  <button onClick={() => issueCertificate(e.id).then(() => { notify("Issued"); load(); })}>Issue Cert</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Results">
        <table className="academy-table">
          <thead>
            <tr><th>Attempt</th><th>Score</th><th>Passed</th></tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.score_pct}%</td>
                <td>{r.passed ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );

  const [trainingReport, setTrainingReport] = useState(null);
  const [certReport, setCertReport] = useState(null);
  const [expiredReport, setExpiredReport] = useState(null);
  const [departmentReport, setDepartmentReport] = useState(null);

  const loadReports = async () => {
    try {
      setTrainingReport(await fetchTrainingReport());
      setCertReport(await fetchCertificationReport());
      setExpiredReport(await fetchExpiredCertificationsReport());
      setDepartmentReport(await fetchDepartmentProgressReport());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  };

  useEffect(() => {
    if (tab === "reports") {
      loadReports();
    }
  }, [tab]);

  const renderReports = () => (
    <>
      <div className="academy-form">
        <button type="button" onClick={loadReports}>Refresh Reports</button>
        <button
          type="button"
          onClick={async () => {
            const blob = await exportTrainingReportCsv();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "academy-training-report.csv";
            link.click();
            window.URL.revokeObjectURL(url);
          }}
        >
          Export Training CSV
        </button>
      </div>
      <Section title="Training Report">
        <div className="academy-grid">
          <MetricCard label="Total Enrollments" value={trainingReport?.total} />
          {trainingReport && Object.entries(trainingReport.by_status || {}).map(([k, v]) => (
            <MetricCard key={k} label={k} value={v} />
          ))}
        </div>
      </Section>
      <Section title="Certification Report">
        <div className="academy-grid">
          <MetricCard label="Total" value={certReport?.total} />
          <MetricCard label="Active" value={certReport?.active} />
          <MetricCard label="Expired" value={certReport?.expired} />
          <MetricCard label="Suspended" value={certReport?.suspended} />
        </div>
      </Section>
      <Section title="Expired Certifications">
        <MetricCard label="Expired Count" value={expiredReport?.count} />
      </Section>
      <Section title="Department Progress">
        <table className="academy-table">
          <thead>
            <tr><th>Department</th><th>Enrollments</th><th>Completed</th><th>Completion %</th><th>Active Certs</th></tr>
          </thead>
          <tbody>
            {(departmentReport?.departments || []).map((d) => (
              <tr key={d.audience_code}>
                <td>{d.department}</td>
                <td>{d.total_enrollments}</td>
                <td>{d.completed}</td>
                <td>{d.completion_pct}%</td>
                <td>{d.active_certificates}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );

  return (
    <div className="beta__container">
      <header className="beta__header">
        <div>
          <h1 className="beta__title">YALA Academy</h1>
          <p className="beta__subtitle">Training and certification management.</p>
        </div>
      </header>
      {error ? <p className="beta__error">{error}</p> : null}
      {message ? <p className="beta__success">{message}</p> : null}
      <div className="academy-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`academy-tab ${tab === item.id ? "academy-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="academy-content">
        {tab === "dashboard" && renderDashboard()}
        {tab === "learn" && renderLearning()}
        {tab === "admin" && renderAdmin()}
        {tab === "reports" && renderReports()}
      </div>
    </div>
  );
}
