import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EmployeeProfile from "../EmployeeProfile";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => {
  const actual = jest.requireActual("../employeesApi");
  return {
    ...actual,
    fetchEmployee: jest.fn(),
    updateEmployee: jest.fn(),
    changeEmploymentStatus: jest.fn(),
    fetchCards: jest.fn(),
    fetchPhoto: jest.fn(),
    fetchEmployeeAuditTrail: jest.fn(),
  };
});

const EMPLOYEE = {
  employee_number: "YAM110001LAR",
  full_name: "Jane Doe",
  department: "Operations",
  job_title: "Agent",
  employment_status: "active",
  employment_start_date: "2026-01-15",
  date_of_birth: "1990-05-05",
};

beforeEach(() => {
  jest.clearAllMocks();
  api.fetchEmployee.mockResolvedValue({ data: EMPLOYEE });
  api.fetchCards.mockResolvedValue({ data: [] });
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
  api.fetchEmployeeAuditTrail.mockResolvedValue({ data: { count: 0, results: [] } });
});

function renderProfile(overrides = {}) {
  return render(
    <EmployeeProfile
      employeeNumber="YAM110001LAR"
      canManage={false}
      canAdminister={false}
      notify={jest.fn()}
      onBack={jest.fn()}
      {...overrides}
    />
  );
}

test("renders profile fields but never the date of birth", async () => {
  renderProfile();
  expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  expect(screen.getByText("YAM110001LAR")).toBeInTheDocument();
  expect(screen.getByText("Operations")).toBeInTheDocument();
  expect(screen.queryByText("1990-05-05")).not.toBeInTheDocument();
});

test("edit submit sends only permitted fields (no employee_number / employment_status)", async () => {
  api.updateEmployee.mockResolvedValue({ data: { ...EMPLOYEE, job_title: "Lead Agent" } });
  renderProfile();
  await screen.findByText("Jane Doe");

  fireEvent.click(screen.getByRole("button", { name: /edit record/i }));
  fireEvent.change(screen.getByLabelText(/job title/i), { target: { value: "Lead Agent" } });
  fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

  await waitFor(() => expect(api.updateEmployee).toHaveBeenCalled());
  const [num, payload] = api.updateEmployee.mock.calls[0];
  expect(num).toBe("YAM110001LAR");
  expect(payload).not.toHaveProperty("employee_number");
  expect(payload).not.toHaveProperty("employment_status");
  expect(payload.job_title).toBe("Lead Agent");
});

test("status change control is hidden for non-manager", async () => {
  renderProfile({ canManage: false });
  await screen.findByText("Jane Doe");
  expect(screen.queryByText(/change employment status/i)).not.toBeInTheDocument();
});

test("status change control is shown and posts for a manager", async () => {
  api.changeEmploymentStatus.mockResolvedValue({ data: {} });
  renderProfile({ canManage: true });
  await screen.findByText("Jane Doe");

  expect(screen.getByText(/change employment status/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /update status/i }));
  await waitFor(() => expect(api.changeEmploymentStatus).toHaveBeenCalledWith(
    "YAM110001LAR",
    expect.objectContaining({ employment_status: "active" })
  ));
});

// ── Phase 6: DOB capability gating + audit trail ─────────────────────────────

test("shows a restricted placeholder instead of DOB without the capability", async () => {
  renderProfile({ canViewDob: false });
  await screen.findByText("Jane Doe");

  expect(screen.getByText("Date of birth")).toBeInTheDocument();
  expect(screen.getByText(/Restricted — Administrator tier only/)).toBeInTheDocument();
  expect(screen.queryByText("1990-05-05")).not.toBeInTheDocument();
  expect(screen.queryByText("05/05/1990")).not.toBeInTheDocument();
});

test("renders DOB read-only when the capability is granted", async () => {
  renderProfile({ canViewDob: true });
  await screen.findByText("Jane Doe");

  expect(screen.getByText("Date of birth")).toBeInTheDocument();
  expect(screen.queryByText(/Restricted/)).not.toBeInTheDocument();
  // The stored DOB (1990-05-05) is rendered for capability holders.
  expect(screen.getByText(/1990/)).toBeInTheDocument();
});

test("edit form pre-fills DOB only for capability holders", async () => {
  renderProfile({ canViewDob: true });
  await screen.findByText("Jane Doe");

  fireEvent.click(screen.getByRole("button", { name: /edit record/i }));
  expect(screen.getByLabelText(/date of birth/i)).toHaveValue("1990-05-05");
});

test("edit form does not pre-fill DOB without the capability", async () => {
  renderProfile({ canViewDob: false });
  await screen.findByText("Jane Doe");

  fireEvent.click(screen.getByRole("button", { name: /edit record/i }));
  expect(screen.getByLabelText(/date of birth/i)).toHaveValue("");
});

test("audit trail is not requested for non-administrators", async () => {
  renderProfile({ canAdminister: false });
  await screen.findByText("Jane Doe");

  expect(api.fetchEmployeeAuditTrail).not.toHaveBeenCalled();
  expect(screen.queryByText(/account activity/i)).not.toBeInTheDocument();
});

test("administrators see the employee audit trail", async () => {
  api.fetchEmployeeAuditTrail.mockResolvedValue({
    data: {
      count: 1,
      results: [
        {
          id: 7,
          action: "admin_action",
          event: "employee.register",
          entity_type: "employee",
          entity_id: "YAM110001LAR",
          summary: "Registered employee YAM110001LAR",
          actor_email: "hr@yala.test",
          created_at: "2026-03-01T10:00:00Z",
        },
      ],
    },
  });

  renderProfile({ canAdminister: true });
  await screen.findByText("Jane Doe");

  await waitFor(() => expect(api.fetchEmployeeAuditTrail).toHaveBeenCalledWith("YAM110001LAR"));
  expect(await screen.findByText("Registered employee YAM110001LAR")).toBeInTheDocument();
  expect(screen.getByText(/employee.register/)).toBeInTheDocument();
});

test("audit trail shows an honest empty state", async () => {
  renderProfile({ canAdminister: true });
  await screen.findByText("Jane Doe");

  expect(
    await screen.findByText(/No activity recorded for this employee yet/i)
  ).toBeInTheDocument();
});

test("audit trail failure does not break the profile", async () => {
  api.fetchEmployeeAuditTrail.mockRejectedValue({
    response: { data: { detail: "audit unavailable" } },
  });

  renderProfile({ canAdminister: true });
  await screen.findByText("Jane Doe");

  expect(await screen.findByText("audit unavailable")).toBeInTheDocument();
  expect(screen.getByText("ID card management")).toBeInTheDocument();
});

