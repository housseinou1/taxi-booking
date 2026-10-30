import authenticatedApi from "../../../auth/authenticatedApi";
import { API_URL } from "../../../apiConfig";
import {
  fetchEmployees,
  registerEmployee,
  fetchEmployee,
  updateEmployee,
  changeEmploymentStatus,
  fetchCards,
  issueCard,
  renewCard,
  replaceCard,
  activateCard,
  deactivateCard,
  revokeCard,
  fetchPhoto,
  uploadPhoto,
  fetchCardQr,
  fetchEmployeeAuditTrail,
  canViewEmployeeDob,
  deriveEmployeeTier,
  resolveCardDisplayStatus,
} from "../employeesApi";

jest.mock("../../../auth/authenticatedApi", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

const BASE = `${API_URL}/employees`;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("employeesApi URLs and params", () => {
  test("fetchEmployees hits list endpoint with params", () => {
    const params = { search: "ab", department: "Ops", employment_status: "active", page: 2, page_size: 25 };
    fetchEmployees(params);
    expect(authenticatedApi.get).toHaveBeenCalledWith(`${BASE}/`, { params });
  });

  test("fetchEmployee uses the employee_number string in the path", () => {
    fetchEmployee("YAM110001LAR");
    expect(authenticatedApi.get).toHaveBeenCalledWith(`${BASE}/YAM110001LAR/`);
  });

  test("fetchCards / fetchPhoto target the right paths", () => {
    fetchCards("YAM1");
    expect(authenticatedApi.get).toHaveBeenCalledWith(`${BASE}/YAM1/cards/`);
    fetchPhoto("YAM1");
    expect(authenticatedApi.get).toHaveBeenCalledWith(`${BASE}/YAM1/photo/`, { responseType: "blob" });
  });

  test("card lifecycle endpoints", () => {
    issueCard("E1");
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/issue/`);
    renewCard("E1");
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/renew/`);
    replaceCard("E1", { reason: "lost" });
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/replace/`, { reason: "lost" });
    activateCard("E1", 9);
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/9/activate/`);
    deactivateCard("E1", 9);
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/9/deactivate/`);
    revokeCard("E1", 9, { reason: "fraud" });
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/cards/9/revoke/`, { reason: "fraud" });
  });

  test("changeEmploymentStatus posts the status body", () => {
    changeEmploymentStatus("E1", { employment_status: "suspended", note: "x" });
    expect(authenticatedApi.post).toHaveBeenCalledWith(`${BASE}/E1/status/`, {
      employment_status: "suspended",
      note: "x",
    });
  });
});

describe("register/update never carry server-managed fields", () => {
  test("registerEmployee omits employee_number and employment_status", () => {
    registerEmployee({
      full_name: "Jane",
      date_of_birth: "1990-01-01",
      department: "Ops",
      job_title: "Agent",
      employment_start_date: "2026-01-01",
      employee_number: "SHOULD_NOT_SEND",
      employment_status: "active",
    });
    const [, payload] = authenticatedApi.post.mock.calls[0];
    expect(payload).not.toHaveProperty("employee_number");
    expect(payload).not.toHaveProperty("employment_status");
    expect(payload).toEqual({
      full_name: "Jane",
      date_of_birth: "1990-01-01",
      department: "Ops",
      job_title: "Agent",
      employment_start_date: "2026-01-01",
    });
  });

  test("registerEmployee coerces empty dates to null", () => {
    registerEmployee({ full_name: "Jane", date_of_birth: "", employment_start_date: "" });
    const [, payload] = authenticatedApi.post.mock.calls[0];
    expect(payload.date_of_birth).toBeNull();
    expect(payload.employment_start_date).toBeNull();
  });

  test("updateEmployee omits employee_number and employment_status", () => {
    updateEmployee("E1", {
      full_name: "Jane",
      department: "Ops",
      employee_number: "NOPE",
      employment_status: "terminated",
    });
    const [url, payload] = authenticatedApi.patch.mock.calls[0];
    expect(url).toBe(`${BASE}/E1/`);
    expect(payload).not.toHaveProperty("employee_number");
    expect(payload).not.toHaveProperty("employment_status");
  });
});

describe("uploadPhoto multipart", () => {
  test("sends FormData with a photo field", () => {
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    uploadPhoto("E1", file);
    const [url, body, config] = authenticatedApi.post.mock.calls[0];
    expect(url).toBe(`${BASE}/E1/photo/`);
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("photo")).toBe(file);
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
  });
});

describe("deriveEmployeeTier", () => {
  test("elevated / ceo get both tiers", () => {
    expect(deriveEmployeeTier({ elevated: true })).toEqual({ canManage: true, canAdminister: true, viewDob: true, derivable: true });
    expect(deriveEmployeeTier({ role: "ceo" })).toEqual({ canManage: true, canAdminister: true, viewDob: true, derivable: true });
  });

  test("hr_manager role grants manage but not administer", () => {
    const tier = deriveEmployeeTier({ role: "hr_manager" });
    expect(tier).toEqual({ canManage: true, canAdminister: false, viewDob: false, derivable: true });
  });

  test("administrator role grants both", () => {
    const tier = deriveEmployeeTier({ role: "administrator" });
    expect(tier).toEqual({ canManage: true, canAdminister: true, viewDob: true, derivable: true });
  });

  test("group signals are recognised", () => {
    const tier = deriveEmployeeTier({ role: "hr_staff", groups: ["hr_admin"] });
    expect(tier.canManage).toBe(true);
    expect(tier.canAdminister).toBe(true);
    expect(tier.derivable).toBe(true);
  });

  test("unknown role is not derivable: buttons shown, 403 relied on", () => {
    const tier = deriveEmployeeTier({ role: "hr_staff" });
    expect(tier).toEqual({ canManage: true, canAdminister: true, viewDob: false, derivable: false });
  });

  test("null permissions deny everything", () => {
    expect(deriveEmployeeTier(null)).toEqual({ canManage: false, canAdminister: false, viewDob: false, derivable: false });
  });

  // Phase 5.5: explicit capability flags are preferred over the role heuristic.
  test("explicit employees.* flags are authoritative — staff: view only", () => {
    const tier = deriveEmployeeTier({
      role: "hr",
      actions: {
        "employees.view": true,
        "employees.manage_cards": false,
        "employees.administer": false,
      },
    });
    expect(tier).toEqual({ canManage: false, canAdminister: false, viewDob: false, derivable: true });
  });

  test("explicit flags — manager can manage, not administer", () => {
    const tier = deriveEmployeeTier({
      role: "hr",
      actions: { "employees.manage_cards": true, "employees.administer": false },
    });
    expect(tier).toEqual({ canManage: true, canAdminister: false, viewDob: false, derivable: true });
  });

  test("explicit flags — administrator gets both (DOB still fail-closed without the flag)", () => {
    const tier = deriveEmployeeTier({
      role: "hr",
      actions: { "employees.manage_cards": true, "employees.administer": true },
    });
    // employees.view_dob is absent here, so DOB stays hidden: the capability is
    // the only thing that reveals it.
    expect(tier).toEqual({ canManage: true, canAdminister: true, viewDob: false, derivable: true });
  });

  // Phase 6: DOB is gated by the explicit employees.view_dob capability.
  test("employees.view_dob drives viewDob (fail-closed when absent)", () => {
    const granted = deriveEmployeeTier({
      role: "hr",
      actions: {
        "employees.manage_cards": false,
        "employees.administer": false,
        "employees.view_dob": true,
      },
    });
    expect(granted.viewDob).toBe(true);
    expect(granted.canManage).toBe(false);

    const absent = deriveEmployeeTier({
      role: "hr",
      actions: { "employees.manage_cards": true, "employees.administer": false },
    });
    expect(absent.viewDob).toBe(false);
  });

  test("canViewEmployeeDob prefers the explicit capability and defaults closed", () => {
    expect(canViewEmployeeDob(null)).toBe(false);
    expect(canViewEmployeeDob({})).toBe(false);
    expect(
      canViewEmployeeDob({ actions: { "employees.view_dob": false, "employees.administer": true } })
    ).toBe(false);
    expect(canViewEmployeeDob({ actions: { "employees.view_dob": true } })).toBe(true);
    // No capability in the payload at all -> fall back to the tier derivation.
    expect(canViewEmployeeDob({ role: "hr_staff" })).toBe(false);
    expect(canViewEmployeeDob({ elevated: true })).toBe(true);
  });

  test("explicit flags override a would-be heuristic (staff flags beat unknown role)", () => {
    // Without flags this role would be non-derivable (buttons shown); with
    // explicit staff-only flags the actions are correctly hidden.
    const tier = deriveEmployeeTier({
      role: "hr_staff",
      actions: { "employees.manage_cards": false, "employees.administer": false },
    });
    expect(tier.canManage).toBe(false);
    expect(tier.canAdminister).toBe(false);
    expect(tier.derivable).toBe(true);
  });
});

describe("ID-card QR endpoint", () => {
  test("fetchCardQr targets the authenticated QR path as a blob", () => {
    fetchCardQr("YAM110001LAR", 7);
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      `${API_URL}/employees/YAM110001LAR/cards/7/qr/`,
      { params: {}, responseType: "blob" }
    );
  });
});

describe("employee audit trail endpoint", () => {
  test("fetchEmployeeAuditTrail targets the per-employee audit path", () => {
    fetchEmployeeAuditTrail("YAM110001LAR");
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      `${API_URL}/employees/YAM110001LAR/audit/`,
      { params: {} }
    );
  });

  test("passes a limit param through", () => {
    fetchEmployeeAuditTrail("YAM110001LAR", { limit: 10 });
    expect(authenticatedApi.get).toHaveBeenCalledWith(
      `${API_URL}/employees/YAM110001LAR/audit/`,
      { params: { limit: 10 } }
    );
  });
});

describe("resolveCardDisplayStatus (client-side expiring-soon)", () => {
  const now = new Date("2026-10-15T00:00:00Z");

  test("valid card far from expiry → Active", () => {
    const result = resolveCardDisplayStatus({ status: "valid", expires_at: "2027-10-15" }, now);
    expect(result).toEqual({ label: "Active", tone: "success" });
  });

  test("valid card within 60 days → Expiring Soon (display only)", () => {
    const result = resolveCardDisplayStatus({ status: "valid", expires_at: "2026-11-30" }, now);
    expect(result).toEqual({ label: "Expiring Soon", tone: "warning" });
  });

  test("non-valid statuses map directly", () => {
    expect(resolveCardDisplayStatus({ status: "expired" }, now)).toEqual({ label: "Expired", tone: "danger" });
    expect(resolveCardDisplayStatus({ status: "revoked" }, now)).toEqual({ label: "Revoked", tone: "danger" });
    expect(resolveCardDisplayStatus({ status: "replaced" }, now)).toEqual({ label: "Replaced", tone: "neutral" });
    expect(resolveCardDisplayStatus({ status: "deactivated" }, now)).toEqual({ label: "Deactivated", tone: "neutral" });
  });
});
