import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { DataTable, KPICard, StatusChip } from "../components/library";
import { fetchAdminCouriers } from "./deliveryApi";

const PAGE_SIZE = 25;

export const QUEUE_OPTIONS = [
  { value: "all", label: "All couriers" },
  { value: "pending", label: "Pending approval" },
  { value: "approved", label: "Approved" },
  { value: "suspended", label: "Suspended" },
  { value: "online", label: "Online now" },
  { value: "rejected", label: "Rejected" },
];

export const VEHICLE_OPTIONS = [
  { value: "", label: "All vehicles" },
  { value: "motorcycle", label: "Motorcycle" },
  { value: "bicycle", label: "Bicycle" },
  { value: "car", label: "Car" },
  { value: "van", label: "Van" },
  { value: "truck", label: "Truck" },
];

function statusTone(status) {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "suspended") return "danger";
  if (status === "pending" || status === "pending_review") return "info";
  return "neutral";
}

export const COURIER_COLUMNS = [
  { id: "name", label: "Courier", sortable: true },
  {
    id: "courier_status",
    label: "Status",
    sortable: true,
    render: (row) => (
      <StatusChip
        label={row.courier_status_label || row.courier_status}
        tone={statusTone(row.courier_status)}
      />
    ),
  },
  { id: "vehicle_type", label: "Vehicle" },
  { id: "city_name", label: "City" },
  {
    id: "courier_online",
    label: "Online",
    render: (row) => (row.courier_online ? "Yes" : "No"),
  },
  {
    id: "signature_complete",
    label: "Signature",
    render: (row) => (row.signature_complete ? "Signed" : "Missing"),
  },
  {
    id: "documents_pending",
    label: "Docs pending",
    render: (row) => `${row.documents_pending} of ${row.documents_total}`,
  },
  { id: "total_deliveries_completed", label: "Deliveries", sortable: true },
  { id: "delivery_rating", label: "Rating", sortable: true },
];

function Filters({ filters, onChange, onClear }) {
  return (
    <div className="admin-filters">
      <label className="admin-filters__field">
        Queue
        <select value={filters.queue} onChange={(e) => onChange("queue", e.target.value)}>
          {QUEUE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        Vehicle
        <select
          value={filters.vehicle_type}
          onChange={(e) => onChange("vehicle_type", e.target.value)}
        >
          {VEHICLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

export default function CouriersManagement({ pathname = "/admin/delivery/couriers" } = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ queue: "all", vehicle_type: "" });
  const [sort, setSort] = useState({ key: "", direction: "asc" });
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminCouriers({
        page,
        page_size: PAGE_SIZE,
        search,
        queue: filters.queue === "all" ? "" : filters.queue,
        vehicle_type: filters.vehicle_type,
        ordering: sort.key ? (sort.direction === "desc" ? `-${sort.key}` : sort.key) : "newest",
      });
      setRows(data.results || []);
      setSummary(data.summary || null);
      setMeta({
        count: data.count || 0,
        page: data.page || 1,
        total_pages: data.total_pages || 1,
        page_size: data.page_size || PAGE_SIZE,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load couriers.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const openCourier = useCallback((id) => {
    if (!id) return;
    window.location.assign(`/admin/delivery/couriers/${id}`);
  }, []);

  const onFilterChange = (key, value) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const filtersNode = useMemo(
    () => (
      <Filters
        filters={filters}
        onChange={onFilterChange}
        onClear={() => {
          setPage(1);
          setFilters({ queue: "all", vehicle_type: "" });
          setSearch("");
        }}
      />
    ),
    [filters]
  );

  return (
    <AdminShellPage pathname={pathname} title="Courier Management">
      <div className="admin-delivery">
        <div className="admin-kpi-row">
          <KPICard
            label="Total couriers"
            value={summary?.total}
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Approved"
            value={summary?.approved}
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Pending approval"
            value={summary?.pending}
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Online now"
            value={summary?.online}
            loading={loading}
            error={error}
            onRefresh={load}
          />
          <KPICard
            label="Suspended"
            value={summary?.suspended}
            loading={loading}
            error={error}
            onRefresh={load}
          />
        </div>

        <DataTable
          title="Couriers"
          columns={COURIER_COLUMNS}
          rows={rows}
          rowKey="id"
          loading={loading}
          error={error}
          emptyLabel="No couriers match these filters."
          serverMode
          searchValue={search}
          onSearchChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
          searchPlaceholder="Search name, email, phone or plate…"
          sortKey={sort.key}
          sortDirection={sort.direction}
          onSortChange={(key, direction) => setSort({ key, direction })}
          page={meta.page}
          pageSize={meta.page_size}
          total={meta.count}
          onPageChange={setPage}
          onRefresh={load}
          filters={filtersNode}
          rowActions={(row) => (
            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => openCourier(row.id)}
            >
              View
            </button>
          )}
        />
      </div>
    </AdminShellPage>
  );
}

