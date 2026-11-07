import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import EmployeeRegistrationForm from "../EmployeeRegistrationForm";
import * as api from "../employeesApi";

jest.mock("../employeesApi", () => {
  const actual = jest.requireActual("../employeesApi");
  return {
    ...actual,
    registerEmployee: jest.fn(),
    uploadPhoto: jest.fn().mockResolvedValue({ data: { ok: true } }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  global.URL.createObjectURL = jest.fn(() => "blob:id-photo-preview");
  global.URL.revokeObjectURL = jest.fn();
});

function pickRequiredIdPhoto() {
  const input = screen.getByLabelText(/employee id photograph/i);
  const file = new File(["photo-bytes"], "id.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
}

test("the form has no employee_number field", () => {
  render(<EmployeeRegistrationForm notify={jest.fn()} onRegistered={jest.fn()} />);
  expect(document.querySelector("#employee_number")).toBeNull();
  expect(document.querySelector('[name="employee_number"]')).toBeNull();
  expect(screen.queryByLabelText(/employee number/i)).not.toBeInTheDocument();
  // The auto-generation note is shown instead.
  expect(screen.getByText(/assigned automatically/i)).toBeInTheDocument();
});

test("required full name blocks submit", async () => {
  render(<EmployeeRegistrationForm notify={jest.fn()} onRegistered={jest.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /register employee/i }));
  expect(await screen.findByText(/full name is required/i)).toBeInTheDocument();
  expect(api.registerEmployee).not.toHaveBeenCalled();
});

test("successful submit never sends employee_number or employment_status", async () => {
  api.registerEmployee.mockResolvedValue({ data: { employee_number: "YAM110001LAR" } });
  const notify = jest.fn();
  const onRegistered = jest.fn();
  render(<EmployeeRegistrationForm notify={notify} onRegistered={onRegistered} />);

  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane Doe" } });
  fireEvent.change(screen.getByLabelText(/department/i), { target: { value: "Ops" } });
  pickRequiredIdPhoto();
  fireEvent.click(screen.getByRole("button", { name: /register employee/i }));

  await waitFor(() => expect(api.registerEmployee).toHaveBeenCalled());
  const [payload] = api.registerEmployee.mock.calls[0];
  expect(payload).not.toHaveProperty("employee_number");
  expect(payload).not.toHaveProperty("employment_status");
  expect(payload.full_name).toBe("Jane Doe");

  await waitFor(() => expect(onRegistered).toHaveBeenCalledWith("YAM110001LAR"));
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ tone: "success" })
  );
});

test("backend 400 field errors render inline", async () => {
  api.registerEmployee.mockRejectedValue({
    response: { status: 400, data: { department: ["This field is required."] } },
  });
  render(<EmployeeRegistrationForm notify={jest.fn()} onRegistered={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane" } });
  pickRequiredIdPhoto();
  fireEvent.click(screen.getByRole("button", { name: /register employee/i }));
  expect(await screen.findByText(/this field is required/i)).toBeInTheDocument();
});

test("403 surfaces a not-authorized message", async () => {
  api.registerEmployee.mockRejectedValue({ response: { status: 403, data: {} } });
  const notify = jest.fn();
  render(<EmployeeRegistrationForm notify={notify} onRegistered={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Jane" } });
  pickRequiredIdPhoto();
  fireEvent.click(screen.getByRole("button", { name: /register employee/i }));
  await waitFor(() => expect(notify).toHaveBeenCalledWith("danger", expect.stringMatching(/not authorized/i)));
});
