import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  DataTable,
  StatusChip,
  FilterBar,
  Select,
  formatTimestamp,
} from "../components/library";
import {
  fetchEmployees,
  EMPLOYMENT_STATUS_TONES,
  EMPLOYMENT_STATUS_OPTIONS,
} from "./employeesApi";
import EmployeePhotoThumb from "./EmployeePhotoThumb";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

const DEPARTMENT_PLACEHOLDER = "All departments";
const STATUS_PLACEHOLDER = "All statuses";

function dateOnly(iso) {
  if (!iso) return "—";
  // Reuse the shared timestamp formatter but strip the time portion.
  const formatted = formatTimestamp(iso);
  return formatted.split(",")[0] || formatted;
}

export default function EmployeeDirectory({ reloadKey = 0, notify, onSelectEmployee }) {
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");

  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  // Debounce the free-text search.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 whenever a filter/search changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, department, employmentStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        page_size: PAGE_SIZE,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (department) params.department = department;
      if (employmentStatus) params.employment_status = employmentStatus;

      const response = await fetchEmployees(params);
      const data = response.data || {};
      setRows(Array.isArray(data.results) ? data.results : []);
      setCount(typeof data.count === "number" ? data.count : 0);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You are not authorized to view the employee directory.");
        notifyRef.current?.("danger", "You are not authorized to view the employee directory.");
      } else {
        setError(err?.response?.data?.detail || err?.message || "Failed to load employees");
      }
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, department, employmentStatus]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  // Build department filter options from the current page of results.
  const departmentOptions = Array.from(
    new Set(rows.map((row) => row.department).filter(Boolean))
  ).map((dept) => ({ value: dept, label: dept }));

  const columns = [
    {
      id: "photo",
      label: "Photo",
      render: (row) => (
        <EmployeePhotoThumb employeeNumber={row.employee_number} />
      ),
    },
    { id: "employee_number", label: "Employee #" },
    { id: "full_name", label: "Full name" },
    { id: "department", label: "Department" },
    { id: "job_title", label: "Job title" },
    {
      id: "employment_status",
      label: "Status",
      render: (row) => (
        <StatusChip
          label={row.employment_status || "—"}
          tone={EMPLOYMENT_STATUS_TONES[row.employment_status] || "neutral"}
        />
      ),
    },
    {
      id: "employment_start_date",
      label: "Start date",
      render: (row) => dateOnly(row.employment_start_date),
    },
    // date_of_birth is intentionally NOT a column here.
    // DOB is sensitive HR data with a backend field-level permission
    // (employees.view_dob, Administrator tier). List views deliberately never
    // carry it; it is shown only in the employee profile, to capability holders.
  ];

  return (
    <section aria-label="Employee directory">
      <FilterBar
        onReset={() => {
          setSearch("");
          setDepartment("");
          setEmploymentStatus("");
        }}
      >
        <label className="admin-field emp-toolbar__search">
          <span className="admin-field__label">Search</span>
          <input
            type="search"
            className="admin-lib-select"
            value={search}
            placeholder="Search name, number, department…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Select
          label="Department"
          value={department}
          onChange={setDepartment}
          options={departmentOptions}
          placeholder={DEPARTMENT_PLACEHOLDER}
        />
        <Select
          label="Employment status"
          value={employmentStatus}
          onChange={setEmploymentStatus}
          options={EMPLOYMENT_STATUS_OPTIONS}
          placeholder={STATUS_PLACEHOLDER}
        />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey="employee_number"
        loading={loading}
        error={error}
        emptyLabel="No employees found"
        searchable={false}
        serverMode
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
        onPageChange={setPage}
        onRefresh={load}
        rowActions={(row) => (
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={() => onSelectEmployee?.(row.employee_number)}
          >
            View profile
          </button>
        )}
      />
    </section>
  );
}
