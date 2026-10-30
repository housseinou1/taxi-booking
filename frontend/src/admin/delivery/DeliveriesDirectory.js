import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  DataTable,
  KPICard,
  StatusChip,
  formatCurrency,
  formatTimestamp,
} from "../components/library";
import DeliveryDetailsDrawer from "./DeliveryDetailsDrawer";
import {
  DIRECTORY_ORDERING_OPTIONS,
  DIRECTORY_STATUS_OPTIONS,
  fetchAdminDeliveries,
} from "./deliveryApi";

const PAGE_SIZE = 25;

/** `0` is a real value; only null / undefined / "" mean "not provided". */
function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function statusTone(status) {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "delivery_exception") return "danger";
  if (status === "in_transit" || status === "picked_up" || status === "accepted") return "info";
  return "neutral";
}

const buildColumns = (onDetails) => [
  { id: "id", label: "Delivery" },
  {
    id: "status",
    label: "Status",
    render: (row) => (
      <StatusChip label={row.status_label || row.status} tone={statusTone(row.status)} />
    ),
  },
  { id: "service_category", label: "Category" },
  { id: "service_city", label: "City" },
  { id: "customer_name", label: "Customer" },
  {
    id: "courier_name",
    label: "Courier",
    render: (row) => row.courier_name || "Unassigned",
  },
  {
    id: "route",
    label: "Route",
    render: (row) => `${row.pickup || "?"} \u2192 ${row.destination || "?"}`,
  },
  {
    id: "fare",
    label: "Fare",
    render: (row) => (hasValue(row.fare) ? formatCurrency(row.fare) : "\u2014"),
  },
  {
    id: "payment_status",
    label: "Payment",
    render: (row) => row.payment_status || "\u2014",
  },
  {
    id: "created_at",
    label: "Created",
    render: (row) => formatTimestamp(row.created_at),
  },
  {
    id: "actions",
    label: "",
    render: (row) => (
      <button
        type="button"
        className="admin-lib-btn admin-lib-btn--ghost"
        onClick={() => onDetails(row.id)}
      >
        Details
      </button>
    ),
  },
];

const EMPTY_FILTERS = {
  search: "",
  status: "all",
  category: "",
  city: "",
  date_from: "",
  date_to: "",
  ordering: "newest",
};

/**
 * Delivery Directory (`/admin/delivery/directory`) — Task 7.
 *
 * Server-side paginated/filtered view over the read-only administrative directory endpoint.
 * The backend is the access authority: a 403 is surfaced as an explicit access-denied state,
 * which is how the city-permission foundation (Task 8) will refuse out-of-scope cities. The
 * frontend never filters results for security.
 */
export default function DeliveriesDirectory({ pathname = "/admin/delivery/directory" } = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminDeliveries({ ...filters, page, page_size: pageSize });
      if (!mountedRef.current) return;
      setRows(Array.isArray(data?.results) ? data.results : []);
      setSummary(data?.summary || null);
      setMeta({
        count: data?.count ?? 0,
        page: data?.page ?? page,
        total_pages: data?.total_pages ?? 1,
        page_size: data?.page_size ?? pageSize,
      });
      setForbidden(false);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      const statusCode = err?.response?.status;
      setRows([]);
      setSummary(null);
      if (statusCode === 403) {
        // City-scoped refusal (Task 8). Backend is the authority; show it plainly.
        setForbidden(true);
        setError("");
      } else {
        setForbidden(false);
        setError(err?.response?.data?.detail || "Could not load the delivery directory.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  const updateFilter = useCallback((patch) => {
    setPage(1);
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const columns = useMemo(() => buildColumns(setSelectedId), []);

  const byStatus = summary?.by_status || null;

  return (
    <AdminShellPage pathname={pathname} title="Delivery Directory">
      <div className="admin-delivery">
        <div className="dlvops-toolbar">
          <p className="dlvops-toolbar__stamp">
            {lastUpdated
              ? `Last updated ${formatTimestamp(lastUpdated.toISOString())}`
              : "Not loaded yet"}
          </p>
          <button type="button" className="admin-lib-btn" onClick={load} disabled={loading}>
            {loading ? "Refreshing\u2026" : "Refresh"}
          </button>
        </div>

        {forbidden ? (
          <AlertBanner tone="warning" title="City access denied">
            Your account is not authorised for the requested city scope. The backend refused the
            request (HTTP 403); no data was returned.
          </AlertBanner>
        ) : null}

        {error ? (
          <AlertBanner tone="danger" title="Delivery directory unavailable">
            {error}
          </AlertBanner>
        ) : null}

        <section className="dlvops-section" aria-labelledby="directory-summary-heading">
          <h2 className="dlvops-section__title" id="directory-summary-heading">
            Filtered summary
          </h2>
          <div className="admin-kpi-row">
            <KPICard
              label="Deliveries"
              value={summary?.total}
              subtitle="Matching the current filters"
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
            <KPICard
              label="Active"
              value={summary?.active}
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
            <KPICard
              label="Pending (requested)"
              value={byStatus?.requested}
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
            <KPICard
              label="Delivered"
              value={byStatus?.delivered}
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
            <KPICard
              label="Cancelled"
              value={byStatus?.cancelled}
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
            <KPICard
              label="Delivered revenue"
              value={hasValue(summary?.delivered_revenue) ? summary.delivered_revenue : undefined}
              format={hasValue(summary?.delivered_revenue) ? "currency" : "auto"}
              loading={loading}
              error={forbidden ? "" : error}
              onRefresh={load}
            />
          </div>
        </section>


        <section className="dlvops-section" aria-labelledby="directory-table-heading">
          <h2 className="dlvops-section__title" id="directory-table-heading">
            Deliveries
          </h2>

          <div className="admin-filters">
            <label className="admin-filters__field">
              <span>Status</span>
              <select
                aria-label="Status"
                value={filters.status}
                onChange={(event) => updateFilter({ status: event.target.value })}
              >
                {DIRECTORY_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-filters__field">
              <span>Category</span>
              <input
                type="text"
                aria-label="Category"
                placeholder="e.g. package"
                value={filters.category}
                onChange={(event) => updateFilter({ category: event.target.value })}
              />
            </label>

            <label className="admin-filters__field">
              <span>City</span>
              <input
                type="text"
                aria-label="City"
                placeholder="Exact stored city"
                value={filters.city}
                onChange={(event) => updateFilter({ city: event.target.value })}
              />
            </label>

            <label className="admin-filters__field">
              <span>From</span>
              <input
                type="date"
                aria-label="Date from"
                value={filters.date_from}
                onChange={(event) => updateFilter({ date_from: event.target.value })}
              />
            </label>

            <label className="admin-filters__field">
              <span>To</span>
              <input
                type="date"
                aria-label="Date to"
                value={filters.date_to}
                onChange={(event) => updateFilter({ date_to: event.target.value })}
              />
            </label>

            <label className="admin-filters__field">
              <span>Sort</span>
              <select
                aria-label="Sort"
                value={filters.ordering}
                onChange={(event) => updateFilter({ ordering: event.target.value })}
              >
                {DIRECTORY_ORDERING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="admin-lib-btn admin-lib-btn--ghost"
              onClick={() => {
                setPage(1);
                setFilters(EMPTY_FILTERS);
              }}
            >
              Clear filters
            </button>
          </div>

          <DataTable
            title="Delivery directory"
            columns={columns}
            rows={rows}
            rowKey="id"
            loading={loading}
            error={forbidden ? "" : error}
            emptyLabel="No deliveries match these filters."
            serverMode
            searchValue={filters.search}
            onSearchChange={(value) => updateFilter({ search: value })}
            searchPlaceholder="Search by delivery ID, customer or courier\u2026"
            page={meta.page}
            pageSize={meta.page_size}
            total={meta.count}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
            onRefresh={load}
          />
        </section>

        {selectedId ? (
          <DeliveryDetailsDrawer deliveryId={selectedId} onClose={() => setSelectedId(null)} />
        ) : null}
      </div>
    </AdminShellPage>
  );
}
