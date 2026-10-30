import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import EmployeeDirectory from "../EmployeeDirectory";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => {
  const actual = jest.requireActual("../employeesApi");
  return {
    ...actual,
    fetchEmployees: jest.fn(),
    fetchPhoto: jest.fn(),
  };
});

// DataTable's export toolbar reads usePermissions via AdminActionGuard — mock
// the permission context so the directory can render without a provider.
jest.mock("../../permissions/PermissionContext", () => ({
  usePermissions: () => ({
    permissions: { role: "hr_staff", modules: ["employees"], actions: {}, feature_flags: {} },
    canView: () => true,
    canAction: () => true,
    canApprove: () => true,
    canExport: () => true,
  }),
}));

const SAMPLE = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      employee_number: "YAM110001LAR",
      full_name: "Jane Doe",
      department: "Operations",
      job_title: "Agent",
      employment_status: "active",
      employment_start_date: "2026-01-15",
      date_of_birth: "1990-05-05",
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  api.fetchEmployees.mockResolvedValue({ data: SAMPLE });
  // Photo always 404 → placeholder, must not break the row.
  api.fetchPhoto.mockRejectedValue({ response: { status: 404 } });
});

test("renders employee rows", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  expect(screen.getByText("YAM110001LAR")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Operations" })).toBeInTheDocument();
});

test("does not render date of birth anywhere", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  await screen.findByText("Jane Doe");
  expect(screen.queryByText("1990-05-05")).not.toBeInTheDocument();
  expect(screen.queryByText(/birth/i)).not.toBeInTheDocument();
});

test("photo 404 renders placeholder without crashing the row", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  await screen.findByText("Jane Doe");
  await waitFor(() => expect(api.fetchPhoto).toHaveBeenCalled());
  expect(screen.getAllByLabelText("No photo").length).toBeGreaterThan(0);
});

test("initial load requests page 1 at default page size", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  await screen.findByText("Jane Doe");
  expect(api.fetchEmployees).toHaveBeenCalledWith(
    expect.objectContaining({ page: 1, page_size: 25 })
  );
});

test("employment status filter is passed to the API", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  await screen.findByText("Jane Doe");

  const statusSelect = screen.getByLabelText("Employment status");
  fireEvent.change(statusSelect, { target: { value: "suspended" } });

  await waitFor(() =>
    expect(api.fetchEmployees).toHaveBeenLastCalledWith(
      expect.objectContaining({ employment_status: "suspended" })
    )
  );
});

test("search is debounced and passed as the search param", async () => {
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={jest.fn()} />);
  await screen.findByText("Jane Doe");

  const searchInput = screen.getByPlaceholderText(/Search name/i);
  fireEvent.change(searchInput, { target: { value: "jane" } });

  await waitFor(
    () =>
      expect(api.fetchEmployees).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "jane" })
      ),
    { timeout: 2000 }
  );
});

test("row action selects the employee", async () => {
  const onSelect = jest.fn();
  render(<EmployeeDirectory notify={jest.fn()} onSelectEmployee={onSelect} />);
  await screen.findByText("Jane Doe");
  fireEvent.click(screen.getByRole("button", { name: /view profile/i }));
  expect(onSelect).toHaveBeenCalledWith("YAM110001LAR");
});
