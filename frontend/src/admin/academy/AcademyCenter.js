import React, { useCallback, useEffect, useMemo, useState } from "react";

import {
  assignCourse,
  bulkAssignCourse,
  completeModule,
  createCourse,
  createModule,
  createQuestion,
  deleteCourse,
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
  probeAcademyAccess,
  startAssessment,
  submitAssessment,
  suspendCertificate,
  updateCourse,
} from "./academyApi";
import {
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Pager,
  Panel,
  Pill,
  SectionHead,
  SortHeader,
  StatusPill,
  formatCount,
  formatDate,
  formatDateTime,
} from "../fleet/fleetUi";
// Shared enterprise kit (same primitives the Fleet & Vehicle pages use) so the
// Academy Center is visually identical to the rest of the Admin Dashboard.
import "../fleet/fleetUi.css";
import {
  ACADEMY_AUDIENCES,
  COURSE_STATUS,
  DASH,
  ENROLLMENT_STATUS,
  audienceDisplayFromCode,
  audienceDisplayFromLabel,
  certificateBadge,
  completionPct,
  formatPct,
  programLabel,
  rateTone,
  sumAudienceTotals,
} from "./academyUi";
import "./AcademyCenter.css";
import { AdminPageTitle } from "../layouts/AdminPageHeading";

/**
 * YALA Academy Center - training, certification and compliance management.
 *
 * Layout notes:
 *  - The page owns its header (title + description + actions). App.js passes
 *    `title=""` to AdminShellPage for this route so the shell does not render a
 *    second <h1>, and the shell's own breadcrumb is reused rather than duplicated.
 *  - All styling is token-based (--admin-*) so it works in the dark shell.
 */

const PAGE_SIZE = 10;

const TABS = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "\uD83D\uDCCA",
    purpose: "Training statistics, certification progress, enrolments and compliance.",
  },
  {
    id: "learn",
    label: "My Learning",
    icon: "\uD83C\uDF93",
    purpose: "Your assigned courses, learning progress and earned certificates.",
  },
  {
    id: "admin",
    label: "Admin Portal",
    icon: "\u2699\uFE0F",
    purpose: "Manage courses, enrolments, training programmes and certifications.",
  },
  {
    id: "reports",
    label: "Reports",
    icon: "\uD83D\uDCC8",
    purpose: "Training performance, completion, certification and compliance reporting.",
  },
];

const REPORT_PERIODS = [
  { id: "all", label: "All time", days: null },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 12 months", days: 365 },
];

/* -- Small presentational helpers ------------------------------------------- */

/** Completion meter. Renders a dash (never 0%) when the rate is undefined. */
function RateMeter({ pct }) {
  if (pct === null || pct === undefined) {
    return (
      <span className="acad-rate acad-rate--idle" title="No learners enrolled — completion rate not available">
        <span className="acad-rate__value">{DASH}</span>
      </span>
    );
  }
  const safe = Math.max(0, Math.min(100, Number(pct)));
  return (
    <span className={`acad-rate acad-rate--${rateTone(pct)}`}>
      <span className="acad-rate__bar" aria-hidden="true">
        <span className="acad-rate__fill" style={{ width: `${safe}%` }} />
      </span>
      <span className="acad-rate__value">{formatPct(pct)}</span>
    </span>
  );
}

function CourseStatusPill({ status }) {
  return <StatusPill status={status} map={COURSE_STATUS} />;
}

function EnrollmentStatusPill({ status }) {
  return <StatusPill status={status} map={ENROLLMENT_STATUS} />;
}

function CertificatePill({ certificate }) {
  const badge = certificateBadge(certificate);
  return <Pill tone={badge.tone}>{badge.label}</Pill>;
}

/** A permission/availability notice - used instead of fabricating zero values. */
function Notice({ title, hint, icon = "\uD83D\uDD12" }) {
  return <EmptyState icon={icon} title={title} hint={hint} />;
}

/* -- Enrolments by audience -------------------------------------------------- */

/**
 * Audience analytics table.
 *
 * `inProgress` and `activeCertificates` come from the department-progress report,
 * which is a report-staff endpoint. Those columns are therefore only rendered when
 * that data actually loaded - never as a column of zeros or dashes.
 */
function AudienceTable({ rows, hasDepartmentData, sort, onSort }) {
  const sorted = useMemo(() => {
    const copy = [...rows];
    const dir = sort.dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      if (sort.key === "audience") return a.label.localeCompare(b.label) * dir;
      const av = a[sort.key] ?? -1;
      const bv = b[sort.key] ?? -1;
      return (av - bv) * dir;
    });
    return copy;
  }, [rows, sort]);

  return (
    <div className="fleet-table-wrap">
      <table className="fleet-table acad-audience" aria-label="Enrolments by audience">
        <thead>
          <tr>
            <SortHeader label="Audience" sortKey="audience" sort={sort} onSort={onSort} />
            <SortHeader
              label="Enrolled"
              sortKey="enrolled"
              sort={sort}
              onSort={onSort}
              className="fleet-table__num"
            />
            <SortHeader
              label="Completed"
              sortKey="completed"
              sort={sort}
              onSort={onSort}
              className="fleet-table__num"
            />
            {hasDepartmentData ? (
              <SortHeader
                label="In progress"
                sortKey="inProgress"
                sort={sort}
                onSort={onSort}
                className="fleet-table__num"
              />
            ) : null}
            <th scope="col" className="fleet-table__num">
              Completion rate
            </th>
            {hasDepartmentData ? (
              <SortHeader
                label="Active certificates"
                sortKey="activeCertificates"
                sort={sort}
                onSort={onSort}
                className="fleet-table__num"
              />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.code} className={row.enrolled ? undefined : "acad-audience__row--empty"}>
              <td>
                <span className="acad-audience__name">{row.label}</span>
                {row.enrolled === 0 ? (
                  <span className="acad-audience__meta">No learners enrolled</span>
                ) : null}
              </td>
              <td className="fleet-table__num">{formatCount(row.enrolled)}</td>
              <td className="fleet-table__num">{formatCount(row.completed)}</td>
              {hasDepartmentData ? (
                <td className="fleet-table__num">
                  {row.inProgress === null ? DASH : formatCount(row.inProgress)}
                </td>
              ) : null}
              <td className="fleet-table__num">
                <RateMeter pct={row.rate} />
              </td>
              {hasDepartmentData ? (
                <td className="fleet-table__num">
                  {row.activeCertificates === null ? DASH : formatCount(row.activeCertificates)}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -- Course card ------------------------------------------------------------ */

/**
 * Learning course card.
 *
 * `audienceByCourseId` is a lookup built from the available/admin course lists -
 * `/my-enrollments/` does not carry the audience, so the category is only shown
 * when it can be resolved from real data rather than guessed.
 */
function CourseCard({ enrollment, audienceByCourseId, certificate, actionLabel, onAction }) {
  const audience = audienceByCourseId[enrollment.course];
  const progress = Number(enrollment.progress_pct) || 0;

  return (
    <article className="acad-course">
      <header className="acad-course__head">
        <h4 className="acad-course__title" title={enrollment.course_title}>
          {enrollment.course_title || "Untitled course"}
        </h4>
        <EnrollmentStatusPill status={enrollment.status} />
      </header>

      <dl className="acad-course__facts">
        <div>
          <dt>Category</dt>
          <dd>{audience ? audienceDisplayFromCode(audience) : DASH}</dd>
        </div>
        <div>
          <dt>Due</dt>
          <dd>{enrollment.due_date ? formatDate(enrollment.due_date) : "No due date"}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>{formatDate(enrollment.updated_at)}</dd>
        </div>
        <div>
          <dt>Certificate</dt>
          <dd>
            {certificate ? (
              <CertificatePill certificate={certificate} />
            ) : (
              <span className="acad-course__muted">Not issued</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="acad-course__progress">
        <span className="acad-course__progress-label">Progress</span>
        <RateMeter pct={progress} />
      </div>

      {onAction ? (
        <footer className="acad-course__actions">
          <button
            type="button"
            className="fleet-btn fleet-btn--sm fleet-btn--primary"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        </footer>
      ) : null}
    </article>
  );
}

/* -- Admin: course table ----------------------------------------------------- */

function CourseTable({ courses, onToggleStatus, onView, onDelete, busyId }) {
  return (
    <div className="fleet-table-wrap">
      <table className="fleet-table" aria-label="Course directory">
        <thead>
          <tr>
            <th scope="col">Course</th>
            <th scope="col">Audience</th>
            <th scope="col">Status</th>
            <th scope="col" className="fleet-table__num">
              Modules
            </th>
            <th scope="col" className="fleet-table__num">
              Questions
            </th>
            <th scope="col" className="fleet-table__num">
              Pass mark
            </th>
            <th scope="col" className="fleet-table__num">
              Valid
            </th>
            <th scope="col">
              <span className="acad-sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {courses.map((course) => (
            <tr key={course.id}>
              <td>
                <span className="acad-strong" title={course.title}>
                  {course.title}
                </span>
                {course.description ? (
                  <span className="acad-sub" title={course.description}>
                    {course.description}
                  </span>
                ) : null}
              </td>
              <td>{audienceDisplayFromCode(course.audience)}</td>
              <td>
                <CourseStatusPill status={course.status} />
              </td>
              <td className="fleet-table__num">{(course.modules || []).length}</td>
              <td className="fleet-table__num">{(course.questions || []).length}</td>
              <td className="fleet-table__num">{formatCount(course.passing_score)}</td>
              <td className="fleet-table__num">{course.validity_months} mo</td>
              <td>
                <span className="fleet-table__actions">
                  <button
                    type="button"
                    className="fleet-btn fleet-btn--sm"
                    onClick={() => onView(course.id)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="fleet-btn fleet-btn--sm"
                    disabled={busyId === course.id}
                    onClick={() => onToggleStatus(course)}
                  >
                    {course.status === "published" ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    type="button"
                    className="fleet-btn fleet-btn--sm fleet-btn--danger"
                    disabled={busyId === course.id}
                    onClick={() => onDelete(course)}
                  >
                    Delete
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


/* -- Learning section -------------------------------------------------------- */

/** One learning stage (assigned / in progress / completed) rendered as a card grid. */
function CourseSection({
  title,
  hint,
  items,
  actionLabel,
  emptyTitle,
  emptyHint,
  audienceByCourseId,
  certByEnrollmentId,
  onView,
}) {
  return (
    <section className="fleet-section">
      <SectionHead title={title} hint={hint} />
      <Panel>
        {items.length ? (
          <div className="acad-courses">
            {items.map((enrollment) => (
              <CourseCard
                key={enrollment.id}
                enrollment={enrollment}
                audienceByCourseId={audienceByCourseId}
                certificate={certByEnrollmentId[enrollment.id]}
                actionLabel={actionLabel}
                onAction={() => onView(enrollment.course)}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={"\uD83C\uDF93"} title={emptyTitle} hint={emptyHint} />
        )}
      </Panel>
    </section>
  );
}


/* -- Course detail (modules + assessment) ------------------------------------ */

/**
 * Course detail surface: modules the learner marks complete, then the assessment.
 * Reuses the existing learner endpoints only - no new backend behaviour.
 */
function CourseDetail({
  course,
  attempt,
  examQuestions,
  examExpiresAt,
  answers,
  onAnswer,
  onCompleteModule,
  onStartAssessment,
  onSubmitAssessment,
  onClose,
}) {
  const questions = examQuestions.length ? examQuestions : course.questions || [];
  const modules = course.modules || [];

  return (
    <section className="fleet-section" aria-label="Course details">
      <SectionHead
        title={course.title}
        hint={audienceDisplayFromCode(course.audience)}
        actions={
          <button type="button" className="fleet-btn fleet-btn--sm" onClick={onClose}>
            Close
          </button>
        }
      />
      <Panel
        title="Modules"
        note={
          modules.length
            ? `${modules.length} module(s). Mark each one complete as you finish it.`
            : "This course has no modules yet."
        }
      >
        {modules.length ? (
          <ol className="acad-modules">
            {modules.map((module) => (
              <li key={module.id} className="acad-module">
                <div className="acad-module__text">
                  <span className="acad-module__title">{module.title}</span>
                  <span className="acad-module__meta">
                    {module.content_type}
                    {module.duration_minutes ? ` - ${module.duration_minutes} min` : ""}
                  </span>
                  {module.content ? (
                    <span className="acad-module__content">{module.content}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="fleet-btn fleet-btn--sm"
                  onClick={() => onCompleteModule(module.id)}
                >
                  Mark Complete
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState
            icon={"\uD83D\uDCDD"}
            title="No modules yet"
            hint="Modules added by an administrator will appear here."
          />
        )}
      </Panel>

      <Panel
        title="Assessment"
        note={
          course.exam_duration_minutes
            ? `Timed - ${course.exam_duration_minutes} minutes. Pass mark ${course.passing_score}%.`
            : `Untimed. Pass mark ${course.passing_score}%.`
        }
      >
        {!attempt ? (
          <button
            type="button"
            className="fleet-btn fleet-btn--primary"
            onClick={() => onStartAssessment(course.id)}
          >
            Start Assessment
          </button>
        ) : (
          <div className="acad-exam">
            {examExpiresAt ? (
              <p className="acad-exam__timer" role="status">
                Timed exam - expires {formatDateTime(examExpiresAt)}
              </p>
            ) : null}
            {questions.map((question) => (
              <div key={question.id} className="acad-question">
                <p className="acad-question__text">{question.text}</p>
                {question.question_type === "mc" ? (
                  <select
                    className="fleet-select"
                    aria-label={`Answer for question ${question.id}`}
                    value={answers[question.id] || ""}
                    onChange={(event) => onAnswer(question.id, event.target.value)}
                  >
                    <option value="">Select an answer</option>
                    {(question.options || []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : null}
                {question.question_type === "tf" ? (
                  <select
                    className="fleet-select"
                    aria-label={`Answer for question ${question.id}`}
                    value={answers[question.id] || ""}
                    onChange={(event) => onAnswer(question.id, event.target.value)}
                  >
                    <option value="">Select an answer</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : null}
                {question.question_type === "scenario" ? (
                  <input
                    className="fleet-input"
                    aria-label={`Answer for question ${question.id}`}
                    placeholder="Your answer"
                    value={answers[question.id] || ""}
                    onChange={(event) => onAnswer(question.id, event.target.value)}
                  />
                ) : null}
              </div>
            ))}
            <button type="button" className="fleet-btn fleet-btn--primary" onClick={onSubmitAssessment}>
              Submit Assessment
            </button>
          </div>
        )}
      </Panel>
    </section>
  );
}


/* -- Main component --------------------------------------------------------- */

export default function AcademyCenter() {
  const [tab, setTab] = useState("dashboard");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Learner data (available to every authenticated user).
  const [learningDashboard, setLearningDashboard] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [certs, setCerts] = useState([]);
  const [available, setAvailable] = useState([]);

  // Capability, resolved from the API rather than guessed from the role.
  const [adminAccess, setAdminAccess] = useState("unknown");
  const [reportAccess, setReportAccess] = useState("unknown");

  // Report-staff data.
  const [dashboard, setDashboard] = useState(null);
  const [departmentReport, setDepartmentReport] = useState(null);

  // Academy-admin data.
  const [adminCourses, setAdminCourses] = useState([]);
  const [adminEnrollments, setAdminEnrollments] = useState([]);
  const [adminCertificates, setAdminCertificates] = useState([]);
  const [results, setResults] = useState([]);
  const [busyCourseId, setBusyCourseId] = useState(null);

  // Learner interaction state.
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [attempt, setAttempt] = useState(null);
  const [examQuestions, setExamQuestions] = useState([]);
  const [examExpiresAt, setExamExpiresAt] = useState(null);

  // Reports.
  const [trainingReport, setTrainingReport] = useState(null);
  const [certReport, setCertReport] = useState(null);
  const [expiredReport, setExpiredReport] = useState(null);

  // Filters / paging.
  const [audienceSort, setAudienceSort] = useState({ key: "audience", dir: "asc" });
  const [courseQuery, setCourseQuery] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState("");
  const [learnerQuery, setLearnerQuery] = useState("");
  const [learnerStatusFilter, setLearnerStatusFilter] = useState("");
  const [coursePage, setCoursePage] = useState(1);
  const [enrollmentPage, setEnrollmentPage] = useState(1);

  // Report filters (applied client-side over real fetched report rows).
  const [reportPeriod, setReportPeriod] = useState("all");
  const [reportAudience, setReportAudience] = useState("");
  const [reportCourse, setReportCourse] = useState("");
  const [reportCertStatus, setReportCertStatus] = useState("");

  const notify = useCallback((msg) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(""), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    // 1. Learner surfaces - these are the only endpoints every user may call, so a
    //    failure here is a genuine page error.
    try {
      const [learnData, myEnrollments, myCerts, availableCourses] = await Promise.all([
        fetchLearningDashboard(),
        fetchMyEnrollments(),
        fetchMyCertificates(),
        fetchAvailableCourses(),
      ]);
      setLearningDashboard(learnData);
      setEnrollments(myEnrollments || []);
      setCerts(myCerts || []);
      setAvailable(Array.isArray(availableCourses) ? availableCourses : []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load academy data");
      setLoading(false);
      return;
    }

    // 2. Capability + privileged data. Probes never throw.
    const [adminProbe, reportProbe, deptProbe] = await Promise.all([
      probeAcademyAccess(fetchAdminCourses),
      probeAcademyAccess(fetchAcademyDashboard),
      probeAcademyAccess(fetchDepartmentProgressReport),
    ]);

    setAdminAccess(adminProbe.access);
    setReportAccess(reportProbe.access);
    setDashboard(reportProbe.data);
    setDepartmentReport(deptProbe.data);

    if (adminProbe.access === "granted") {
      setAdminCourses(adminProbe.data || []);
      const [enrProbe, certProbe, resultProbe] = await Promise.all([
        probeAcademyAccess(fetchAdminEnrollments),
        probeAcademyAccess(fetchAdminCertificates),
        probeAcademyAccess(fetchAcademyResults),
      ]);
      setAdminEnrollments(enrProbe.data || []);
      setAdminCertificates(certProbe.data || []);
      setResults(resultProbe.data || []);
    } else {
      setAdminCourses([]);
      setAdminEnrollments([]);
      setAdminCertificates([]);
      setResults([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Load the four report payloads INDEPENDENTLY.
   *
   * `Promise.all` was used originally, which meant one failing report rejected the
   * whole batch and left every report null - so the Reports tab stayed stuck on its
   * loading skeleton forever. Settling each request separately lets the reports that
   * did load render, with the failure surfaced as an error banner.
   */
  const loadReports = useCallback(async () => {
    const [training, certification, expired] = await Promise.allSettled([
      fetchTrainingReport(),
      fetchCertificationReport(),
      fetchExpiredCertificationsReport(),
    ]);

    if (training.status === "fulfilled") setTrainingReport(training.value);
    if (certification.status === "fulfilled") setCertReport(certification.value);
    if (expired.status === "fulfilled") setExpiredReport(expired.value);

    const failure = [training, certification, expired].find(
      (result) => result.status === "rejected"
    );
    if (failure) {
      setError(
        failure.reason?.response?.data?.detail ||
          failure.reason?.message ||
          "Some academy reports could not be loaded"
      );
    } else {
      setError("");
    }
  }, []);

  useEffect(() => {
    if (tab === "reports") {
      loadReports();
    }
  }, [tab, loadReports]);


  /* -- Derived data --------------------------------------------------------- */

  /** Course id -> audience code. `/my-enrollments/` omits the audience, so it is
   *  resolved from the course lists instead of being guessed. */
  const audienceByCourseId = useMemo(() => {
    const map = {};
    [...available, ...adminCourses].forEach((course) => {
      if (course && course.id !== undefined) map[course.id] = course.audience;
    });
    return map;
  }, [available, adminCourses]);

  /** Enrollment id -> certificate, so a course card can show certificate availability. */
  const certByEnrollmentId = useMemo(() => {
    const map = {};
    certs.forEach((cert) => {
      map[cert.enrollment] = cert;
    });
    return map;
  }, [certs]);

  /**
   * Enrolments by audience, built from the dashboard payload (keyed by audience
   * LABEL) merged with the department-progress report (keyed by audience CODE).
   * Completion rate is recomputed locally so an empty audience yields null instead
   * of the API's misleading 0.0.
   */
  const audienceRows = useMemo(() => {
    const byAudienceLabel = dashboard?.enrollments_by_audience || {};
    const deptByCode = {};
    (departmentReport?.departments || []).forEach((dept) => {
      deptByCode[dept.audience_code] = dept;
    });

    return ACADEMY_AUDIENCES.map((audience) => {
      const apiRow = byAudienceLabel[audience.label] || {};
      const dept = deptByCode[audience.code] || null;
      const enrolled = Number(apiRow.enrollments) || 0;
      const completed = Number(apiRow.completed) || 0;
      return {
        code: audience.code,
        label: audience.display,
        enrolled,
        completed,
        inProgress: dept ? Number(dept.in_progress) || 0 : null,
        activeCertificates: dept ? Number(dept.active_certificates) || 0 : null,
        rate: completionPct(completed, enrolled),
      };
    });
  }, [dashboard, departmentReport]);

  const hasDepartmentData = Boolean(departmentReport?.departments);
  const audienceTotals = useMemo(() => sumAudienceTotals(audienceRows), [audienceRows]);

  /** Only show the audience table once somebody is actually enrolled. */
  const hasAnyEnrollment = audienceTotals.enrolled > 0;

  const filteredCourses = useMemo(() => {
    const needle = courseQuery.trim().toLowerCase();
    return adminCourses.filter((course) => {
      if (courseStatusFilter && course.status !== courseStatusFilter) return false;
      if (!needle) return true;
      return (
        String(course.title || "").toLowerCase().includes(needle) ||
        String(course.description || "").toLowerCase().includes(needle) ||
        String(course.audience || "").toLowerCase().includes(needle)
      );
    });
  }, [adminCourses, courseQuery, courseStatusFilter]);

  const filteredEnrollments = useMemo(() => {
    const needle = learnerQuery.trim().toLowerCase();
    return adminEnrollments.filter((enrollment) => {
      if (learnerStatusFilter && enrollment.status !== learnerStatusFilter) return false;
      if (!needle) return true;
      const audience = audienceByCourseId[enrollment.course];
      return (
        String(enrollment.user_name || "").toLowerCase().includes(needle) ||
        String(enrollment.course_title || "").toLowerCase().includes(needle) ||
        String(audience || "").toLowerCase().includes(needle)
      );
    });
  }, [adminEnrollments, learnerQuery, learnerStatusFilter, audienceByCourseId]);

  const coursePageCount = Math.max(1, Math.ceil(filteredCourses.length / PAGE_SIZE));
  const enrollmentPageCount = Math.max(1, Math.ceil(filteredEnrollments.length / PAGE_SIZE));
  const pagedCourses = filteredCourses.slice((coursePage - 1) * PAGE_SIZE, coursePage * PAGE_SIZE);
  const pagedEnrollments = filteredEnrollments.slice(
    (enrollmentPage - 1) * PAGE_SIZE,
    enrollmentPage * PAGE_SIZE
  );

  const learningGroups = useMemo(
    () => ({
      assigned: enrollments.filter((item) => item.status === "not_started"),
      inProgress: enrollments.filter((item) => item.status === "in_progress"),
      completed: enrollments.filter((item) => item.status === "completed"),
    }),
    [enrollments]
  );

  /** Courses grouped by audience = the training programmes shown in the Admin Portal. */
  const programs = useMemo(() => {
    const groups = {};
    adminCourses.forEach((course) => {
      const key = course.audience || "unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(course);
    });
    return Object.keys(groups)
      .map((code) => ({
        code,
        label: programLabel(code),
        courses: groups[code],
        published: groups[code].filter((course) => course.status === "published").length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [adminCourses]);


  /* -- Admin handlers ------------------------------------------------------- */

  const handleCreateCourse = async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await createCourse({
        title: form.title.value,
        description: form.description.value,
        audience: form.audience.value,
        passing_score: parseInt(form.passing_score.value, 10),
        exam_duration_minutes: parseInt(form.exam_duration_minutes.value, 10),
        validity_months: parseInt(form.validity_months.value, 10),
        randomize_questions: form.randomize_questions.checked,
        status: form.status.value,
      });
      notify("Course created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not create the course");
    }
  };

  const handleCreateModule = async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await createModule({
        course: parseInt(form.course.value, 10),
        title: form.title.value,
        content_type: form.content_type.value,
        content: form.content.value,
        url: form.url.value,
        order: parseInt(form.order.value, 10),
      });
      notify("Module created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not create the module");
    }
  };

  const handleCreateQuestion = async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await createQuestion({
        course: parseInt(form.course.value, 10),
        question_type: form.question_type.value,
        text: form.text.value,
        options: form.options.value
          ? form.options.value
              .split(",")
              .map((option) => option.trim())
              .filter(Boolean)
          : [],
        correct_answer: form.correct_answer.value,
        points: parseInt(form.points.value, 10),
        order: parseInt(form.order.value, 10),
      });
      notify("Question created.");
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not create the question");
    }
  };

  const handleAssign = async (event) => {
    event.preventDefault();
    const form = event.target;
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
      setError(err?.response?.data?.detail || err?.message || "Could not assign the course");
    }
  };

  const handleBulkAssign = async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      const result = await bulkAssignCourse({
        course_id: parseInt(form.course_id.value, 10),
        due_date: form.due_date.value || undefined,
      });
      notify(`Assigned to ${result.assigned_count} learner(s).`);
      form.reset();
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Bulk assignment failed");
    }
  };

  const handleToggleCourseStatus = async (course) => {
    setBusyCourseId(course.id);
    try {
      await updateCourse(course.id, {
        status: course.status === "published" ? "draft" : "published",
      });
      notify(course.status === "published" ? "Course unpublished." : "Course published.");
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not update the course");
    } finally {
      setBusyCourseId(null);
    }
  };

  const handleDeleteCourse = async (course) => {
    const confirmed = window.confirm(
      `Delete "${course.title}"? This also removes its modules, questions and enrolments.`
    );
    if (!confirmed) return;
    setBusyCourseId(course.id);
    try {
      await deleteCourse(course.id);
      notify("Course deleted.");
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not delete the course");
    } finally {
      setBusyCourseId(null);
    }
  };

  const handleViewCourse = async (courseId) => {
    try {
      setSelectedCourse(await fetchCourseDetail(courseId));
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not load the course");
    }
  };


  /* -- Learner handlers ----------------------------------------------------- */

  const handleCompleteModule = async (moduleId) => {
    try {
      await completeModule(moduleId);
      notify("Module marked complete.");
      if (selectedCourse) setSelectedCourse(await fetchCourseDetail(selectedCourse.id));
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not update progress");
    }
  };

  const handleStartAssessment = async (courseId) => {
    try {
      const data = await startAssessment(courseId);
      setAttempt(data);
      setExamQuestions(data?.questions || []);
      setExamExpiresAt(data?.expires_at || null);
      setAnswers({});
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not start the assessment");
    }
  };

  const handleSubmitAssessment = async () => {
    try {
      const result = await submitAssessment(attempt.id, answers);
      notify(
        result?.passed
          ? `Passed with ${result.score_pct}% - certificate issued.`
          : `Scored ${result?.score_pct ?? 0}% - retraining may be required.`
      );
      setAttempt(null);
      setExamQuestions([]);
      setExamExpiresAt(null);
      setAnswers({});
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not submit the assessment");
    }
  };

  /* -- Certificate handlers ------------------------------------------------- */

  const handleIssueCertificate = async (enrollmentId) => {
    try {
      await issueCertificate(enrollmentId);
      notify("Certificate issued.");
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not issue the certificate");
    }
  };

  const handleSuspendCertificate = async (certId) => {
    try {
      await suspendCertificate(certId);
      notify("Certificate suspended.");
      load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not suspend the certificate");
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportTrainingReportCsv();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "academy-training-report.csv";
      link.click();
      window.URL.revokeObjectURL(url);
      notify("Training report exported.");
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Export failed");
    }
  };


  /* -- Dashboard ------------------------------------------------------------ */

  const renderDashboard = () => {
    if (reportAccess === "denied") {
      return (
        <Panel title="Training analytics" note="Reporting permission required">
          <Notice
            title="Your role cannot view academy analytics"
            hint="Training statistics, certification progress and compliance reporting are restricted to report staff. Your assigned courses are always available on My Learning."
          />
        </Panel>
      );
    }

    if (reportAccess === "unknown") {
      return (
        <ErrorState
          message="Academy analytics could not be loaded. Check your connection and try again."
          onRetry={load}
        />
      );
    }

    const completion = completionPct(dashboard?.completed, dashboard?.total_enrollments);

    return (
      <>
        <section className="fleet-section">
          <SectionHead
            title="Training overview"
            hint="Every figure below comes from the Academy training and certification records."
          />
          <div className="fleet-kpis fleet-kpis--four">
            <KpiCard
              label="Published Courses"
              value={formatCount(dashboard?.total_courses)}
              unit="courses"
              sub="Courses currently published to learners"
              icon={"\uD83D\uDCDA"}
              tone="info"
            />
            <KpiCard
              label="Total Enrollments"
              value={formatCount(dashboard?.total_enrollments)}
              unit="enrolments"
              sub="All course enrolments on record"
              icon={"\uD83D\uDC65"}
              tone="info"
            />
            <KpiCard
              label="Completion Rate"
              value={formatPct(completion)}
              unit={completion === null ? undefined : "%"}
              sub={
                completion === null
                  ? "No enrolments yet — completion rate not available"
                  : `${formatCount(dashboard?.completed)} of ${formatCount(
                      dashboard?.total_enrollments
                    )} enrolments completed`
              }
              icon={"\u2705"}
              tone={rateTone(completion)}
            />
            <KpiCard
              label="Retraining Required"
              value={formatCount(dashboard?.employees_requiring_retraining)}
              unit="learners"
              sub="Failed assessments or lapsed certificates"
              icon={"\uD83D\uDD01"}
              tone="danger"
            />
            <KpiCard
              label="Certified Drivers"
              value={formatCount(dashboard?.certified_drivers)}
              unit="drivers"
              sub="Active driver certificates"
              icon={"\uD83D\uDE97"}
              tone="ok"
            />
            <KpiCard
              label="Certified Couriers"
              value={formatCount(dashboard?.certified_couriers)}
              unit="couriers"
              sub="Active courier certificates"
              icon={"\uD83D\uDCE6"}
              tone="ok"
            />
            <KpiCard
              label="Certified Merchants"
              value={formatCount(dashboard?.certified_merchants)}
              unit="merchants"
              sub="Active merchant certificates"
              icon={"\uD83C\uDFEA"}
              tone="ok"
            />
            <KpiCard
              label="Expiring Certifications"
              value={formatCount(dashboard?.expiring_soon)}
              unit="certificates"
              sub="Active certificates expiring within 30 days"
              icon={"\u23F3"}
              tone="warn"
            />
          </div>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Enrollments by audience"
            hint="Training activity for each audience the Academy supports."
          />
          {hasAnyEnrollment ? (
            <Panel
              title="Audience breakdown"
              note={
                hasDepartmentData
                  ? "In-progress and active-certificate columns come from the department progress report."
                  : "In-progress detail needs the department progress report, which your role cannot read."
              }
            >
              <AudienceTable
                rows={audienceRows}
                hasDepartmentData={hasDepartmentData}
                sort={audienceSort}
                onSort={(key) =>
                  setAudienceSort((prev) =>
                    prev.key === key
                      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
                      : { key, dir: "asc" }
                  )
                }
              />
            </Panel>
          ) : (
            <Panel title="Audience breakdown" note="No enrolment activity recorded yet">
              <EmptyState
                icon={"\uD83D\uDCCA"}
                title="No training enrolments yet"
                hint="Once learners are enrolled, per-audience completion and certification figures appear here."
              />
              <div className="acad-chips" aria-label="Supported training audiences">
                {ACADEMY_AUDIENCES.map((audience) => (
                  <span key={audience.code} className="acad-chip">
                    {audience.display}
                  </span>
                ))}
              </div>
            </Panel>
          )}
        </section>
      </>
    );
  };


  /* -- My Learning ---------------------------------------------------------- */

  const renderLearning = () => {
    const learn = learningDashboard || {};

    return (
      <>
        <section className="fleet-section">
          <SectionHead
            title="My learning overview"
            hint="Your own training activity. Nothing here is visible to other learners."
          />
          <div className="fleet-kpis fleet-kpis--four">
            <KpiCard
              label="Assigned Courses"
              value={formatCount(learn.assigned_courses)}
              unit="courses"
              sub="Assigned and not yet completed"
              icon={"\uD83D\uDCCB"}
              tone="info"
            />
            <KpiCard
              label="In Progress"
              value={formatCount(learningGroups.inProgress.length)}
              unit="courses"
              sub="Started but not finished"
              icon={"\u25B6\uFE0F"}
              tone="info"
            />
            <KpiCard
              label="Completed Courses"
              value={formatCount(learn.completed_courses)}
              unit="courses"
              sub="Successfully completed training"
              icon={"\u2705"}
              tone="ok"
            />
            <KpiCard
              label="Average Progress"
              value={formatPct(learn.average_progress_pct ?? null)}
              unit={learn.average_progress_pct === undefined ? undefined : "%"}
              sub="Mean module completion across your courses"
              icon={"\uD83D\uDCC8"}
              tone={rateTone(learn.average_progress_pct ?? null)}
            />
            <KpiCard
              label="Certificates Earned"
              value={formatCount(learn.certificates_earned)}
              unit="certificates"
              sub="Active certificates in your name"
              icon={"\uD83C\uDFC5"}
              tone="ok"
            />
            <KpiCard
              label="Overdue"
              value={formatCount(learn.overdue_assignments)}
              unit="assignments"
              sub="Past the due date and not completed"
              icon={"\u26A0\uFE0F"}
              tone={learn.overdue_assignments ? "danger" : "idle"}
            />
          </div>
        </section>

        {(learn.upcoming_renewals || []).length ? (
          <section className="fleet-section">
            <SectionHead title="Upcoming renewals" hint="Certificates expiring within 30 days." />
            <div className="fleet-table-wrap">
              <table className="fleet-table" aria-label="Upcoming certificate renewals">
                <thead>
                  <tr>
                    <th scope="col">Certificate</th>
                    <th scope="col">Course</th>
                    <th scope="col">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {(learn.upcoming_renewals || []).map((renewal) => (
                    <tr key={renewal.id}>
                      <td>{renewal.certificate_number}</td>
                      <td>{renewal.enrollment__course__title}</td>
                      <td>{formatDate(renewal.expiration_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <CourseSection
          title="Assigned courses"
          hint="Training assigned to you that you have not started."
          items={learningGroups.assigned}
          actionLabel="Start Course"
          emptyTitle="No courses waiting to be started"
          emptyHint="Everything assigned to you has been started or completed."
          audienceByCourseId={audienceByCourseId}
          certByEnrollmentId={certByEnrollmentId}
          onView={handleViewCourse}
        />
        <CourseSection
          title="In progress"
          hint="Courses you have started but not yet completed."
          items={learningGroups.inProgress}
          actionLabel="Continue Learning"
          emptyTitle="Nothing in progress"
          emptyHint="Start an assigned course and it will appear here."
          audienceByCourseId={audienceByCourseId}
          certByEnrollmentId={certByEnrollmentId}
          onView={handleViewCourse}
        />
        <CourseSection
          title="Completed courses"
          hint="Training you have successfully finished."
          items={learningGroups.completed}
          actionLabel="View Course"
          emptyTitle="No completed courses yet"
          emptyHint="Completed training is listed here with its certificate status."
          audienceByCourseId={audienceByCourseId}
          certByEnrollmentId={certByEnrollmentId}
          onView={handleViewCourse}
        />

        <section className="fleet-section">
          <SectionHead title="My certificates" hint="Certificates issued to you." />
          <Panel>
            {certs.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="My certificates">
                  <thead>
                    <tr>
                      <th scope="col">Certificate</th>
                      <th scope="col">Course</th>
                      <th scope="col">Issued</th>
                      <th scope="col">Expires</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((cert) => (
                      <tr key={cert.id}>
                        <td>
                          <span className="acad-strong">{cert.certificate_number}</span>
                        </td>
                        <td>{cert.course_title}</td>
                        <td>{formatDate(cert.issue_date)}</td>
                        <td>{formatDate(cert.expiration_date)}</td>
                        <td>
                          <CertificatePill certificate={cert} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\uD83C\uDFC5"}
                title="No certificates yet"
                hint="Pass a course assessment to earn a certificate."
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Available courses"
            hint="Published courses for your audience. Select one to open its modules and assessment."
          />
          <Panel>
            {available.length ? (
              <div className="acad-courses">
                {available.map((course) => (
                  <article key={course.id} className="acad-course">
                    <header className="acad-course__head">
                      <h4 className="acad-course__title" title={course.title}>
                        {course.title}
                      </h4>
                      <CourseStatusPill status={course.status} />
                    </header>
                    {course.description ? (
                      <p className="acad-course__desc">{course.description}</p>
                    ) : null}
                    <dl className="acad-course__facts">
                      <div>
                        <dt>Category</dt>
                        <dd>{audienceDisplayFromCode(course.audience)}</dd>
                      </div>
                      <div>
                        <dt>Pass mark</dt>
                        <dd>{formatCount(course.passing_score)}%</dd>
                      </div>
                      <div>
                        <dt>Exam</dt>
                        <dd>
                          {course.exam_duration_minutes
                            ? `${course.exam_duration_minutes} minutes`
                            : "Untimed"}
                        </dd>
                      </div>
                    </dl>
                    <footer className="acad-course__actions">
                      <button
                        type="button"
                        className="fleet-btn fleet-btn--sm fleet-btn--primary"
                        onClick={() => handleViewCourse(course.id)}
                      >
                        View Course
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={"\uD83D\uDCDA"}
                title="No published courses for you"
                hint="Courses appear here once they are published for your audience."
              />
            )}
          </Panel>
        </section>

        {selectedCourse ? (
          <CourseDetail
            course={selectedCourse}
            attempt={attempt}
            examQuestions={examQuestions}
            examExpiresAt={examExpiresAt}
            answers={answers}
            onAnswer={(questionId, value) =>
              setAnswers((prev) => ({ ...prev, [questionId]: value }))
            }
            onCompleteModule={handleCompleteModule}
            onStartAssessment={handleStartAssessment}
            onSubmitAssessment={handleSubmitAssessment}
            onClose={() => {
              setSelectedCourse(null);
              setAttempt(null);
              setExamQuestions([]);
              setExamExpiresAt(null);
              setAnswers({});
            }}
          />
        ) : null}
      </>
    );
  };


  /* -- Admin Portal --------------------------------------------------------- */

  const renderAdmin = () => {
    if (adminAccess === "denied") {
      return (
        <Panel title="Academy administration" note="Administrator permission required">
          <Notice
            title="Your role cannot manage the Academy"
            hint="Course, enrolment and certification management is restricted to Academy administrators (HR, Training Manager, Operations and Support)."
          />
        </Panel>
      );
    }

    if (adminAccess === "unknown") {
      return (
        <ErrorState
          message="Academy administration could not be loaded. Check your connection and try again."
          onRetry={load}
        />
      );
    }

    const activeCerts = adminCertificates.filter(
      (cert) => certificateBadge(cert).label === "Certified"
    ).length;
    const expiringCerts = adminCertificates.filter(
      (cert) => certificateBadge(cert).label === "Expiring soon"
    ).length;
    const expiredCerts = adminCertificates.filter(
      (cert) => certificateBadge(cert).label === "Expired"
    ).length;
    const publishedCourses = adminCourses.filter((course) => course.status === "published").length;

    return (
      <>
        <section className="fleet-section">
          <SectionHead
            title="Academy administration"
            hint="Course, enrolment, programme and certification management."
          />
          <div className="fleet-kpis fleet-kpis--four">
            <KpiCard
              label="Courses"
              value={formatCount(adminCourses.length)}
              unit="courses"
              sub={`${publishedCourses} published`}
              icon={"\uD83D\uDCDA"}
              tone="info"
            />
            <KpiCard
              label="Enrollments"
              value={formatCount(adminEnrollments.length)}
              unit="enrolments"
              sub="All learner enrolments"
              icon={"\uD83D\uDC65"}
              tone="info"
            />
            <KpiCard
              label="Certificates"
              value={formatCount(adminCertificates.length)}
              unit="certificates"
              sub={`${activeCerts} currently certified`}
              icon={"\uD83C\uDFC5"}
              tone="ok"
            />
            <KpiCard
              label="Certification risk"
              value={formatCount(expiringCerts + expiredCerts)}
              unit="certificates"
              sub={`${expiringCerts} expiring soon, ${expiredCerts} expired`}
              icon={"\u26A0\uFE0F"}
              tone={expiringCerts + expiredCerts ? "warn" : "idle"}
            />
          </div>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Course management"
            hint="Create courses, publish or unpublish them, inspect their content and remove them."
          />
          <Panel title="Create a course" note="New courses start in the status you choose below.">
            <form onSubmit={handleCreateCourse} className="acad-form">
              <label className="acad-field acad-field--wide">
                <span>Title</span>
                <input name="title" className="fleet-input" required />
              </label>
              <label className="acad-field acad-field--wide">
                <span>Description</span>
                <textarea name="description" className="fleet-textarea" rows={2} />
              </label>
              <label className="acad-field">
                <span>Audience</span>
                <select name="audience" className="fleet-select" required>
                  {ACADEMY_AUDIENCES.map((audience) => (
                    <option key={audience.code} value={audience.code}>
                      {audience.display}
                    </option>
                  ))}
                </select>
              </label>
              <label className="acad-field">
                <span>Passing score (%)</span>
                <input
                  name="passing_score"
                  type="number"
                  className="fleet-input"
                  defaultValue={70}
                />
              </label>
              <label className="acad-field">
                <span>Exam minutes (0 = untimed)</span>
                <input
                  name="exam_duration_minutes"
                  type="number"
                  className="fleet-input"
                  defaultValue={0}
                />
              </label>
              <label className="acad-field">
                <span>Validity (months)</span>
                <input
                  name="validity_months"
                  type="number"
                  className="fleet-input"
                  defaultValue={12}
                />
              </label>
              <label className="acad-field">
                <span>Status</span>
                <select name="status" className="fleet-select">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
              <label className="acad-field acad-field--check">
                <input name="randomize_questions" type="checkbox" defaultChecked />
                <span>Randomise questions</span>
              </label>
              <div className="acad-field acad-field--action">
                <button type="submit" className="fleet-btn fleet-btn--primary">
                  Create Course
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Course directory"
            note={`${filteredCourses.length} of ${adminCourses.length} courses`}
          >
            <div className="fleet-toolbar">
              <label className="fleet-field fleet-field--grow">
                <span className="fleet-field__label">Search courses</span>
                <input
                  className="fleet-input"
                  type="search"
                  value={courseQuery}
                  placeholder="Title, description or audience"
                  aria-label="Search courses by title, description or audience"
                  onChange={(event) => {
                    setCourseQuery(event.target.value);
                    setCoursePage(1);
                  }}
                />
              </label>
              <label className="fleet-field">
                <span className="fleet-field__label">Status</span>
                <select
                  className="fleet-select"
                  value={courseStatusFilter}
                  aria-label="Filter courses by status"
                  onChange={(event) => {
                    setCourseStatusFilter(event.target.value);
                    setCoursePage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <button
                type="button"
                className="fleet-btn fleet-btn--sm"
                disabled={!courseQuery && !courseStatusFilter}
                onClick={() => {
                  setCourseQuery("");
                  setCourseStatusFilter("");
                  setCoursePage(1);
                }}
              >
                Reset filters
              </button>
            </div>

            {pagedCourses.length ? (
              <>
                <CourseTable
                  courses={pagedCourses}
                  busyId={busyCourseId}
                  onView={handleViewCourse}
                  onToggleStatus={handleToggleCourseStatus}
                  onDelete={handleDeleteCourse}
                />
                <Pager
                  page={coursePage}
                  pageCount={coursePageCount}
                  total={filteredCourses.length}
                  pageSize={PAGE_SIZE}
                  onPage={setCoursePage}
                />
              </>
            ) : (
              <EmptyState
                icon={"\uD83D\uDCDA"}
                title={adminCourses.length ? "No courses match these filters" : "No courses yet"}
                hint={
                  adminCourses.length
                    ? "Adjust the search or status filter to see more courses."
                    : "Create the first course with the form above."
                }
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Enrollment management"
            hint="Who is enrolled on what, their progress, and certificate issuance."
          />
          <Panel
            title="Learner enrollments"
            note={`${filteredEnrollments.length} of ${adminEnrollments.length} enrolments`}
          >
            <div className="fleet-toolbar">
              <label className="fleet-field fleet-field--grow">
                <span className="fleet-field__label">Search learners</span>
                <input
                  className="fleet-input"
                  type="search"
                  value={learnerQuery}
                  placeholder="Learner name, course or audience"
                  aria-label="Search learners by name, course or audience"
                  onChange={(event) => {
                    setLearnerQuery(event.target.value);
                    setEnrollmentPage(1);
                  }}
                />
              </label>
              <label className="fleet-field">
                <span className="fleet-field__label">Enrollment status</span>
                <select
                  className="fleet-select"
                  value={learnerStatusFilter}
                  aria-label="Filter enrollments by status"
                  onChange={(event) => {
                    setLearnerStatusFilter(event.target.value);
                    setEnrollmentPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  <option value="not_started">Pending</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Retraining required</option>
                </select>
              </label>
              <button
                type="button"
                className="fleet-btn fleet-btn--sm"
                disabled={!learnerQuery && !learnerStatusFilter}
                onClick={() => {
                  setLearnerQuery("");
                  setLearnerStatusFilter("");
                  setEnrollmentPage(1);
                }}
              >
                Reset filters
              </button>
            </div>

            {pagedEnrollments.length ? (
              <>
                <div className="fleet-table-wrap">
                  <table className="fleet-table" aria-label="Learner enrollments">
                    <thead>
                      <tr>
                        <th scope="col">Learner</th>
                        <th scope="col">Audience</th>
                        <th scope="col">Course</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="fleet-table__num">
                          Progress
                        </th>
                        <th scope="col">Due</th>
                        <th scope="col">
                          <span className="acad-sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedEnrollments.map((enrollment) => (
                        <tr key={enrollment.id}>
                          <td>
                            <span className="acad-strong" title={enrollment.user_name}>
                              {enrollment.user_name || `User ${enrollment.user}`}
                            </span>
                          </td>
                          <td>{audienceDisplayFromCode(audienceByCourseId[enrollment.course])}</td>
                          <td>{enrollment.course_title}</td>
                          <td>
                            <EnrollmentStatusPill status={enrollment.status} />
                          </td>
                          <td className="fleet-table__num">
                            <RateMeter pct={Number(enrollment.progress_pct) || 0} />
                          </td>
                          <td>{enrollment.due_date ? formatDate(enrollment.due_date) : DASH}</td>
                          <td>
                            <span className="fleet-table__actions">
                              <button
                                type="button"
                                className="fleet-btn fleet-btn--sm"
                                disabled={enrollment.status !== "completed"}
                                title={
                                  enrollment.status === "completed"
                                    ? "Issue the certificate for this enrollment"
                                    : "Only completed enrolments can be certified"
                                }
                                onClick={() => handleIssueCertificate(enrollment.id)}
                              >
                                Issue Certificate
                              </button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={enrollmentPage}
                  pageCount={enrollmentPageCount}
                  total={filteredEnrollments.length}
                  pageSize={PAGE_SIZE}
                  onPage={setEnrollmentPage}
                />
              </>
            ) : (
              <EmptyState
                icon={"\uD83D\uDC65"}
                title={
                  adminEnrollments.length ? "No enrolments match these filters" : "No enrolments yet"
                }
                hint={
                  adminEnrollments.length
                    ? "Adjust the search or status filter to see more enrolments."
                    : "Assign a course to a learner to create the first enrolment."
                }
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Certification management"
            hint="Issued certificates, their status and the learners who need retraining."
          />
          <Panel
            title="Certificates"
            note={`${activeCerts} certified, ${expiringCerts} expiring soon, ${expiredCerts} expired`}
          >
            {adminCertificates.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Issued certificates">
                  <thead>
                    <tr>
                      <th scope="col">Certificate</th>
                      <th scope="col">Learner</th>
                      <th scope="col">Course completed</th>
                      <th scope="col">Issued</th>
                      <th scope="col">Expires</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="acad-sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminCertificates.map((cert) => (
                      <tr key={cert.id}>
                        <td>
                          <span className="acad-strong">{cert.certificate_number}</span>
                        </td>
                        <td>{cert.user_name}</td>
                        <td>{cert.course_title}</td>
                        <td>{formatDate(cert.issue_date)}</td>
                        <td>{formatDate(cert.expiration_date)}</td>
                        <td>
                          <CertificatePill certificate={cert} />
                        </td>
                        <td>
                          <span className="fleet-table__actions">
                            <button
                              type="button"
                              className="fleet-btn fleet-btn--sm fleet-btn--danger"
                              disabled={cert.status !== "active"}
                              title={
                                cert.status === "active"
                                  ? "Suspend this certificate"
                                  : "Only active certificates can be suspended"
                              }
                              onClick={() => handleSuspendCertificate(cert.id)}
                            >
                              Suspend
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\uD83C\uDFC5"}
                title="No certificates issued"
                hint="Certificates are created automatically when a learner passes a course assessment."
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Training programs"
            hint="Courses grouped by the audience they are written for. Programs are the course audiences - the Academy has no separate programme entity."
          />
          {programs.length ? (
            <div className="acad-programs">
              {programs.map((program) => (
                <article key={program.code} className="acad-program">
                  <header className="acad-program__head">
                    <h4 className="acad-program__title">{program.label}</h4>
                    <Pill tone={program.published ? "ok" : "idle"}>
                      {program.published} published
                    </Pill>
                  </header>
                  <ul className="acad-program__list">
                    {program.courses.map((course) => (
                      <li key={course.id}>
                        <span className="acad-program__course" title={course.title}>
                          {course.title}
                        </span>
                        <CourseStatusPill status={course.status} />
                      </li>
                    ))}
                  </ul>
                  <footer className="acad-program__foot">
                    {program.courses.length} course(s)
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon={"\uD83C\uDF93"}
                title="No training programs yet"
                hint="Programmes appear once courses are created for an audience."
              />
            </Panel>
          )}
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Course content"
            hint="Add modules and assessment questions to an existing course by its ID."
          />
          <Panel title="Create a module" note="Modules are ordered within their course.">
            <form onSubmit={handleCreateModule} className="acad-form">
              <label className="acad-field">
                <span>Course ID</span>
                <input name="course" type="number" className="fleet-input" required />
              </label>
              <label className="acad-field acad-field--wide">
                <span>Title</span>
                <input name="title" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Content type</span>
                <select name="content_type" className="fleet-select">
                  <option value="video">Video</option>
                  <option value="pdf">PDF</option>
                  <option value="slides">Slides</option>
                  <option value="text">Text</option>
                  <option value="quiz">Quiz</option>
                </select>
              </label>
              <label className="acad-field">
                <span>Order</span>
                <input name="order" type="number" className="fleet-input" defaultValue={0} />
              </label>
              <label className="acad-field acad-field--wide">
                <span>Content</span>
                <textarea name="content" className="fleet-textarea" rows={2} />
              </label>
              <label className="acad-field acad-field--wide">
                <span>URL</span>
                <input name="url" className="fleet-input" />
              </label>
              <div className="acad-field acad-field--action">
                <button type="submit" className="fleet-btn fleet-btn--primary">
                  Create Module
                </button>
              </div>
            </form>
          </Panel>

          <Panel title="Create a question" note="Questions feed the course assessment.">
            <form onSubmit={handleCreateQuestion} className="acad-form">
              <label className="acad-field">
                <span>Course ID</span>
                <input name="course" type="number" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Question type</span>
                <select name="question_type" className="fleet-select">
                  <option value="mc">Multiple Choice</option>
                  <option value="tf">True/False</option>
                  <option value="scenario">Scenario</option>
                </select>
              </label>
              <label className="acad-field acad-field--wide">
                <span>Question text</span>
                <textarea name="text" className="fleet-textarea" rows={2} required />
              </label>
              <label className="acad-field acad-field--wide">
                <span>Options (comma separated)</span>
                <input name="options" className="fleet-input" />
              </label>
              <label className="acad-field">
                <span>Correct answer</span>
                <input name="correct_answer" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Points</span>
                <input name="points" type="number" className="fleet-input" defaultValue={1} />
              </label>
              <label className="acad-field">
                <span>Order</span>
                <input name="order" type="number" className="fleet-input" defaultValue={0} />
              </label>
              <div className="acad-field acad-field--action">
                <button type="submit" className="fleet-btn fleet-btn--primary">
                  Create Question
                </button>
              </div>
            </form>
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Enrollment assignment"
            hint="Assign a course to one learner, or to every learner in the course audience."
          />
          <Panel title="Assign to a learner" note="Assigning an existing enrolment is a no-op.">
            <form onSubmit={handleAssign} className="acad-form">
              <label className="acad-field">
                <span>User ID</span>
                <input name="user_id" type="number" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Course ID</span>
                <input name="course_id" type="number" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Due date</span>
                <input name="due_date" type="date" className="fleet-input" />
              </label>
              <div className="acad-field acad-field--action">
                <button type="submit" className="fleet-btn fleet-btn--primary">
                  Assign
                </button>
              </div>
            </form>
          </Panel>

          <Panel
            title="Bulk assign by audience"
            note="Assigns the course to every active user in that course's audience."
          >
            <form onSubmit={handleBulkAssign} className="acad-form">
              <label className="acad-field">
                <span>Course ID</span>
                <input name="course_id" type="number" className="fleet-input" required />
              </label>
              <label className="acad-field">
                <span>Due date</span>
                <input name="due_date" type="date" className="fleet-input" />
              </label>
              <div className="acad-field acad-field--action">
                <button type="submit" className="fleet-btn fleet-btn--primary">
                  Bulk Assign
                </button>
              </div>
            </form>
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Assessment results"
            hint="Every assessment attempt recorded, with its score and outcome."
          />
          <Panel title="Attempts" note={`${results.length} attempt(s) recorded`}>
            {results.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Assessment results">
                  <thead>
                    <tr>
                      <th scope="col" className="fleet-table__num">
                        Attempt
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Score
                      </th>
                      <th scope="col">Outcome</th>
                      <th scope="col">Started</th>
                      <th scope="col">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result) => (
                      <tr key={result.id}>
                        <td className="fleet-table__num">{result.id}</td>
                        <td className="fleet-table__num">
                          {result.score_pct === null || result.score_pct === undefined
                            ? DASH
                            : `${result.score_pct}%`}
                        </td>
                        <td>
                          <Pill tone={result.passed ? "ok" : "danger"}>
                            {result.passed ? "Passed" : "Not passed"}
                          </Pill>
                        </td>
                        <td>{formatDateTime(result.started_at)}</td>
                        <td>{result.completed_at ? formatDateTime(result.completed_at) : DASH}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\uD83D\uDCDD"}
                title="No assessment attempts yet"
                hint="Attempts appear here once learners start an assessment."
              />
            )}
          </Panel>
        </section>

        {/* The "View" action in the course directory opens the same detail surface
            the learner sees (modules + assessment), so it must render here too. */}
        {selectedCourse ? (
          <CourseDetail
            course={selectedCourse}
            attempt={attempt}
            examQuestions={examQuestions}
            examExpiresAt={examExpiresAt}
            answers={answers}
            onAnswer={(questionId, value) =>
              setAnswers((prev) => ({ ...prev, [questionId]: value }))
            }
            onCompleteModule={handleCompleteModule}
            onStartAssessment={handleStartAssessment}
            onSubmitAssessment={handleSubmitAssessment}
            onClose={() => {
              setSelectedCourse(null);
              setAttempt(null);
              setExamQuestions([]);
              setExamExpiresAt(null);
              setAnswers({});
            }}
          />
        ) : null}
      </>
    );
  };


  /* -- Reports -------------------------------------------------------------- */

  /** Course options for the report filter, derived from the report payload itself
   *  so the filter works for report staff who are not academy administrators. */
  const reportCourseOptions = useMemo(() => {
    const seen = {};
    (trainingReport?.details || []).forEach((row) => {
      if (row.course !== undefined && !seen[row.course]) {
        seen[row.course] = row.course_title || `Course ${row.course}`;
      }
    });
    return Object.keys(seen).map((id) => ({ id, title: seen[id] }));
  }, [trainingReport]);

  const periodStart = useMemo(() => {
    const days = REPORT_PERIODS.find((period) => period.id === reportPeriod)?.days;
    if (!days) return null;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return start;
  }, [reportPeriod]);

  const reportFiltersActive = Boolean(
    periodStart || reportAudience || reportCourse || reportCertStatus
  );

  /** Enrolment rows, filtered by period / audience / course. */
  const reportEnrollments = useMemo(() => {
    return (trainingReport?.details || []).filter((row) => {
      if (reportCourse && String(row.course) !== String(reportCourse)) return false;
      if (reportAudience && audienceByCourseId[row.course] !== reportAudience) return false;
      if (periodStart) {
        const stamp = row.completed_at || row.updated_at;
        if (!stamp || new Date(stamp) < periodStart) return false;
      }
      return true;
    });
  }, [trainingReport, reportCourse, reportAudience, periodStart, audienceByCourseId]);

  /** Certificate rows, filtered by period / audience / course / certification status. */
  const reportCertificates = useMemo(() => {
    const selectedTitle = reportCourse
      ? reportCourseOptions.find((option) => String(option.id) === String(reportCourse))?.title
      : null;
    const audienceTitles = reportAudience
      ? adminCourses.filter((c) => c.audience === reportAudience).map((c) => c.title)
      : null;

    return (certReport?.certificates || []).filter((cert) => {
      if (selectedTitle && cert.course_title !== selectedTitle) return false;
      if (audienceTitles && !audienceTitles.includes(cert.course_title)) return false;
      if (reportCertStatus && certificateBadge(cert).label !== reportCertStatus) return false;
      if (periodStart && new Date(cert.issue_date) < periodStart) return false;
      return true;
    });
  }, [
    certReport,
    reportCourse,
    reportCourseOptions,
    reportAudience,
    reportCertStatus,
    periodStart,
    adminCourses,
  ]);

  /** Department rows, filtered by audience. */
  const reportDepartments = useMemo(() => {
    const rows = departmentReport?.departments || [];
    if (!reportAudience) return rows;
    return rows.filter((row) => row.audience_code === reportAudience);
  }, [departmentReport, reportAudience]);

  /** Course performance, derived from the (already filtered) enrolment rows. */
  const coursePerformance = useMemo(() => {
    const groups = {};
    reportEnrollments.forEach((row) => {
      const key = row.course;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          title: row.course_title || `Course ${key}`,
          enrolled: 0,
          completed: 0,
          inProgress: 0,
          failed: 0,
          progressSum: 0,
        };
      }
      const group = groups[key];
      group.enrolled += 1;
      group.progressSum += Number(row.progress_pct) || 0;
      if (row.status === "completed") group.completed += 1;
      else if (row.status === "in_progress") group.inProgress += 1;
      else if (row.status === "failed") group.failed += 1;
    });

    return Object.values(groups)
      .map((group) => ({
        ...group,
        rate: completionPct(group.completed, group.enrolled),
        averageProgress: group.enrolled
          ? Math.round((group.progressSum / group.enrolled) * 10) / 10
          : null,
      }))
      .sort((a, b) => b.enrolled - a.enrolled);
  }, [reportEnrollments]);

  /** Learners needing retraining: failed enrolments plus lapsed/suspended certificates. */
  const retrainingRows = useMemo(() => {
    const failed = reportEnrollments
      .filter((row) => row.status === "failed")
      .map((row) => ({
        id: `enr-${row.id}`,
        learner: row.user_name || `User ${row.user}`,
        course: row.course_title,
        reason: "Assessment not passed",
        tone: "danger",
      }));

    const lapsed = reportCertificates
      .filter((cert) => ["Expired", "Suspended"].includes(certificateBadge(cert).label))
      .map((cert) => ({
        id: `cert-${cert.id}`,
        learner: cert.user_name,
        course: cert.course_title,
        reason:
          certificateBadge(cert).label === "Expired"
            ? "Certification expired"
            : "Certification suspended",
        tone: certificateBadge(cert).tone,
      }));

    return [...failed, ...lapsed];
  }, [reportEnrollments, reportCertificates]);

  const certStatusCounts = useMemo(() => {
    const counts = { Certified: 0, "Expiring soon": 0, Expired: 0, Suspended: 0 };
    reportCertificates.forEach((cert) => {
      const label = certificateBadge(cert).label;
      if (counts[label] !== undefined) counts[label] += 1;
    });
    return counts;
  }, [reportCertificates]);

  /** Completion rate over the filtered enrolments; null (not 0%) when none match. */
  const completionRate = useMemo(
    () =>
      completionPct(
        reportEnrollments.filter((row) => row.status === "completed").length,
        reportEnrollments.length
      ),
    [reportEnrollments]
  );

  /**
   * The dedicated expired-certifications report filters purely on expiration_date,
   * so it also surfaces certificates whose stored status is still `active` but whose
   * date has passed (the backend expiry task may not have run yet). That makes it
   * genuinely different from `certReport.expired`, which filters on stored status.
   */
  const expiredCertificates = useMemo(() => {
    const rows = expiredReport?.certificates || [];
    const selectedTitle = reportCourse
      ? reportCourseOptions.find((option) => String(option.id) === String(reportCourse))?.title
      : null;
    return rows.filter((cert) => {
      if (selectedTitle && cert.course_title !== selectedTitle) return false;
      return true;
    });
  }, [expiredReport, reportCourse, reportCourseOptions]);


  const renderReports = () => {
    if (reportAccess === "denied") {
      return (
        <Panel title="Academy reports" note="Reporting permission required">
          <Notice
            title="Your role cannot view academy reports"
            hint="Training, certification and compliance reporting is restricted to report staff."
          />
        </Panel>
      );
    }

    if (reportAccess === "unknown") {
      return (
        <ErrorState
          message="Academy reports could not be loaded. Check your connection and try again."
          onRetry={load}
        />
      );
    }

    return (
      <>
        <section className="fleet-section">
          <SectionHead
            title="Academy reporting"
            hint="Filters apply to the rows below. Export always covers the full training report."
            actions={
              <>
                <button type="button" className="fleet-btn fleet-btn--sm" onClick={loadReports}>
                  Refresh Reports
                </button>
                <button
                  type="button"
                  className="fleet-btn fleet-btn--sm fleet-btn--primary"
                  onClick={handleExport}
                >
                  Export Training CSV
                </button>
              </>
            }
          />
          <Panel title="Filters" note={reportFiltersActive ? "Filters active" : "No filters applied"}>
            <div className="fleet-toolbar">
              <label className="fleet-field">
                <span className="fleet-field__label">Date range</span>
                <select
                  className="fleet-select"
                  value={reportPeriod}
                  aria-label="Filter reports by date range"
                  onChange={(event) => setReportPeriod(event.target.value)}
                >
                  {REPORT_PERIODS.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fleet-field">
                <span className="fleet-field__label">Audience</span>
                <select
                  className="fleet-select"
                  value={reportAudience}
                  aria-label="Filter reports by audience"
                  onChange={(event) => setReportAudience(event.target.value)}
                >
                  <option value="">All audiences</option>
                  {ACADEMY_AUDIENCES.map((audience) => (
                    <option key={audience.code} value={audience.code}>
                      {audience.display}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fleet-field">
                <span className="fleet-field__label">Course</span>
                <select
                  className="fleet-select"
                  value={reportCourse}
                  aria-label="Filter reports by course"
                  onChange={(event) => setReportCourse(event.target.value)}
                >
                  <option value="">All courses</option>
                  {reportCourseOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="fleet-field">
                <span className="fleet-field__label">Certification status</span>
                <select
                  className="fleet-select"
                  value={reportCertStatus}
                  aria-label="Filter reports by certification status"
                  onChange={(event) => setReportCertStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="Certified">Certified</option>
                  <option value="Expiring soon">Expiring soon</option>
                  <option value="Expired">Expired</option>
                  <option value="Suspended">Suspended</option>
                </select>
              </label>
              <button
                type="button"
                className="fleet-btn fleet-btn--sm"
                disabled={!reportFiltersActive}
                onClick={() => {
                  setReportPeriod("all");
                  setReportAudience("");
                  setReportCourse("");
                  setReportCertStatus("");
                }}
              >
                Reset filters
              </button>
            </div>
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Training overview"
            hint="Enrolment and completion statistics for the filtered rows."
          />
          <div className="fleet-kpis fleet-kpis--four">
            <KpiCard
              label="Enrollments"
              value={formatCount(reportEnrollments.length)}
              unit="enrolments"
              sub="Matching the current filters"
              icon={"\uD83D\uDC65"}
              tone="info"
            />
            <KpiCard
              label="Completed"
              value={formatCount(
                reportEnrollments.filter((row) => row.status === "completed").length
              )}
              unit="enrolments"
              sub="Finished training"
              icon={"\u2705"}
              tone="ok"
            />
            <KpiCard
              label="In Progress"
              value={formatCount(
                reportEnrollments.filter((row) => row.status === "in_progress").length
              )}
              unit="enrolments"
              sub="Currently being studied"
              icon={"\u25B6\uFE0F"}
              tone="info"
            />
            <KpiCard
              label="Completion Rate"
              value={formatPct(completionRate)}
              unit={completionRate === null ? undefined : "%"}
              sub={
                completionRate === null
                  ? "No matching enrolments — completion rate not available"
                  : "Completed share of the filtered enrolments"
              }
              icon={"\uD83D\uDCC8"}
              tone={rateTone(completionRate)}
            />
          </div>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Audience performance"
            hint="Training progress by learner category, from the department progress report."
          />
          <Panel
            title="Department progress"
            note={
              reportDepartments.length
                ? `${reportDepartments.length} audience(s)`
                : "No department rows available"
            }
          >
            {reportDepartments.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Audience performance">
                  <thead>
                    <tr>
                      <th scope="col">Audience</th>
                      <th scope="col" className="fleet-table__num">
                        Enrolled
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Completed
                      </th>
                      <th scope="col" className="fleet-table__num">
                        In progress
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Failed
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Avg progress
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Completion rate
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Active certificates
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportDepartments.map((row) => (
                      <tr key={row.audience_code}>
                        <td>{audienceDisplayFromLabel(row.department)}</td>
                        <td className="fleet-table__num">{formatCount(row.total_enrollments)}</td>
                        <td className="fleet-table__num">{formatCount(row.completed)}</td>
                        <td className="fleet-table__num">{formatCount(row.in_progress)}</td>
                        <td className="fleet-table__num">{formatCount(row.failed)}</td>
                        <td className="fleet-table__num">
                          {formatPct(row.average_progress_pct)}
                        </td>
                        <td className="fleet-table__num">
                          <RateMeter pct={completionPct(row.completed, row.total_enrollments)} />
                        </td>
                        <td className="fleet-table__num">{formatCount(row.active_certificates)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\uD83D\uDCCA"}
                title="No audience performance rows"
                hint="Department progress appears once learners are enrolled."
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Certification status"
            hint="Active, expiring and expired certificates across the filtered rows."
          />
          <div className="fleet-kpis fleet-kpis--four">
            <KpiCard
              label="Certified"
              value={formatCount(certStatusCounts.Certified)}
              unit="certificates"
              sub="Valid and outside the renewal window"
              icon={"\uD83C\uDFC5"}
              tone="ok"
            />
            <KpiCard
              label="Expiring Soon"
              value={formatCount(certStatusCounts["Expiring soon"])}
              unit="certificates"
              sub="Due to lapse within 30 days"
              icon={"\u23F3"}
              tone="warn"
            />
            <KpiCard
              label="Expired"
              value={formatCount(certStatusCounts.Expired)}
              unit="certificates"
              sub="Past their expiration date"
              icon={"\u274C"}
              tone="danger"
            />
            <KpiCard
              label="Suspended"
              value={formatCount(certStatusCounts.Suspended)}
              unit="certificates"
              sub="Withdrawn by an administrator"
              icon={"\u26D4"}
              tone="warn"
            />
          </div>

          <Panel
            title="Expired certifications report"
            note={`${expiredCertificates.length} certificate(s) past their expiration date`}
          >
            {expiredCertificates.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Expired certifications">
                  <thead>
                    <tr>
                      <th scope="col">Certificate</th>
                      <th scope="col">Learner</th>
                      <th scope="col">Course</th>
                      <th scope="col">Expired on</th>
                      <th scope="col">Recorded status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiredCertificates.map((cert) => (
                      <tr key={cert.id}>
                        <td>
                          <span className="acad-strong">{cert.certificate_number}</span>
                        </td>
                        <td>{cert.user_name}</td>
                        <td>{cert.course_title}</td>
                        <td>{formatDate(cert.expiration_date)}</td>
                        <td>
                          <CertificatePill certificate={cert} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\u2705"}
                title="No expired certifications"
                hint="No certificate has passed its expiration date."
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Retraining monitoring"
            hint="Learners whose assessment was not passed, or whose certification has lapsed."
          />
          <Panel title="Learners requiring retraining" note={`${retrainingRows.length} learner(s)`}>
            {retrainingRows.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Retraining requirements">
                  <thead>
                    <tr>
                      <th scope="col">Learner</th>
                      <th scope="col">Course</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retrainingRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="acad-strong" title={row.learner}>
                            {row.learner}
                          </span>
                        </td>
                        <td>{row.course}</td>
                        <td>
                          <Pill tone={row.tone}>{row.reason}</Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\u2705"}
                title="No retraining required"
                hint="No failed assessments or lapsed certifications match the current filters."
              />
            )}
          </Panel>
        </section>

        <section className="fleet-section">
          <SectionHead
            title="Course performance"
            hint="Completion statistics per course, derived from the filtered enrolment rows."
          />
          <Panel title="Per-course completion" note={`${coursePerformance.length} course(s)`}>
            {coursePerformance.length ? (
              <div className="fleet-table-wrap">
                <table className="fleet-table" aria-label="Course performance">
                  <thead>
                    <tr>
                      <th scope="col">Course</th>
                      <th scope="col" className="fleet-table__num">
                        Enrolled
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Completed
                      </th>
                      <th scope="col" className="fleet-table__num">
                        In progress
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Failed
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Avg progress
                      </th>
                      <th scope="col" className="fleet-table__num">
                        Completion rate
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {coursePerformance.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="acad-strong" title={row.title}>
                            {row.title}
                          </span>
                        </td>
                        <td className="fleet-table__num">{formatCount(row.enrolled)}</td>
                        <td className="fleet-table__num">{formatCount(row.completed)}</td>
                        <td className="fleet-table__num">{formatCount(row.inProgress)}</td>
                        <td className="fleet-table__num">{formatCount(row.failed)}</td>
                        <td className="fleet-table__num">{formatPct(row.averageProgress)}</td>
                        <td className="fleet-table__num">
                          <RateMeter pct={row.rate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={"\uD83D\uDCDA"}
                title="No course performance data"
                hint="Completion statistics appear once learners are enrolled on courses."
              />
            )}
          </Panel>
        </section>
      </>
    );
  };


  /* -- Render --------------------------------------------------------------- */

  /**
   * Tabs a user cannot use are hidden, never shown as broken controls. The server
   * still enforces every endpoint; this only avoids offering actions that would 403.
   */
  const visibleTabs = useMemo(
    () =>
      TABS.filter((item) => {
        if (item.id === "admin") return adminAccess !== "denied";
        if (item.id === "reports") return reportAccess !== "denied";
        return true;
      }),
    [adminAccess, reportAccess]
  );

  // If the active tab disappears once capability is resolved, fall back to Dashboard.
  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab)) setTab("dashboard");
  }, [visibleTabs, tab]);

  const reportsLoading = tab === "reports" && !trainingReport && !certReport;

  return (
    <div className="fleet-center acad-center">
      <header className="fleet-center__header">
        <div className="fleet-center__heading">
          <h1 className="fleet-center__title"><AdminPageTitle>YALA Academy</AdminPageTitle></h1>
          <p className="fleet-center__subtitle">
            Training, professional development, certification, and compliance management.
          </p>
        </div>
        <div className="fleet-center__actions">
          <button type="button" className="fleet-btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {message ? (
        <div className="fleet-notice acad-notice" role="status">
          {message}
        </div>
      ) : null}

      <nav className="fleet-tabs" aria-label="Academy sections">
        {visibleTabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`fleet-tab ${tab === item.id ? "fleet-tab--active" : ""}`}
            aria-current={tab === item.id ? "page" : undefined}
            title={item.purpose}
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="acad-content">
        {loading || reportsLoading ? <LoadingSkeleton /> : null}

        {!loading && !reportsLoading && tab === "dashboard" ? renderDashboard() : null}
        {!loading && tab === "learn" ? renderLearning() : null}
        {!loading && tab === "admin" ? renderAdmin() : null}
        {!loading && !reportsLoading && tab === "reports" ? renderReports() : null}
      </div>
    </div>
  );
}

