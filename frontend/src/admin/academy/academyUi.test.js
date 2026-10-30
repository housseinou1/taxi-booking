import {
  ACADEMY_AUDIENCES,
  AUDIENCE_BY_CODE,
  CERTIFICATE_STATUS,
  COURSE_STATUS,
  ENROLLMENT_STATUS,
  audienceDisplayFromCode,
  audienceDisplayFromLabel,
  audienceLabelFromCode,
  certificateBadge,
  completionPct,
  daysUntil,
  formatPct,
  programLabel,
  rateTone,
  sumAudienceTotals,
} from "./academyUi";

/**
 * Mirrors `Course.AUDIENCE_CHOICES` in backend/taxi/academy/models.py. If the backend
 * adds or renames an audience this test fails, which is the point - the dashboard's
 * `enrollments_by_audience` map is keyed by these exact labels.
 */
const BACKEND_AUDIENCE_CHOICES = [
  ["rider", "Rider"],
  ["driver", "Driver"],
  ["courier", "Courier"],
  ["merchant", "Merchant"],
  ["support", "Customer Support"],
  ["operations", "Operations"],
  ["finance", "Finance"],
  ["supervisor", "Supervisor"],
  ["collector", "Collector"],
  ["landlord", "Landlord"],
  ["maintenance", "Maintenance Staff"],
  ["executive", "Executive"],
];

describe("academyUi domain model", () => {
  it("mirrors the backend audience choices exactly, in order", () => {
    expect(ACADEMY_AUDIENCES.map((a) => [a.code, a.label])).toEqual(BACKEND_AUDIENCE_CHOICES);
  });

  it("keeps every audience code and label unique", () => {
    const codes = ACADEMY_AUDIENCES.map((a) => a.code);
    const labels = ACADEMY_AUDIENCES.map((a) => a.label);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("resolves display labels from both API labels and codes", () => {
    // enrollments_by_audience / department report are keyed by LABEL.
    expect(audienceDisplayFromLabel("Driver")).toBe("Drivers");
    expect(audienceDisplayFromLabel("Maintenance Staff")).toBe("Maintenance Staff");
    // course.audience / audience_code are CODES.
    expect(audienceDisplayFromCode("driver")).toBe("Drivers");
    expect(audienceLabelFromCode("driver")).toBe("Driver");
    expect(AUDIENCE_BY_CODE.executive.label).toBe("Executive");
  });

  it("falls back safely for unknown audiences instead of throwing", () => {
    expect(audienceDisplayFromLabel("Unknown Thing")).toBe("Unknown Thing");
    expect(audienceDisplayFromCode("nope")).toBe("nope");
    expect(audienceLabelFromCode(null)).toBe("Unassigned");
    expect(programLabel(undefined)).toBe("Unassigned Training");
  });

  it("names training programmes after the audience they serve", () => {
    expect(programLabel("driver")).toBe("Drivers Training");
    expect(programLabel("courier")).toBe("Couriers Training");
  });

  it("covers every badge the Academy vocabulary defines", () => {
    expect(Object.keys(COURSE_STATUS).sort()).toEqual(["archived", "draft", "published"]);
    expect(Object.keys(ENROLLMENT_STATUS).sort()).toEqual([
      "completed",
      "failed",
      "in_progress",
      "not_started",
    ]);
    expect(Object.keys(CERTIFICATE_STATUS).sort()).toEqual(["active", "expired", "suspended"]);

    // Wording matches the vocabulary the task requires.
    expect(ENROLLMENT_STATUS.not_started.label).toBe("Pending");
    expect(ENROLLMENT_STATUS.failed.label).toBe("Retraining required");
    expect(CERTIFICATE_STATUS.active.label).toBe("Certified");
  });
});

describe("academyUi completion percentage", () => {
  it("returns null - not 0 - when there is no denominator", () => {
    // The API reports `completed / max(total, 1) * 100`, so 0 enrolled reads as 0.0.
    // Rendering that as "0%" would claim training failed when nobody was trained.
    expect(completionPct(0, 0)).toBeNull();
    expect(completionPct(5, 0)).toBeNull();
    expect(completionPct(0, null)).toBeNull();
    expect(completionPct(0, undefined)).toBeNull();
    expect(completionPct(0, "not-a-number")).toBeNull();
    expect(completionPct(0, -3)).toBeNull();
  });

  it("computes a real rate to one decimal place when learners are enrolled", () => {
    expect(completionPct(4, 10)).toBe(40);
    expect(completionPct(1, 3)).toBe(33.3);
    expect(completionPct(0, 3)).toBe(0); // genuine 0%: 3 enrolled, none finished
    expect(completionPct(3, 3)).toBe(100);
  });

  it("treats a missing completed count as zero rather than NaN", () => {
    expect(completionPct(null, 4)).toBe(0);
    expect(completionPct(undefined, 4)).toBe(0);
  });

  it("formats percentages and the undefined placeholder distinctly", () => {
    expect(formatPct(40)).toBe("40%");
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(null)).toBe("\u2014");
    expect(formatPct(undefined)).toBe("\u2014");
  });

  it("tones a rate by band and greys out the undefined case", () => {
    expect(rateTone(null)).toBe("idle");
    expect(rateTone(0)).toBe("danger");
    expect(rateTone(10)).toBe("warn");
    expect(rateTone(60)).toBe("info");
    expect(rateTone(90)).toBe("ok");
  });

  it("sums audience rows without inventing values for missing ones", () => {
    expect(
      sumAudienceTotals([
        { enrolled: 10, completed: 4, inProgress: 5 },
        { enrolled: 4, completed: 1, inProgress: 2 },
        { enrolled: 0, completed: 0, inProgress: 0 },
      ])
    ).toEqual({ enrolled: 14, completed: 5, inProgress: 7 });
    expect(sumAudienceTotals()).toEqual({ enrolled: 0, completed: 0, inProgress: 0 });
  });
});

describe("academyUi dates and certificate badges", () => {
  const today = new Date(2026, 9, 30); // 30 Oct 2026, local time

  it("measures whole days between dates", () => {
    expect(daysUntil("2026-10-30", today)).toBe(0);
    expect(daysUntil("2026-11-09", today)).toBe(10);
    expect(daysUntil("2026-10-20", today)).toBe(-10);
    expect(daysUntil(null, today)).toBeNull();
    expect(daysUntil("not-a-date", today)).toBeNull();
  });

  it("badges a healthy certificate as Certified", () => {
    expect(
      certificateBadge({ status: "active", expiration_date: "2027-10-30" }, today)
    ).toEqual({ label: "Certified", tone: "ok" });
  });

  it("badges a certificate inside the 30-day renewal window as Expiring soon", () => {
    expect(
      certificateBadge({ status: "active", expiration_date: "2026-11-09" }, today)
    ).toEqual({ label: "Expiring soon", tone: "warn" });
    // Boundary: exactly 30 days out is still inside the window.
    expect(
      certificateBadge({ status: "active", expiration_date: "2026-11-29" }, today)
    ).toEqual({ label: "Expiring soon", tone: "warn" });
  });

  it("never claims Certified when the date has already passed", () => {
    // Stored status can still be `active` if the backend expiry task has not run.
    expect(
      certificateBadge({ status: "active", expiration_date: "2026-10-29" }, today)
    ).toEqual({ label: "Expired", tone: "danger" });
  });

  it("passes through the explicit expired and suspended states", () => {
    expect(
      certificateBadge({ status: "expired", expiration_date: "2099-01-01" }, today)
    ).toEqual({ label: "Expired", tone: "danger" });
    expect(
      certificateBadge({ status: "suspended", expiration_date: "2099-01-01" }, today)
    ).toEqual({ label: "Suspended", tone: "warn" });
  });

  it("handles a missing certificate", () => {
    expect(certificateBadge(null, today)).toEqual({ label: "Not issued", tone: "idle" });
  });

  it("does not mislabel an active certificate with no expiration date", () => {
    expect(certificateBadge({ status: "active", expiration_date: null }, today)).toEqual({
      label: "Certified",
      tone: "ok",
    });
  });
});

