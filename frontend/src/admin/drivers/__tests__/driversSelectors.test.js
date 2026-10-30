import {
  computeDriverSummary,
  filterDrivers,
  getAccountStatus,
  getOnlineStatus,
  getVerificationStatus,
  isTaxiDriver,
  naOrNull,
  sortDrivers,
} from "../driversSelectors";

// Build a date string inside the current calendar month for the newThisMonth test.
function thisMonthDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 15, 10, 0, 0).toISOString();
}

const DRIVERS = [
  {
    id: 1,
    driver_code: "D001",
    driver_name: "Amadou Ba",
    email: "amadou@mail.com",
    phone_number: "+221700000001",
    vehicle_plate: "RIM-111",
    is_courier: false,
    status: "approved",
    is_active: true,
    is_available: true,
    city_name: "Nouakchott",
    driver_category_label: "Sedan",
    total_rides_completed: 40,
    average_rating: "4.75",
    date_joined: "2024-01-10T10:00:00Z",
  },
  {
    id: 2,
    driver_code: "D002",
    driver_name: "Fatou Sow",
    email: "fatou@example.com",
    phone_number: "+221700000002",
    vehicle_plate: "RIM-222",
    is_courier: false,
    status: "pending",
    is_active: true,
    is_available: false,
    city_name: "Nouadhibou",
    driver_category_label: "Van",
    total_rides_completed: 5,
    average_rating: null,
    date_joined: thisMonthDate(),
  },
  {
    id: 3,
    driver_code: "D003",
    driver_name: "Moussa Diop",
    email: "moussa@mail.com",
    phone_number: "+221700000003",
    vehicle_plate: "RIM-333",
    is_courier: false,
    status: "rejected",
    is_active: false,
    is_available: false,
    city_name: "Nouakchott",
    driver_category_label: "Sedan",
    // total_rides_completed intentionally ABSENT -> summary must yield null, never 0.
    average_rating: "3.10",
    date_joined: "2024-02-01T10:00:00Z",
  },
  {
    id: 4,
    driver_code: "D004",
    driver_name: "Aicha Kane",
    email: "aicha@mail.com",
    phone_number: "+221700000004",
    vehicle_plate: "RIM-444",
    is_courier: false,
    status: "pending_review",
    is_active: false,
    is_available: true,
    city_name: "Rosso",
    driver_category_label: "Van",
    total_rides_completed: 12,
    average_rating: "4.00",
    date_joined: "2024-03-20T10:00:00Z",
  },
];

describe("isTaxiDriver / naOrNull", () => {
  test("isTaxiDriver is true only when is_courier === false", () => {
    expect(isTaxiDriver({ is_courier: false })).toBe(true);
    expect(isTaxiDriver({ is_courier: true })).toBe(false);
    expect(isTaxiDriver({})).toBe(false);
  });

  test("naOrNull returns null for missing data, value otherwise", () => {
    expect(naOrNull(undefined)).toBeNull();
    expect(naOrNull(null)).toBeNull();
    expect(naOrNull(0)).toBe(0);
    expect(naOrNull("x")).toBe("x");
  });
});

describe("computeDriverSummary", () => {
  test("counts each dimension independently", () => {
    const summary = computeDriverSummary(DRIVERS);
    expect(summary.total).toBe(4);
    expect(summary.approved).toBe(1); // driver 1
    expect(summary.pending).toBe(2); // driver 2 (pending) + driver 4 (pending_review)
    expect(summary.rejected).toBe(1); // driver 3
    expect(summary.suspended).toBe(2); // drivers 3 and 4 (is_active false)
    expect(summary.online).toBe(2); // drivers 1 and 4 (is_available true)
    expect(summary.offline).toBe(2);
    expect(summary.newThisMonth).toBe(1); // driver 2
  });

  test("totalCompletedRides is NULL (never 0) when any driver lacks the key", () => {
    // Driver 3 has no total_rides_completed -> the whole sum is unknown.
    expect(computeDriverSummary(DRIVERS).totalCompletedRides).toBeNull();
  });

  test("totalCompletedRides sums when every driver has the key", () => {
    const complete = DRIVERS.filter((d) => d.id !== 3);
    expect(computeDriverSummary(complete).totalCompletedRides).toBe(40 + 5 + 12);
  });

  test("empty list yields zeros and a 0 ride sum (known, not null)", () => {
    const s = computeDriverSummary([]);
    expect(s).toMatchObject({ total: 0, approved: 0, pending: 0, rejected: 0, suspended: 0, online: 0, offline: 0, newThisMonth: 0 });
    expect(s.totalCompletedRides).toBe(0);
  });
});

describe("filterDrivers", () => {
  test("search matches name, email, phone, driver id, and plate", () => {
    expect(filterDrivers(DRIVERS, { query: "amadou" }).map((d) => d.id)).toEqual([1]);
    expect(filterDrivers(DRIVERS, { query: "fatou@example" }).map((d) => d.id)).toEqual([2]);
    expect(filterDrivers(DRIVERS, { query: "700000003" }).map((d) => d.id)).toEqual([3]);
    expect(filterDrivers(DRIVERS, { query: "d004" }).map((d) => d.id)).toEqual([4]);
    expect(filterDrivers(DRIVERS, { query: "rim-222" }).map((d) => d.id)).toEqual([2]);
  });

  test("verification filter narrows by status", () => {
    expect(filterDrivers(DRIVERS, { verification: "approved" }).map((d) => d.id)).toEqual([1]);
    expect(filterDrivers(DRIVERS, { verification: "rejected" }).map((d) => d.id)).toEqual([3]);
  });

  test("account filter narrows by is_active", () => {
    expect(filterDrivers(DRIVERS, { account: "active" }).map((d) => d.id)).toEqual([1, 2]);
    expect(filterDrivers(DRIVERS, { account: "suspended" }).map((d) => d.id)).toEqual([3, 4]);
  });

  test("online filter narrows by is_available", () => {
    expect(filterDrivers(DRIVERS, { online: "online" }).map((d) => d.id)).toEqual([1, 4]);
    expect(filterDrivers(DRIVERS, { online: "offline" }).map((d) => d.id)).toEqual([2, 3]);
  });

  test("city filter matches exact city name (case-insensitive)", () => {
    expect(filterDrivers(DRIVERS, { city: "nouakchott" }).map((d) => d.id)).toEqual([1, 3]);
  });

  test("vehicleType filter matches category label (case-insensitive)", () => {
    expect(filterDrivers(DRIVERS, { vehicleType: "van" }).map((d) => d.id)).toEqual([2, 4]);
  });

  test("filters compose", () => {
    expect(filterDrivers(DRIVERS, { account: "suspended", online: "online" }).map((d) => d.id)).toEqual([4]);
  });
});

describe("sortDrivers", () => {
  test("descending (newest first) is the default", () => {
    // driver 2 joined this month (newest), then 4 (2024-03), 3 (2024-02), 1 (2024-01).
    expect(sortDrivers(DRIVERS, "desc").map((d) => d.id)).toEqual([2, 4, 3, 1]);
  });

  test("ascending (oldest first)", () => {
    expect(sortDrivers(DRIVERS, "asc").map((d) => d.id)).toEqual([1, 3, 4, 2]);
  });

  test("does not mutate the input array", () => {
    const copy = [...DRIVERS];
    sortDrivers(DRIVERS, "asc");
    expect(DRIVERS).toEqual(copy);
  });
});

describe("status helpers", () => {
  test("verification tones map correctly", () => {
    expect(getVerificationStatus({ status: "approved" }).tone).toBe("success");
    expect(getVerificationStatus({ status: "pending" }).tone).toBe("warning");
    expect(getVerificationStatus({ status: "pending_review" }).tone).toBe("warning");
    expect(getVerificationStatus({ status: "rejected" }).tone).toBe("danger");
    expect(getVerificationStatus({ status: "whatever" }).tone).toBe("neutral");
  });

  test("account status is independent of verification", () => {
    expect(getAccountStatus({ is_active: true })).toMatchObject({ active: true, tone: "success", label: "Active" });
    expect(getAccountStatus({ is_active: false })).toMatchObject({ active: false, tone: "neutral", label: "Suspended" });
  });

  test("online status is its own dimension", () => {
    expect(getOnlineStatus({ is_available: true })).toMatchObject({ online: true, tone: "success", label: "Online" });
    expect(getOnlineStatus({ is_available: false })).toMatchObject({ online: false, tone: "neutral", label: "Offline" });
  });
});
