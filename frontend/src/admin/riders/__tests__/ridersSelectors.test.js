import {
  computeRiderSummary,
  filterRiders,
  getAccountStatus,
  getCompletedRideCount,
  getVerification,
  isTestAccount,
  sortRidersByDate,
} from "../ridersSelectors";

const RIDERS = [
  {
    id: 1,
    full_name: "Amina Diallo",
    email: "amina@mail.com",
    phone_number: "+221700000001",
    national_id_number: "ID001",
    rider_status: "approved",
    is_active: true,
    date_joined: "2026-01-10T10:00:00Z",
  },
  {
    id: 2,
    full_name: "Test Rider",
    email: "qa+tester@example.com",
    phone_number: "+221700000002",
    rider_status: "pending",
    is_active: true,
    date_joined: "2026-03-05T10:00:00Z",
  },
  {
    id: 3,
    full_name: "Mamadou Sy",
    email: "mamadou@mail.com",
    phone_number: "+221700000003",
    rider_status: "rejected",
    is_active: false,
    date_joined: "2026-02-01T10:00:00Z",
  },
  {
    id: 4,
    full_name: "Fatou Ba",
    email: "fatou@mail.com",
    phone_number: "+221700000004",
    rider_status: "pending",
    is_active: false,
    date_joined: "2026-04-20T10:00:00Z",
  },
];

describe("computeRiderSummary", () => {
  test("counts each dimension independently", () => {
    const summary = computeRiderSummary(RIDERS);
    expect(summary.total).toBe(4);
    expect(summary.active).toBe(2); // riders 1 and 2
    expect(summary.suspended).toBe(2); // riders 3 and 4
    expect(summary.pending).toBe(2); // riders 2 and 4
    expect(summary.verified).toBe(1); // rider 1
  });

  test("empty list yields zeros", () => {
    expect(computeRiderSummary([])).toEqual({ total: 0, active: 0, pending: 0, verified: 0, suspended: 0 });
  });
});

describe("filterRiders", () => {
  test("search matches name, email, and phone", () => {
    expect(filterRiders(RIDERS, { query: "amina" }).map((r) => r.id)).toEqual([1]);
    expect(filterRiders(RIDERS, { query: "mamadou@mail" }).map((r) => r.id)).toEqual([3]);
    expect(filterRiders(RIDERS, { query: "700000004" }).map((r) => r.id)).toEqual([4]);
  });

  test("verification filter narrows by rider_status", () => {
    expect(filterRiders(RIDERS, { verification: "pending" }).map((r) => r.id)).toEqual([2, 4]);
    expect(filterRiders(RIDERS, { verification: "approved" }).map((r) => r.id)).toEqual([1]);
  });

  test("account filter narrows by is_active", () => {
    expect(filterRiders(RIDERS, { account: "active" }).map((r) => r.id)).toEqual([1, 2]);
    expect(filterRiders(RIDERS, { account: "suspended" }).map((r) => r.id)).toEqual([3, 4]);
  });

  test("filters compose", () => {
    expect(filterRiders(RIDERS, { verification: "pending", account: "suspended" }).map((r) => r.id)).toEqual([4]);
  });
});

describe("sortRidersByDate", () => {
  test("descending (newest first) is the default", () => {
    expect(sortRidersByDate(RIDERS, "desc").map((r) => r.id)).toEqual([4, 2, 3, 1]);
  });

  test("ascending (oldest first)", () => {
    expect(sortRidersByDate(RIDERS, "asc").map((r) => r.id)).toEqual([1, 3, 2, 4]);
  });

  test("does not mutate the input array", () => {
    const copy = [...RIDERS];
    sortRidersByDate(RIDERS, "asc");
    expect(RIDERS).toEqual(copy);
  });
});

describe("getVerification / getAccountStatus", () => {
  test("verification tones map correctly", () => {
    expect(getVerification({ rider_status: "approved" }).tone).toBe("success");
    expect(getVerification({ rider_status: "pending" }).tone).toBe("warning");
    expect(getVerification({ rider_status: "rejected" }).tone).toBe("danger");
  });

  test("account status is independent of verification", () => {
    expect(getAccountStatus({ is_active: true })).toMatchObject({ active: true, tone: "success", label: "Active" });
    expect(getAccountStatus({ is_active: false })).toMatchObject({ active: false, tone: "neutral", label: "Suspended" });
  });
});

describe("getCompletedRideCount", () => {
  test("returns null when no rides are loaded", () => {
    expect(getCompletedRideCount(RIDERS[0], [])).toBeNull();
    expect(getCompletedRideCount(RIDERS[0], undefined)).toBeNull();
  });

  test("returns null when rides do not expose a rider_email to link on", () => {
    const rides = [{ id: 1, status: "completed" }, { id: 2, status: "completed" }];
    expect(getCompletedRideCount(RIDERS[0], rides)).toBeNull();
  });

  test("counts only completed rides matching the rider email", () => {
    const rides = [
      { id: 1, rider_email: "amina@mail.com", status: "completed" },
      { id: 2, rider_email: "amina@mail.com", status: "cancelled" },
      { id: 3, rider_email: "amina@mail.com", status: "completed" },
      { id: 4, rider_email: "other@mail.com", status: "completed" },
    ];
    expect(getCompletedRideCount(RIDERS[0], rides)).toBe(2);
  });

  test("returns 0 (not null) when linkable but rider has no completed rides", () => {
    const rides = [{ id: 1, rider_email: "someone@mail.com", status: "completed" }];
    expect(getCompletedRideCount(RIDERS[0], rides)).toBe(0);
  });
});

describe("isTestAccount (display-only heuristic)", () => {
  test("flags example.com, qa/test markers, and names containing test", () => {
    expect(isTestAccount({ email: "qa+tester@example.com" })).toBe(true);
    expect(isTestAccount({ email: "john.test@mail.com" })).toBe(true);
    expect(isTestAccount({ email: "a@b.com", full_name: "Test User" })).toBe(true);
  });

  test("does not flag ordinary accounts", () => {
    expect(isTestAccount({ email: "amina@mail.com", full_name: "Amina Diallo" })).toBe(false);
    expect(isTestAccount({})).toBe(false);
  });

  test("does not mislabel legitimate accounts containing test/qa as substrings", () => {
    // Previously the bare includes('test')/includes('qa') fallback would have
    // wrongly flagged these; the delimited-token match must NOT.
    expect(isTestAccount({ email: "mustaqa@mail.com", full_name: "Mustaqa Ba" })).toBe(false);
    expect(isTestAccount({ email: "protestor@mail.com" })).toBe(false);
    expect(isTestAccount({ email: "a@b.com", full_name: "Contestant Winner" })).toBe(false);
  });
});
