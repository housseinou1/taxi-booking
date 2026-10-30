/**
 * YALA Academy - domain model and presentation helpers.
 *
 * Mirrors the backend contracts in `backend/taxi/academy/` so the Academy Center
 * renders ONLY data the API actually provides:
 *   - Course.AUDIENCE_CHOICES / STATUS_CHOICES  (models.py)
 *   - Enrollment.STATUS_CHOICES                 (models.py)
 *   - Certificate.STATUS_CHOICES                (models.py)
 *   - the 30-day renewal window                 (academy_service.py)
 *
 * Pure helpers only: no fetching, no mutation, no business-rule changes.
 */

/** Placeholder for "no value". Escaped so this source file stays pure ASCII. */
export const DASH = "\u2014";

/**
 * Renewal window used by the backend when it flags certificates that are about to
 * lapse (`academy_service.expire_certificates` uses `timedelta(days=30)`). Kept
 * here for DISPLAY only - the backend remains the authority on real expiry.
 */
export const RENEWAL_WINDOW_DAYS = 30;

/**
 * Training audiences - mirrors `Course.AUDIENCE_CHOICES` exactly, in the same order.
 *
 * `label` is the key the API uses in `enrollments_by_audience` and the value it
 * returns as `department` in the department-progress report, so it must never be
 * renamed. `display` is the pluralised heading shown in the audience table.
 */
export const ACADEMY_AUDIENCES = [
  { code: "rider", label: "Rider", display: "Riders" },
  { code: "driver", label: "Driver", display: "Drivers" },
  { code: "courier", label: "Courier", display: "Couriers" },
  { code: "merchant", label: "Merchant", display: "Merchants" },
  { code: "support", label: "Customer Support", display: "Customer Support" },
  { code: "operations", label: "Operations", display: "Operations" },
  { code: "finance", label: "Finance", display: "Finance" },
  { code: "supervisor", label: "Supervisor", display: "Supervisors" },
  { code: "collector", label: "Collector", display: "Collectors" },
  { code: "landlord", label: "Landlord", display: "Landlords" },
  { code: "maintenance", label: "Maintenance Staff", display: "Maintenance Staff" },
  { code: "executive", label: "Executive", display: "Executives" },
];

const byLabel = {};
const byCode = {};
ACADEMY_AUDIENCES.forEach((audience) => {
  byLabel[audience.label] = audience;
  byCode[audience.code] = audience;
});

export const AUDIENCE_BY_LABEL = byLabel;
export const AUDIENCE_BY_CODE = byCode;

/** Display heading for an API audience LABEL (dashboard / department report key). */
export function audienceDisplayFromLabel(label) {
  return byLabel[label]?.display || label || "Unknown";
}

/** Display heading for an API audience CODE (course.audience / audience_code). */
export function audienceDisplayFromCode(code) {
  return byCode[code]?.display || code || "Unassigned";
}

/** Canonical API label for an audience code. */
export function audienceLabelFromCode(code) {
  return byCode[code]?.label || code || "Unassigned";
}

/**
 * Training programs are not a separate backend entity: a course belongs to exactly
 * one audience. Programs are therefore the audience groups, labelled from real data.
 */
export function programLabel(code) {
  const audience = byCode[code];
  return audience ? `${audience.display} Training` : "Unassigned Training";
}

/* -- Status vocabularies ---------------------------------------------------- */

export const COURSE_STATUS = {
  draft: { label: "Draft", tone: "idle" },
  published: { label: "Published", tone: "ok" },
  archived: { label: "Archived", tone: "danger" },
};

/** Badge wording follows the Academy vocabulary: Pending / In progress / Retraining required. */
export const ENROLLMENT_STATUS = {
  not_started: { label: "Pending", tone: "idle" },
  in_progress: { label: "In progress", tone: "info" },
  completed: { label: "Completed", tone: "ok" },
  failed: { label: "Retraining required", tone: "danger" },
};

export const CERTIFICATE_STATUS = {
  active: { label: "Certified", tone: "ok" },
  expired: { label: "Expired", tone: "danger" },
  suspended: { label: "Suspended", tone: "warn" },
};

/* -- Date helpers ----------------------------------------------------------- */

/**
 * Parse a value into a local Date.
 *
 * Academy date fields (`expiration_date`, `due_date`, `issue_date`) are Django
 * DateFields serialized as "YYYY-MM-DD" with no timezone. `new Date("2026-10-30")`
 * treats that as UTC midnight, so in any timezone behind UTC the local calendar date
 * shifts a day earlier. Date-only strings are therefore parsed as local dates.
 */
function toLocalDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined || value === "") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole days from `today` to `value`; null when `value` is missing/unparseable. */
export function daysUntil(value, today = new Date()) {
  const target = toLocalDate(value);
  const start = toLocalDate(today);
  if (!target || !start) return null;
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((endDay - startDay) / 86400000);
}

/**
 * Certificate badge. A certificate whose stored status is still `active` but whose
 * expiration date has passed (or is inside the renewal window) is shown accordingly,
 * so the UI never claims someone is certified when the date says otherwise.
 */
export function certificateBadge(certificate, today = new Date()) {
  if (!certificate) return { label: "Not issued", tone: "idle" };
  if (certificate.status === "suspended") return { label: "Suspended", tone: "warn" };
  if (certificate.status === "expired") return { label: "Expired", tone: "danger" };

  const days = daysUntil(certificate.expiration_date, today);
  if (days !== null && days < 0) return { label: "Expired", tone: "danger" };
  if (days !== null && days <= RENEWAL_WINDOW_DAYS) {
    return { label: "Expiring soon", tone: "warn" };
  }
  return { label: "Certified", tone: "ok" };
}

/* -- Numeric helpers -------------------------------------------------------- */

/**
 * Completion percentage that refuses to lie.
 *
 * The API computes `completed / max(total, 1) * 100`, so an audience with NO
 * enrolments is reported as `0.0` - indistinguishable from "everybody failed".
 * This returns `null` for an empty denominator so the UI can render a dash instead.
 */
export function completionPct(completed, total) {
  const totalNum = Number(total);
  if (!Number.isFinite(totalNum) || totalNum <= 0) return null;
  const completedNum = Number(completed);
  const safe = Number.isFinite(completedNum) ? completedNum : 0;
  return Math.round((safe / totalNum) * 1000) / 10;
}

export function formatPct(value) {
  return value === null || value === undefined ? DASH : `${value}%`;
}

/** Tone for a completion rate - grey when the rate is genuinely undefined. */
export function rateTone(pct) {
  if (pct === null || pct === undefined) return "idle";
  if (pct >= 80) return "ok";
  if (pct >= 50) return "info";
  if (pct > 0) return "warn";
  return "danger";
}

/** Enrolled / completed / in-progress totals summed across every audience row. */
export function sumAudienceTotals(rows = []) {
  return rows.reduce(
    (acc, row) => ({
      enrolled: acc.enrolled + (row.enrolled || 0),
      completed: acc.completed + (row.completed || 0),
      inProgress: acc.inProgress + (row.inProgress || 0),
    }),
    { enrolled: 0, completed: 0, inProgress: 0 }
  );
}
