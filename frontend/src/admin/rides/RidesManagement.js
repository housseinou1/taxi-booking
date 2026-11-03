import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { DataTable, KPICard, formatMoneyOrDash } from "../components/library";
import RideDetailsDrawer from "./RideDetailsDrawer";
import { fetchAdminRideDetail, fetchAdminRides } from "./ridesApi";

const PAGE_SIZE = 25;

export const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "requested", label: "Requested" },
  { value: "scheduled", label: "Scheduled" },
  { value: "driver_arriving", label: "Driver arriving" },
  { value: "driver_arrived", label: "Driver arrived" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "rider_no_show", label: "Rider no-show" },
];

export const RIDE_TYPE_OPTIONS = [
  { value: "", label: "All ride types" },
  { value: "Regular", label: "Regular" },
  { value: "XL", label: "XL" },
  { value: "Comfort", label: "Comfort" },
  { value: "Share", label: "Share" },
];

export function statusTone(value) {
  if (value === "completed") return "success";
  if (value === "cancelled" || value === "rider_no_show") return "danger";
  if (["in_progress", "driver_arriving", "driver_arrived"].includes(value)) return "info";
  return "neutral";
}

export const RIDE_COLUMNS = [
  { id: "id", label: "Ride", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "ride_type", label: "Type" },
  { id: "pickup", label: "Pickup" },
  { id: "destination", label: "Drop-off" },
  { id: "rider_name", label: "Rider" },
  { id: "driver_name", label: "Driver" },
  { id: "fare", label: "Fare", sortable: true, render: (row) => formatMoneyOrDash(row.fare) },
  {
    id: "created_at",
    label: "Requested",
    sortable: true,
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "N/A"),
  },
];

function Filters({ filters, onChange, onClear }) {
  return (
    <div className="admin-filters">
      <label className="admin-filters__field">
        Status
        <select value={filters.status} onChange={(e) => onChange("status", e.target.value)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        Ride type
        <select value={filters.ride_type} onChange={(e) => onChange("ride_type", e.target.value)}>
          {RIDE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="admin-filters__field">
        From
        <input type="date" value={filters.date_from} onChange={(e) => onChange("date_from", e.target.value)} />
      </label>
      <label className="admin-filters__field">
        To
        <input type="date" value={filters.date_to} onChange={(e) => onChange("date_to", e.target.value)} />
      </label>
      <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

export default function RidesManagement({ pathname = "/admin/rides" } = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", ride_type: "", date_from: "", date_to: "" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "created_at", direction: "desc" });
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState({
    open: false, ride: null, loading: false, error: "", id: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ordering = `${sort.direction === "desc" ? "-" : ""}${sort.key}`;
      const data = await fetchAdminRides({
        page, page_size: PAGE_SIZE, q: search, ordering, ...filters,
      });
      setRows(data.results || []);
      setSummary(data.summary || null);
      setMeta({
        count: data.count || 0,
        page: data.page || page,
        total_pages: data.total_pages || 1,
        page_size: data.page_size || PAGE_SIZE,
      });
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Could not load rides.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, sort.key, sort.direction, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const openRide = useCallback(async (id) => {
    setDrawer({ open: true, ride: null, loading: true, error: "", id });
    try {
      const ride = await fetchAdminRideDetail(id);
      setDrawer({ open: true, ride, loading: false, error: "", id });
    } catch (err) {
      setDrawer({
        open: true, ride: null, loading: false,
        error: err?.response?.data?.detail || "Could not load ride details.", id,
      });
    }
  }, []);

  const closeDrawer = () =>
    setDrawer({ open: false, ride: null, loading: false, error: "", id: null });

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
          setFilters({ status: "", ride_type: "", date_from: "", date_to: "" });
          setSearch("");
        }}
      />
    ),
    [filters]
  );

  // Completed fare for the current filter. Rendered through the shared
  // decimal-safe formatter: a real amount is thousands-grouped and rounded to 2
  // decimals, and an absent value is the platform's em dash rather than "N/A"
  // (which collided with the "no data" wording used elsewhere).
  const fareValue = formatMoneyOrDash(summary?.completed_fare);

  return (
    <AdminShellPage pathname={pathname} title="Rides Management">
      <div className="admin-rides">
        <div className="admin-kpi-row">
          <KPICard label="Total rides" value={summary?.total} loading={loading} error={error} onRefresh={load} />
          <KPICard label="Active now" value={summary?.active} loading={loading} error={error} onRefresh={load} />
          <KPICard label="Completed" value={summary?.completed} loading={loading} error={error} onRefresh={load} />
          <KPICard label="Cancelled" value={summary?.cancelled} loading={loading} error={error} onRefresh={load} />
          <KPICard
            label="Completed fare"
            value={fareValue}
            subtitle="Real completed-ride fares for the current filter"
            loading={loading}
            error={error}
            onRefresh={load}
          />
        </div>

        <DataTable
          title="All rides"
          columns={RIDE_COLUMNS}
          rows={rows}
          rowKey="id"
          loading={loading}
          error={error}
          emptyLabel="No rides match these filters."
          serverMode
          searchValue={search}
          onSearchChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
          searchPlaceholder="Search ride ID, pickup, drop-off, rider or driver…"
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
              onClick={() => openRide(row.id)}
            >
              View
            </button>
          )}
        />

        <RideDetailsDrawer
          ride={drawer.ride}
          loading={drawer.loading}
          error={drawer.error}
          onClose={closeDrawer}
          onRetry={() => drawer.id && openRide(drawer.id)}
        />
      </div>
    </AdminShellPage>
  );
}

