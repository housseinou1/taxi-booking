import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

/*
 * Two Testing Library lint rules are relaxed for this file, deliberately:
 *
 *  - `prefer-screen-queries`: the Academy page repeats the same visible label in
 *    several places (a KPI label, a section heading and a status badge can all read
 *    "In progress" or "Certificates"). Assertions MUST be scoped with `within(table)`
 *    or `within(kpiCard)` to stay unambiguous, so the scoped container is held in a
 *    local variable rather than re-derived inline for every assertion. That is not
 *    the `render()`-destructuring anti-pattern the rule targets.
 *  - `no-node-access`: resolving "the KPI card containing this label" and "the
 *    section containing this heading" needs `closest()`. Testing Library exposes no
 *    query for that relationship.
 *
 * Both are already present in the existing fleet test files.
 */
/* eslint-disable testing-library/prefer-screen-queries, testing-library/no-node-access */

import AcademyCenter from "./AcademyCenter";
import {
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
  updateCourse,
} from "./academyApi";

jest.mock("./academyApi", () => {
  const actual = jest.requireActual("./academyApi");
  return {
    ...actual,
    fetchLearningDashboard: jest.fn(),
    fetchMyEnrollments: jest.fn(),
    fetchMyCertificates: jest.fn(),
    fetchAvailableCourses: jest.fn(),
    fetchAdminCourses: jest.fn(),
    fetchAdminEnrollments: jest.fn(),
    fetchAdminCertificates: jest.fn(),
    fetchAcademyResults: jest.fn(),
    fetchAcademyDashboard: jest.fn(),
    fetchDepartmentProgressReport: jest.fn(),
    fetchTrainingReport: jest.fn(),
    fetchCertificationReport: jest.fn(),
    fetchExpiredCertificationsReport: jest.fn(),
    fetchCourseDetail: jest.fn(),
    updateCourse: jest.fn(),
    exportTrainingReportCsv: jest.fn(),
  };
});

/** A 403 shaped the way axios reports it - the probe must read this as "denied". */
const FORBIDDEN = { response: { status: 403 } };

const LEARNING = {
  generated_at: "2026-10-30T00:00:00Z",
  assigned_courses: 2,
  completed_courses: 1,
  average_progress_pct: 45.5,
  certificates_earned: 1,
  enrollments: [],
  certificates: [],
  upcoming_renewals: [],
  overdue_assignments: 1,
};

const MY_ENROLLMENTS = [
  {
    id: 11,
    user: 3,
    user_name: "Amadou Diallo",
    course: 1,
    course_title: "How to become a good Driver",
    status: "not_started",
    progress_pct: 0,
    due_date: "2026-12-01",
    completed_at: null,
    updated_at: "2026-10-20T10:00:00Z",
  },
  {
    id: 12,
    user: 3,
    user_name: "Amadou Diallo",
    course: 2,
    course_title: "Courier Safety Basics",
    status: "in_progress",
    progress_pct: 50,
    due_date: null,
    completed_at: null,
    updated_at: "2026-10-25T10:00:00Z",
  },
  {
    id: 13,
    user: 3,
    user_name: "Amadou Diallo",
    course: 3,
    course_title: "Merchant Onboarding",
    status: "completed",
    progress_pct: 100,
    due_date: null,
    completed_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  },
];

const MY_CERTS = [
  {
    id: 71,
    enrollment: 13,
    certificate_number: "CERT-AAA111",
    course_title: "Merchant Onboarding",
    user_name: "Amadou Diallo",
    issue_date: "2026-10-01",
    expiration_date: "2027-10-01",
    status: "active",
  },
];

const AVAILABLE = [
  {
    id: 1,
    title: "How to become a good Driver",
    description: "Driver fundamentals",
    audience: "driver",
    passing_score: 75,
    exam_duration_minutes: 30,
    status: "published",
  },
];

/** 1 draft + 1 published so status filtering and publishing both have real rows. */
const ADMIN_COURSES = [
  {
    id: 1,
    title: "How to become a good Driver",
    description: "Driver fundamentals",
    audience: "driver",
    passing_score: 75,
    exam_duration_minutes: 0,
    randomize_questions: true,
    validity_months: 12,
    status: "draft",
    modules: [],
    questions: [],
    created_at: "2026-10-20T18:30:22Z",
    updated_at: "2026-10-20T18:30:22Z",
  },
  {
    id: 2,
    title: "Courier Safety Basics",
    description: "Safe riding for couriers",
    audience: "courier",
    passing_score: 70,
    exam_duration_minutes: 0,
    randomize_questions: true,
    validity_months: 12,
    status: "published",
    modules: [{ id: 5, title: "Helmet rules" }],
    questions: [{ id: 9, text: "Wear a helmet?" }],
    created_at: "2026-10-21T18:30:22Z",
    updated_at: "2026-10-21T18:30:22Z",
  },
];

/** Every audience the API returns, in the order Course.AUDIENCE_CHOICES declares. */
const AUDIENCE_LABELS = [
  "Rider",
  "Driver",
  "Courier",
  "Merchant",
  "Customer Support",
  "Operations",
  "Finance",
  "Supervisor",
  "Collector",
  "Landlord",
  "Maintenance Staff",
  "Executive",
];

/** Real shape of /academy/dashboard/ - the API always returns all 12 audiences. */
function dashboardPayload(byAudience = {}) {
  const map = {};
  AUDIENCE_LABELS.forEach((label) => {
    const row = byAudience[label] || { enrollments: 0, completed: 0 };
    map[label] = {
      enrollments: row.enrollments,
      completed: row.completed,
      // The API divides by max(total, 1), so an empty audience is reported as 0.0.
      completion_pct: row.enrollments ? (row.completed / row.enrollments) * 100 : 0.0,
    };
  });
  const totals = Object.values(map).reduce(
    (acc, row) => ({ enrollments: acc.enrollments + row.enrollments, completed: acc.completed + row.completed }),
    { enrollments: 0, completed: 0 }
  );
  return {
    generated_at: "2026-10-30T00:00:00Z",
    total_courses: 3,
    total_enrollments: totals.enrollments,
    completed: totals.completed,
    completion_pct: totals.enrollments ? (totals.completed / totals.enrollments) * 100 : 0.0,
    certified_drivers: 5,
    certified_couriers: 2,
    certified_merchants: 1,
    expiring_soon: 4,
    employees_requiring_retraining: 6,
    enrollments_by_audience: map,
  };
}

const DASHBOARD = dashboardPayload({
  Driver: { enrollments: 10, completed: 4 },
  Courier: { enrollments: 4, completed: 1 },
});

const DEPARTMENT_REPORT = {
  generated_at: "2026-10-30T00:00:00Z",
  departments: AUDIENCE_LABELS.map((label, index) => ({
    department: label,
    audience_code: label.toLowerCase().replace(/\s+/g, "_"),
    total_enrollments: 0,
    completed: 0,
    in_progress: 0,
    failed: 0,
    completion_pct: 0.0,
    average_progress_pct: 0.0,
    active_certificates: 0,
    _index: index,
  })).map((row) => {
    if (row.department === "Driver") {
      return { ...row, audience_code: "driver", total_enrollments: 10, completed: 4, in_progress: 5, failed: 1, average_progress_pct: 62.5, active_certificates: 5 };
    }
    if (row.department === "Courier") {
      return { ...row, audience_code: "courier", total_enrollments: 4, completed: 1, in_progress: 2, failed: 1, average_progress_pct: 40, active_certificates: 2 };
    }
    return { ...row, audience_code: row.audience_code };
  }),
};

const ADMIN_ENROLLMENTS = [
  {
    id: 11,
    user: 3,
    user_name: "Amadou Diallo",
    course: 1,
    course_title: "How to become a good Driver",
    status: "in_progress",
    progress_pct: 50,
    due_date: "2026-12-01",
    completed_at: null,
    updated_at: "2026-10-20T10:00:00Z",
  },
  {
    id: 12,
    user: 9,
    user_name: "Fatima Sow",
    course: 2,
    course_title: "Courier Safety Basics",
    status: "completed",
    progress_pct: 100,
    due_date: null,
    completed_at: "2026-10-05T10:00:00Z",
    updated_at: "2026-10-05T10:00:00Z",
  },
];

/** Covers every badge the UI can show: certified, expiring soon, expired, suspended. */
const EXPIRING_SOON_DATE = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 10);
  return date.toISOString().slice(0, 10);
})();

const ADMIN_CERTIFICATES = [
  {
    id: 71,
    enrollment: 12,
    certificate_number: "CERT-ACTIVE",
    course_title: "Courier Safety Basics",
    user_name: "Fatima Sow",
    issue_date: "2026-01-01",
    expiration_date: "2099-01-01",
    status: "active",
  },
  {
    id: 72,
    enrollment: 13,
    certificate_number: "CERT-EXPIRING",
    course_title: "How to become a good Driver",
    user_name: "Amadou Diallo",
    issue_date: "2026-01-01",
    expiration_date: EXPIRING_SOON_DATE,
    status: "active",
  },
  {
    id: 73,
    enrollment: 14,
    certificate_number: "CERT-EXPIRED",
    course_title: "Merchant Onboarding",
    user_name: "Khadija Ould",
    issue_date: "2020-01-01",
    expiration_date: "2021-01-01",
    status: "expired",
  },
  {
    id: 74,
    enrollment: 15,
    certificate_number: "CERT-SUSPENDED",
    course_title: "Courier Safety Basics",
    user_name: "Moussa Ba",
    issue_date: "2026-01-01",
    expiration_date: "2099-01-01",
    status: "suspended",
  },
];

/** ISO timestamp N days before now - keeps date-range tests stable over time. */
function daysAgo(n) {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString();
}

const TRAINING_REPORT = {
  total: 3,
  by_status: { not_started: 1, in_progress: 1, completed: 1, failed: 0 },
  details: [
    {
      id: 11,
      user: 3,
      user_name: "Amadou Diallo",
      course: 1,
      course_title: "How to become a good Driver",
      status: "in_progress",
      progress_pct: 50,
      due_date: "2026-12-01",
      completed_at: null,
      updated_at: daysAgo(5),
    },
    {
      id: 12,
      user: 9,
      user_name: "Fatima Sow",
      course: 2,
      course_title: "Courier Safety Basics",
      status: "completed",
      progress_pct: 100,
      due_date: null,
      completed_at: daysAgo(10),
      updated_at: daysAgo(10),
    },
    {
      id: 13,
      user: 4,
      user_name: "Moussa Ba",
      course: 2,
      course_title: "Courier Safety Basics",
      status: "failed",
      progress_pct: 30,
      due_date: null,
      completed_at: null,
      updated_at: daysAgo(120),
    },
  ],
};

const CERT_REPORT = {
  total: ADMIN_CERTIFICATES.length,
  active: 2,
  expired: 1,
  suspended: 1,
  certificates: ADMIN_CERTIFICATES,
};

const EXPIRED_REPORT = {
  count: 1,
  certificates: [ADMIN_CERTIFICATES[2]],
};


beforeEach(() => {
  jest.clearAllMocks();

  fetchLearningDashboard.mockResolvedValue(LEARNING);
  fetchMyEnrollments.mockResolvedValue(MY_ENROLLMENTS);
  fetchMyCertificates.mockResolvedValue(MY_CERTS);
  fetchAvailableCourses.mockResolvedValue(AVAILABLE);

  // Report staff + academy admin (the CEO case).
  fetchAdminCourses.mockResolvedValue(ADMIN_COURSES);
  fetchAdminEnrollments.mockResolvedValue(ADMIN_ENROLLMENTS);
  fetchAdminCertificates.mockResolvedValue(ADMIN_CERTIFICATES);
  fetchAcademyResults.mockResolvedValue([
    { id: 5, enrollment: 12, score_pct: 85, passed: true, started_at: "2026-10-01T10:00:00Z", completed_at: "2026-10-01T10:20:00Z" },
  ]);
  fetchAcademyDashboard.mockResolvedValue(DASHBOARD);
  fetchDepartmentProgressReport.mockResolvedValue(DEPARTMENT_REPORT);

  fetchTrainingReport.mockResolvedValue(TRAINING_REPORT);
  fetchCertificationReport.mockResolvedValue(CERT_REPORT);
  fetchExpiredCertificationsReport.mockResolvedValue(EXPIRED_REPORT);

  fetchCourseDetail.mockResolvedValue({ ...ADMIN_COURSES[0], modules: [], questions: [] });
  updateCourse.mockResolvedValue({});
  exportTrainingReportCsv.mockResolvedValue(new Blob(["a,b"]));
  window.URL.createObjectURL = jest.fn(() => "blob:mock");
  window.URL.revokeObjectURL = jest.fn();
});

/** Render and wait until the initial load has settled. */
async function renderPage(waitForText = "Published Courses") {
  const utils = render(<AcademyCenter />);
  await screen.findByRole("navigation", { name: "Academy sections" });
  if (waitForText) await screen.findByText(waitForText);
  return utils;
}

/** The KPI card containing the given label - keeps value assertions unambiguous. */
function kpi(label) {
  const [node] = screen.getAllByText(label, { selector: ".fleet-kpi__label" });
  const card = node?.closest(".fleet-kpi");
  if (!card) throw new Error(`No KPI card found for "${label}"`);
  return within(card);
}

/** The section whose SectionHead title matches - scopes repeated button labels. */
function section(title) {
  const heading = screen.getByRole("heading", { level: 2, name: title });
  const node = heading.closest("section");
  if (!node) throw new Error(`No <section> found for "${title}"`);
  return within(node);
}

/**
 * Switch tab and wait for the section heading to appear.
 *
 * Waiting on an `<h2>` (rather than loose text) keeps the wait unambiguous - several
 * labels ("In progress", "Certificates") are also used by KPI cards and badges.
 */
async function openTab(name, waitForHeading) {
  fireEvent.click(screen.getByRole("button", { name }));
  if (waitForHeading) {
    await screen.findByRole("heading", { level: 2, name: waitForHeading });
  }
  return screen.getByRole("navigation", { name: "Academy sections" });
}

describe("AcademyCenter", () => {
  it("renders the page header, subtitle and exactly one page title", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "YALA Academy" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Training, professional development, certification, and compliance management."
      )
    ).toBeInTheDocument();

    // Exactly one <h1>: App.js passes title="" so the shell does not add a second.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("does not render its own breadcrumb (the admin shell owns it)", async () => {
    await renderPage();

    // A second breadcrumb would duplicate the shell's "Admin / Academy" trail.
    expect(screen.queryByLabelText("Breadcrumb")).not.toBeInTheDocument();
  });

  it("renders the four navigation tabs with their purpose", async () => {
    await renderPage();

    const nav = screen.getByRole("navigation", { name: "Academy sections" });
    ["Dashboard", "My Learning", "Admin Portal", "Reports"].forEach((label) => {
      expect(within(nav).getByRole("button", { name: label })).toBeInTheDocument();
    });

    // The active tab is marked for assistive tech.
    expect(within(nav).getByRole("button", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    // Each tab explains itself.
    expect(within(nav).getByRole("button", { name: "Reports" })).toHaveAttribute(
      "title",
      expect.stringMatching(/compliance reporting/i)
    );
  });


  it("shows all eight training KPIs from the dashboard payload", async () => {
    await renderPage();

    expect(kpi("Published Courses").getByText("3")).toBeInTheDocument();
    expect(kpi("Total Enrollments").getByText("14")).toBeInTheDocument();
    // 5 of 14 completed = 35.7%
    expect(kpi("Completion Rate").getByText("35.7%")).toBeInTheDocument();
    expect(kpi("Retraining Required").getByText("6")).toBeInTheDocument();
    expect(kpi("Certified Drivers").getByText("5")).toBeInTheDocument();
    expect(kpi("Certified Couriers").getByText("2")).toBeInTheDocument();
    expect(kpi("Certified Merchants").getByText("1")).toBeInTheDocument();
    expect(kpi("Expiring Certifications").getByText("4")).toBeInTheDocument();

    // Units are stated so a count is never mistaken for a percentage.
    expect(kpi("Published Courses").getByText("courses")).toBeInTheDocument();
    expect(kpi("Certified Drivers").getByText("drivers")).toBeInTheDocument();
  });

  it("never reports 0% completion when nobody is enrolled", async () => {
    fetchAcademyDashboard.mockResolvedValue(dashboardPayload());
    fetchDepartmentProgressReport.mockResolvedValue({ departments: DEPARTMENT_REPORT.departments });

    await renderPage();

    expect(kpi("Total Enrollments").getByText("0")).toBeInTheDocument();
    // The API says 0.0; the UI must not repeat that as if training had failed.
    const rate = kpi("Completion Rate");
    expect(rate.queryByText("0%")).not.toBeInTheDocument();
    expect(rate.getByText("\u2014")).toBeInTheDocument();
    expect(rate.getByText(/rate is undefined/i)).toBeInTheDocument();
  });

  it("renders the audience table with every supported audience and its columns", async () => {
    await renderPage();

    const table = screen.getByRole("table", { name: "Enrolments by audience" });
    const grid = within(table);

    ["Audience", "Enrolled", "Completed", "In progress", "Completion rate", "Active certificates"].forEach(
      (header) => {
        expect(grid.getByRole("columnheader", { name: new RegExp(header, "i") })).toBeInTheDocument();
      }
    );

    // All 12 supported audiences are preserved.
    expect(grid.getAllByRole("row")).toHaveLength(AUDIENCE_LABELS.length + 1);

    const driverRow = within(grid.getByRole("row", { name: /Drivers/ }));
    expect(driverRow.getByText("10")).toBeInTheDocument();
    expect(driverRow.getByText("4")).toBeInTheDocument();
    expect(driverRow.getByText("40%")).toBeInTheDocument();

    const courierRow = within(grid.getByRole("row", { name: /Couriers/ }));
    expect(courierRow.getByText("25%")).toBeInTheDocument();

    // An audience with no learners gets a dash, not a misleading 0%.
    const financeRow = within(grid.getByRole("row", { name: /Finance/ }));
    expect(financeRow.getByText(/No learners enrolled/i)).toBeInTheDocument();
    expect(financeRow.queryByText("0%")).not.toBeInTheDocument();
  });

  it("replaces the audience table with a compact empty state when nothing is enrolled", async () => {
    fetchAcademyDashboard.mockResolvedValue(dashboardPayload());

    await renderPage();

    expect(
      screen.queryByRole("table", { name: "Enrolments by audience" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("No training enrolments yet")).toBeInTheDocument();

    // The categories are still preserved, just compactly.
    const chips = screen.getByLabelText("Supported training audiences");
    expect(within(chips).getAllByText(/./)).toHaveLength(AUDIENCE_LABELS.length);
  });

  it("hides the in-progress column when the department report is unavailable", async () => {
    fetchDepartmentProgressReport.mockRejectedValue(FORBIDDEN);

    await renderPage();

    const table = screen.getByRole("table", { name: "Enrolments by audience" });
    const grid = within(table);
    expect(grid.queryByRole("columnheader", { name: /In progress/i })).not.toBeInTheDocument();
    expect(grid.getByRole("columnheader", { name: /Completion rate/i })).toBeInTheDocument();
    expect(
      screen.getByText(/In-progress detail needs the department progress report/i)
    ).toBeInTheDocument();
  });


  it("hides the Admin Portal and Reports tabs when the API denies access", async () => {
    fetchAdminCourses.mockRejectedValue(FORBIDDEN);
    fetchAcademyDashboard.mockRejectedValue(FORBIDDEN);
    fetchDepartmentProgressReport.mockRejectedValue(FORBIDDEN);

    await renderPage("Your role cannot view academy analytics");

    const nav = screen.getByRole("navigation", { name: "Academy sections" });
    const grid = within(nav);
    expect(grid.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
    expect(grid.getByRole("button", { name: "My Learning" })).toBeInTheDocument();
    // A 403 is the server's decision: the surfaces are removed, not shown broken.
    expect(grid.queryByRole("button", { name: "Admin Portal" })).not.toBeInTheDocument();
    expect(grid.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
  });

  it("explains the permission gap instead of fabricating zero statistics", async () => {
    fetchAdminCourses.mockRejectedValue(FORBIDDEN);
    fetchAcademyDashboard.mockRejectedValue(FORBIDDEN);
    fetchDepartmentProgressReport.mockRejectedValue(FORBIDDEN);

    await renderPage("Your role cannot view academy analytics");

    // No KPI cards are rendered at all for a learner - so no fake zeros either.
    expect(document.querySelectorAll(".fleet-kpi")).toHaveLength(0);
    expect(screen.queryByText("Published Courses")).not.toBeInTheDocument();
    expect(screen.getByText(/restricted to report staff/i)).toBeInTheDocument();
  });

  it("keeps the learner surfaces working when only admin access is denied", async () => {
    fetchAdminCourses.mockRejectedValue(FORBIDDEN);
    fetchAdminEnrollments.mockRejectedValue(FORBIDDEN);
    fetchAdminCertificates.mockRejectedValue(FORBIDDEN);

    await renderPage();
    await openTab("My Learning", "My learning overview");

    const nav = screen.getByRole("navigation", { name: "Academy sections" });
    expect(within(nav).queryByRole("button", { name: "Admin Portal" })).not.toBeInTheDocument();
    // Report staff still get their analytics.
    expect(within(nav).getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(kpi("Assigned Courses").getByText("2")).toBeInTheDocument();
  });

  it("shows a retryable error when capability cannot be determined", async () => {
    fetchAcademyDashboard.mockRejectedValue(new Error("Network Error"));

    await renderPage("Academy analytics could not be loaded. Check your connection and try again.");

    // Offline is not a permission decision, so the tab stays available.
    const nav = screen.getByRole("navigation", { name: "Academy sections" });
    expect(within(nav).getByRole("button", { name: "Reports" })).toBeInTheDocument();
  });

  it("does not invent document/certificate approval controls", async () => {
    await renderPage();
    await openTab("Dashboard", "Enrollments by audience");

    // Certification review lives elsewhere; this page must not offer it.
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
  });


  it("renders the My Learning overview and organises courses by stage", async () => {
    await renderPage();
    await openTab("My Learning", "My learning overview");

    expect(kpi("Assigned Courses").getByText("2")).toBeInTheDocument();
    expect(kpi("In Progress").getByText("1")).toBeInTheDocument();
    expect(kpi("Completed Courses").getByText("1")).toBeInTheDocument();
    expect(kpi("Average Progress").getByText("45.5%")).toBeInTheDocument();
    expect(kpi("Certificates Earned").getByText("1")).toBeInTheDocument();
    expect(kpi("Overdue").getByText("1")).toBeInTheDocument();

    // Each stage offers only the action that stage supports.
    const assigned = section("Assigned courses");
    expect(assigned.getByText("How to become a good Driver")).toBeInTheDocument();
    expect(assigned.getByRole("button", { name: "Start Course" })).toBeInTheDocument();
    expect(assigned.getByText("Pending")).toBeInTheDocument();

    const inProgress = section("In progress");
    expect(inProgress.getByText("Courier Safety Basics")).toBeInTheDocument();
    expect(inProgress.getByRole("button", { name: "Continue Learning" })).toBeInTheDocument();
    expect(inProgress.getByText("In progress", { selector: ".fleet-pill" })).toBeInTheDocument();

    const completed = section("Completed courses");
    expect(completed.getByText("Merchant Onboarding")).toBeInTheDocument();
    expect(completed.getByRole("button", { name: "View Course" })).toBeInTheDocument();
    expect(completed.getByText("Completed")).toBeInTheDocument();
  });

  it("shows the training category and certificate availability on a course card", async () => {
    await renderPage();
    await openTab("My Learning", "My learning overview");

    // The audience is resolved from the course lists, not guessed.
    expect(section("Assigned courses").getByText("Drivers")).toBeInTheDocument();

    // The completed enrolment has a certificate, so the card shows its status.
    expect(section("Completed courses").getByText("Certified")).toBeInTheDocument();

    // Enrolments with no resolvable audience show a dash rather than a wrong value.
    expect(section("Completed courses").getAllByText("\u2014").length).toBeGreaterThan(0);
  });

  it("lists the learner's certificates with their status", async () => {
    await renderPage();
    await openTab("My Learning", "My certificates");

    const table = screen.getByRole("table", { name: "My certificates" });
    const grid = within(table);
    expect(grid.getByText("CERT-AAA111")).toBeInTheDocument();
    expect(grid.getByText("Merchant Onboarding")).toBeInTheDocument();
    expect(grid.getByText("Certified")).toBeInTheDocument();
  });

  it("lists available courses with their category and pass mark", async () => {
    await renderPage();
    await openTab("My Learning", "Available courses");

    const available = section("Available courses");
    expect(available.getByText("How to become a good Driver")).toBeInTheDocument();
    expect(available.getByText("Drivers")).toBeInTheDocument();
    expect(available.getByText("75%")).toBeInTheDocument();
    expect(available.getByRole("button", { name: "View Course" })).toBeInTheDocument();
  });

  it("shows clean empty states when the learner has no training", async () => {
    fetchLearningDashboard.mockResolvedValue({
      ...LEARNING,
      assigned_courses: 0,
      completed_courses: 0,
      average_progress_pct: 0,
      certificates_earned: 0,
      overdue_assignments: 0,
    });
    fetchMyEnrollments.mockResolvedValue([]);
    fetchMyCertificates.mockResolvedValue([]);
    fetchAvailableCourses.mockResolvedValue([]);

    await renderPage();
    await openTab("My Learning", "My learning overview");

    expect(section("Assigned courses").getByText("No courses waiting to be started")).toBeInTheDocument();
    expect(section("In progress").getByText("Nothing in progress")).toBeInTheDocument();
    expect(section("Completed courses").getByText("No completed courses yet")).toBeInTheDocument();
    expect(section("My certificates").getByText("No certificates yet")).toBeInTheDocument();
    expect(section("Available courses").getByText("No published courses for you")).toBeInTheDocument();
  });


  it("shows the admin summary KPIs and the real course directory", async () => {
    await renderPage();
    await openTab("Admin Portal", "Course management");

    expect(kpi("Courses").getByText("2")).toBeInTheDocument();
    expect(kpi("Enrollments").getByText("2")).toBeInTheDocument();
    expect(kpi("Certificates").getByText("4")).toBeInTheDocument();
    // 1 expiring soon + 1 expired
    expect(kpi("Certification risk").getByText("2")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Course directory" });
    const grid = within(table);
    expect(grid.getByText("How to become a good Driver")).toBeInTheDocument();
    expect(grid.getByText("Courier Safety Basics")).toBeInTheDocument();
    expect(grid.getByRole("columnheader", { name: /Audience/i })).toBeInTheDocument();
    expect(grid.getByRole("columnheader", { name: /Pass mark/i })).toBeInTheDocument();
    expect(grid.getByText("Draft")).toBeInTheDocument();
    expect(grid.getByText("Published")).toBeInTheDocument();
  });

  it("filters the course directory by search text", async () => {
    await renderPage();
    await openTab("Admin Portal", "Course management");

    const grid = within(screen.getByRole("table", { name: "Course directory" }));

    fireEvent.change(
      screen.getByLabelText("Search courses by title, description or audience"),
      { target: { value: "courier" } }
    );

    await waitFor(() =>
      expect(grid.queryByText("How to become a good Driver")).not.toBeInTheDocument()
    );
    expect(grid.getByText("Courier Safety Basics")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 courses/)).toBeInTheDocument();
  });

  it("filters the course directory by status and resets", async () => {
    await renderPage();
    await openTab("Admin Portal", "Course management");

    const grid = within(screen.getByRole("table", { name: "Course directory" }));

    fireEvent.change(screen.getByLabelText("Filter courses by status"), {
      target: { value: "draft" },
    });

    await waitFor(() =>
      expect(grid.queryByText("Courier Safety Basics")).not.toBeInTheDocument()
    );
    expect(grid.getByText("How to become a good Driver")).toBeInTheDocument();

    fireEvent.click(
      section("Course management").getByRole("button", { name: "Reset filters" })
    );

    await grid.findByText("Courier Safety Basics");
    expect(screen.getByText(/2 of 2 courses/)).toBeInTheDocument();
  });

  it("publishes a draft course through the existing course endpoint", async () => {
    await renderPage();
    await openTab("Admin Portal", "Course management");

    const grid = within(screen.getByRole("table", { name: "Course directory" }));
    fireEvent.click(grid.getAllByRole("button", { name: "Publish" })[0]);

    await waitFor(() => expect(updateCourse).toHaveBeenCalledWith(1, { status: "published" }));
  });

  it("groups courses into training programmes by audience", async () => {
    await renderPage();
    await openTab("Admin Portal", "Training programs");

    const programs = section("Training programs");
    expect(programs.getByText("Drivers Training")).toBeInTheDocument();
    expect(programs.getByText("Couriers Training")).toBeInTheDocument();
    expect(programs.getAllByText("1 published")).toHaveLength(1);
  });

  it("lists learner enrolments and only allows certification of completed ones", async () => {
    await renderPage();
    await openTab("Admin Portal", "Enrollment management");

    const table = screen.getByRole("table", { name: "Learner enrollments" });
    const grid = within(table);
    expect(grid.getByText("Amadou Diallo")).toBeInTheDocument();
    expect(grid.getByText("Fatima Sow")).toBeInTheDocument();
    expect(grid.getByText("Drivers")).toBeInTheDocument();
    expect(grid.getByText("In progress")).toBeInTheDocument();

    const buttons = grid.getAllByRole("button", { name: "Issue Certificate" });
    expect(buttons).toHaveLength(2);
    // Only the completed enrolment may be certified.
    expect(buttons.filter((button) => !button.disabled)).toHaveLength(1);
  });

  it("filters learner enrolments by name", async () => {
    await renderPage();
    await openTab("Admin Portal", "Enrollment management");

    const grid = within(screen.getByRole("table", { name: "Learner enrollments" }));

    fireEvent.change(
      screen.getByLabelText("Search learners by name, course or audience"),
      { target: { value: "fatima" } }
    );

    await waitFor(() => expect(grid.queryByText("Amadou Diallo")).not.toBeInTheDocument());
    expect(grid.getByText("Fatima Sow")).toBeInTheDocument();
  });

  it("renders every certification badge state", async () => {
    await renderPage();
    await openTab("Admin Portal", "Certification management");

    const table = screen.getByRole("table", { name: "Issued certificates" });
    const grid = within(table);
    expect(grid.getByText("CERT-ACTIVE")).toBeInTheDocument();
    expect(grid.getByText("Certified")).toBeInTheDocument();
    expect(grid.getByText("Expiring soon")).toBeInTheDocument();
    expect(grid.getByText("Expired")).toBeInTheDocument();
    expect(grid.getByText("Suspended")).toBeInTheDocument();

    // Suspension is only offered for active certificates.
    const suspendButtons = grid.getAllByRole("button", { name: "Suspend" });
    expect(suspendButtons.filter((button) => !button.disabled)).toHaveLength(2);
  });

  it("opens the course detail with modules and assessment from the admin view", async () => {
    await renderPage();
    await openTab("Admin Portal", "Course management");

    const grid = within(screen.getByRole("table", { name: "Course directory" }));
    fireEvent.click(grid.getAllByRole("button", { name: "View" })[0]);

    const detail = await screen.findByLabelText("Course details");
    expect(within(detail).getByText("Modules")).toBeInTheDocument();
    expect(within(detail).getByText("Assessment")).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Start Assessment" })).toBeInTheDocument();
  });


  it("renders all five report sections", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    [
      "Training overview",
      "Audience performance",
      "Certification status",
      "Retraining monitoring",
      "Course performance",
    ].forEach((title) => {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    });

    expect(kpi("Enrollments").getByText("3")).toBeInTheDocument();
    expect(kpi("Completed").getByText("1")).toBeInTheDocument();
    expect(kpi("In Progress").getByText("1")).toBeInTheDocument();
    // 1 of 3 completed = 33.3%
    expect(kpi("Completion Rate").getByText("33.3%")).toBeInTheDocument();
  });

  it("exposes the four working report filters", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    expect(screen.getByLabelText("Filter reports by date range")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter reports by audience")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter reports by course")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter reports by certification status")).toBeInTheDocument();
    expect(screen.getByText("No filters applied")).toBeInTheDocument();
  });

  it("applies the date range filter to the enrolment statistics", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    fireEvent.change(screen.getByLabelText("Filter reports by date range"), {
      target: { value: "30" },
    });

    // The 120-day-old failed enrolment drops out, leaving 2 of 3 rows.
    await waitFor(() => expect(kpi("Enrollments").getByText("2")).toBeInTheDocument());
    expect(kpi("Completion Rate").getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Filters active")).toBeInTheDocument();
  });

  it("applies the certification status filter", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    fireEvent.change(screen.getByLabelText("Filter reports by certification status"), {
      target: { value: "Expired" },
    });

    await waitFor(() => expect(kpi("Expired").getByText("1")).toBeInTheDocument());
    expect(kpi("Certified").getByText("0")).toBeInTheDocument();
    expect(kpi("Suspended").getByText("0")).toBeInTheDocument();
  });

  it("filters by audience and by course", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    fireEvent.change(screen.getByLabelText("Filter reports by course"), {
      target: { value: "2" },
    });

    await waitFor(() => expect(kpi("Enrollments").getByText("2")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Filter reports by course"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Filter reports by audience"), {
      target: { value: "driver" },
    });

    await waitFor(() => expect(kpi("Enrollments").getByText("1")).toBeInTheDocument());
    expect(kpi("In Progress").getByText("1")).toBeInTheDocument();
  });

  it("resets every report filter", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    fireEvent.change(screen.getByLabelText("Filter reports by date range"), {
      target: { value: "30" },
    });
    await screen.findByText("Filters active");

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    await kpi("Enrollments").findByText("3");
    expect(screen.getByText("No filters applied")).toBeInTheDocument();
  });


  it("derives per-course completion from the enrolment rows", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    const table = screen.getByRole("table", { name: "Course performance" });
    const grid = within(table);

    const courierRow = within(grid.getByRole("row", { name: /Courier Safety Basics/ }));
    expect(courierRow.getByText("2")).toBeInTheDocument();
    expect(courierRow.getByText("50%")).toBeInTheDocument();

    // A course with enrolments but no completions is a genuine 0%, not a dash.
    const driverRow = within(grid.getByRole("row", { name: /How to become a good Driver/ }));
    expect(driverRow.getByText("0%")).toBeInTheDocument();
  });

  it("lists retraining requirements from failed enrolments and lapsed certificates", async () => {
    await renderPage();
    await openTab("Reports", "Retraining monitoring");

    const retraining = section("Retraining monitoring");
    expect(retraining.getByText("Assessment not passed")).toBeInTheDocument();
    expect(retraining.getByText("Certification expired")).toBeInTheDocument();
    expect(retraining.getByText("Certification suspended")).toBeInTheDocument();
    // Moussa Ba failed an assessment AND holds a suspended certificate - two reasons.
    expect(retraining.getAllByText("Moussa Ba")).toHaveLength(2);
    expect(retraining.getByText("Khadija Ould")).toBeInTheDocument();
  });

  it("shows the audience performance table with real department figures", async () => {
    await renderPage();
    await openTab("Reports", "Audience performance");

    const grid = within(screen.getByRole("table", { name: "Audience performance" }));
    const driverRow = within(grid.getByRole("row", { name: /Drivers/ }));
    expect(driverRow.getByText("10")).toBeInTheDocument();
    expect(driverRow.getByText("4")).toBeInTheDocument();
    expect(driverRow.getByText("62.5%")).toBeInTheDocument();
    expect(driverRow.getByText("40%")).toBeInTheDocument();
    // 5 in progress and 5 active certificates for the Driver audience.
    expect(driverRow.getAllByText("5")).toHaveLength(2);
    expect(driverRow.getByText("1")).toBeInTheDocument();
  });

  it("renders the dedicated expired-certifications report", async () => {
    await renderPage();
    await openTab("Reports", "Certification status");

    const grid = within(screen.getByRole("table", { name: "Expired certifications" }));
    expect(grid.getByText("CERT-EXPIRED")).toBeInTheDocument();
    expect(grid.getByText("Khadija Ould")).toBeInTheDocument();
    expect(
      screen.getByText(/certificate\(s\) past their expiration date/)
    ).toBeInTheDocument();
  });

  it("exports the training report as CSV", async () => {
    await renderPage();
    await openTab("Reports", "Academy reporting");

    fireEvent.click(screen.getByRole("button", { name: "Export Training CSV" }));

    await waitFor(() => expect(exportTrainingReportCsv).toHaveBeenCalledTimes(1));
  });

  it("surfaces a report failure without breaking the rest of the page", async () => {
    fetchTrainingReport.mockRejectedValue({ response: { data: { detail: "Report unavailable" } } });

    await renderPage();
    await openTab("Reports", "Academy reporting");

    expect(await screen.findByRole("alert")).toHaveTextContent("Report unavailable");
    // The learner surfaces are unaffected.
    await openTab("My Learning", "My learning overview");
    expect(kpi("Assigned Courses").getByText("2")).toBeInTheDocument();
  });
});

