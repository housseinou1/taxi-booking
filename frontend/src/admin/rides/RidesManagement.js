import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  DataTable,
  KPICard,
  SearchableSelect,
  StatusChip,
  formatMoneyOrDash,
} from "../components/library";
import { apiErrorMessage } from "../layouts/errors/apiErrorMessage";
import RideDetailsDrawer from "./RideDetailsDrawer";
import { fetchAdminRideDetail, fetchAdminRides } from "./ridesApi";

const PAGE_SIZE = 25;

/**
 * Sortable columns, mirroring the backend's ADMIN_RIDE_SORT_FIELDS allow-list
 * (rides/views.py). The backend silently falls back to -created_at for any key it
 * does not know, so advertising a sort it cannot perform would be a fabricated
 * affordance: the header would toggle while the rows never re-order. Only these
 * four columns are marked sortable, and each maps 1:1 to a server field.
 */
export const SERVER_SORT_FIELDS = ["created_at", "fare", "status", "completed_at", "distance_km"];

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
  // `id` is deliberately NOT sortable: the backend's sort allow-list has no "id"
  // key, so a sort toggle here would silently no-op. See SERVER_SORT_FIELDS.
  { id: "id", label: "Ride ID", render: (row) => `#${row.id}` },
  {
    id: "created_at",
    label: "Date & time",
    sortable: true,
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "N/A"),
  },
  {
    id: "status",
    label: "Ride status",
    sortable: true,
    render: (row) => (row.status ? <StatusChip label={row.status} tone={statusTone(row.status)} /> : "N/A"),
  },
  { id: "ride_type", label: "Ride category" },
  { id: "pickup", label: "Pickup" },
  { id: "destination", label: "Destination" },
  { id: "rider_name", label: "Rider" },
  { id: "driver_name", label: "Driver" },
  {
    id: "distance_km",
    label: "Distance",
    sortable: true,
    render: (row) =>
      row.distance_km === null || row.distance_km === undefined
        ? formatMoneyOrDash(null)
        : `${row.distance_km} km`,
  },
  { id: "fare", label: "Fare", sortable: true, render: (row) => formatMoneyOrDash(row.fare) },
  {
    // `app_fee` is the platform commission on this ride — exposed by
    // AdminRideListSerializer and previously omitted from the table.
    id: "app_fee",
    label: "Commission",
    render: (row) => formatMoneyOrDash(row.app_fee),
  },
  {
    // Null means "no Payment row exists for this ride yet" — rendered as the
    // platform em dash, never as "unpaid", which would be a fabricated claim.
    id: "payment_status",
    label: "Payment status",
    render: (row) => row.payment_status || formatMoneyOrDash(null),
  },
  {
    id: "completed_at",
    label: "Completed",
    sortable: true,
    render: (row) => (row.completed_at ? new Date(row.completed_at).toLocaleString() : "N/A"),
  },
];

/**
 * Filters that the Ride Management list endpoint genuinely supports.
 *
 * Backend contract (rides/views.py → admin_rides_list):
 *   status      validated against Ride.STATUS choices
 *   ride_type   validated against the ride-type choices
 *   q           free-text across id / pickup / destination / rider / driver
 *   date_from   YYYY-MM-DD (created_at__date__gte)
 *   date_to     YYYY-MM-DD (created_at__date__lte)
 *   ordering    one of ADMIN_RIDE_SORT_FIELDS
 *   page / page_size
 *
 * NOT supported by the backend — deliberately absent rather than faked, because a
 * control that silently does nothing is worse than no control. Each needs a
 * server-side filter added first (tracked as a backend dependency):
 *   city / wilaya     no city scoping on the admin ride queryset
 *   driver            no driver scoping
 *   rider             no rider scoping (rider history exists, but per-rider only)
 *   payment status    payment_status is a per-row SerializerMethodField, not a
 *                     queryset field, so it cannot be filtered or sorted in SQL
 *   cancellation reason  not exposed as a filter
 */
export function Filters({ filters, onChange, onClear }) {
  const statusOptions = STATUS_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    // "" is the "no filter" sentinel; give it a label that reads correctly in the
    // trigger rather than an empty box.
    description: o.value === "" ? "Show every ride status" : undefined,
  }));

  const typeOptions = RIDE_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    description: o.value === "" ? "Show every ride category" : undefined,
  }));

  return (
    <div className="admin-filters">
      <SearchableSelect
        label="Ride status"
        icon="●"
        value={filters.status}
        onChange={(value) => onChange("status", value ?? "")}
        options={statusOptions}
        placeholder="All statuses"
        searchPlaceholder="Search status…"
      />

      <SearchableSelect
        label="Ride category"
        icon="▤"
        value={filters.ride_type}
        onChange={(value) => onChange("ride_type", value ?? "")}
        options={typeOptions}
        placeholder="All ride categories"
        searchPlaceholder="Search category…"
      />

      <label className="admin-filters__field">
        <span className="admin-filters__label">From (date range)</span>
        <input
          type="date"
          value={filters.date_from}
          max={filters.date_to || undefined}
          onChange={(e) => onChange("date_from", e.target.value)}
        />
      </label>

      <label className="admin-filters__field">
        <span className="admin-filters__label">To (date range)</span>
        <input
          type="date"
          value={filters.date_to}
          min={filters.date_from || undefined}
          onChange={(e) => onChange("date_to", e.target.value)}
        />
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
      // Route every failure through the shared mapper so a 401, a 403, a 404
      // (missing backend route) and an unreachable API each produce a distinct,
      // actionable message. The previous inline `err.message` leaked the raw
      // axios string ("Request failed with status code 404"), which told the
      // operator nothing about what to do next.
      setError(apiErrorMessage(err, { resource: "rides", action: "load" }));
      setRows([]);
      setSummary(null);
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
        error: apiErrorMessage(err, { resource: "ride details", action: "load" }),
        id,
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

  // Ride Status Monitoring: the real per-status counts the list endpoint returns in
  // `summary`. Clicking one applies the matching server-side `status` filter, so the
  // strip is a genuine navigation aid rather than decoration. Only statuses the
  // backend actually reports are shown.
  const statusMonitor = [
    { key: "", label: "All rides", value: summary?.total, filterable: true },
    // "Active now" is a multi-status aggregate (requested, scheduled,
    // driver_arriving, driver_arrived, in_progress) that the backend reports as one
    // number. It cannot map to a single `status` filter, so it is informational
    // rather than clickable — a button here would apply the wrong filter.
    { key: null, label: "Active now", value: summary?.active, filterable: false },
    { key: "completed", label: "Completed", value: summary?.completed, filterable: true },
    { key: "cancelled", label: "Cancelled", value: summary?.cancelled, filterable: true },
  ];

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (search ? 1 : 0);

  return (
    <AdminShellPage pathname={pathname} title="Rides Management">
      <div className="admin-rides">
        {/* Ride Management Overview */}
        <section className="admin-section" aria-label="Ride management overview">
          <p className="admin-section__intro">
            Ride directory, live status monitoring and fare/commission inspection for
            every ride on the platform. Read-only: this backend exposes the admin ride
            list and ride detail as GET-only endpoints, so no administrative action on
            this page mutates a ride.
          </p>
        </section>

        {/* Ride Statistics */}
        <section className="admin-section" aria-label="Ride statistics">
          <h2 className="admin-section__title">Ride statistics</h2>
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
        </section>

        {/* Ride Status Monitoring */}
        <section className="admin-section" aria-label="Ride status monitoring">
          <h2 className="admin-section__title">Ride status monitoring</h2>
          <div className="admin-status-strip">
            {statusMonitor.map((entry) => {
              const active = entry.filterable && filters.status === entry.key;
              const valueText =
                entry.value === null || entry.value === undefined
                  ? formatMoneyOrDash(null)
                  : entry.value;
              // A count of 0 is a real value and must print as 0, never as an em dash.
              if (!entry.filterable) {
                return (
                  <div
                    key={entry.label}
                    className="admin-status-strip__item admin-status-strip__item--static"
                    aria-label={`${entry.label}: ${valueText} (aggregate, not a single status filter)`}
                  >
                    <span className="admin-status-strip__label">{entry.label}</span>
                    <span className="admin-status-strip__value">{valueText}</span>
                  </div>
                );
              }
              return (
                <button
                  key={entry.label}
                  type="button"
                  className={`admin-status-strip__item ${
                    active ? "admin-status-strip__item--active" : ""
                  }`}
                  aria-pressed={active}
                  onClick={() => onFilterChange("status", entry.key)}
                >
                  <span className="admin-status-strip__label">{entry.label}</span>
                  <span className="admin-status-strip__value">{valueText}</span>
                </button>
              );
            })}
          </div>
          {activeFilterCount > 0 ? (
            <p className="admin-section__note">
              {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} applied. Statistics
              above describe the filtered set.
            </p>
          ) : null}
        </section>

        {/* Ride Directory */}
        <DataTable
          title="Ride directory"
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
          searchPlaceholder="Search ride ID, pickup, destination, rider or driver…"
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
              aria-label={`View details for ride ${row.id}`}
            >
              View details
            </button>
          )}
        />

        {/* Backend dependencies — stated in the UI so the gap is visible to an
            operator instead of silently missing. */}
        <section className="admin-section admin-section--muted" aria-label="Unavailable filters">
          <h2 className="admin-section__title">Filters awaiting backend support</h2>
          <p className="admin-section__note">
            City / wilaya, Driver, Rider, Payment status and Cancellation reason cannot
            be filtered yet: the admin ride list endpoint accepts only status, ride
            type, free-text search, date range and ordering. These controls are
            intentionally omitted rather than shown as no-ops.
          </p>
          <p className="admin-section__note">
            <strong>Known data issue affecting the Ride category filter:</strong> the
            stored <code>ride_type</code> values are inconsistent — both
            <code> regular</code> and <code>Regular</code> exist in the database — while
            the list endpoint only accepts the capitalised spelling
            (<code>Regular</code>, <code>XL</code>, <code>Comfort</code>,
            <code>Share</code>) and rejects the lowercase form with HTTP 400. Selecting
            a category therefore returns a subset of the matching rides rather than all
            of them. This is a backend data-normalisation problem, not a display bug,
            and it is reported to the backend owner.
          </p>
        </section>

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

