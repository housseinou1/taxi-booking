import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import { DataTable, KPICard, StatusChip } from "../components/library";
import { fetchAdminMerchants } from "./deliveryApi";

const PAGE_SIZE = 25;

export const MERCHANT_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
];

export const MERCHANT_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "restaurant", label: "Restaurant" },
  { value: "fast_food", label: "Fast Food" },
  { value: "cafe", label: "Cafe" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "grocery", label: "Grocery Store" },
  { value: "supermarket", label: "Supermarket" },
  { value: "water_supplier", label: "Water Supplier" },
  { value: "electronics", label: "Electronics Shop" },
  { value: "clothing", label: "Clothing Store" },
  { value: "market", label: "Local Market" },
  { value: "business_supplier", label: "Business Supplier" },
];

function statusTone(status) {
  if (status === "approved") return "success";
  if (status === "rejected" || status === "suspended") return "danger";
  if (status === "pending") return "info";
  return "neutral";
}

export const MERCHANT_COLUMNS = [
  { id: "business_name", label: "Business", sortable: true },
  { id: "owner_name", label: "Owner" },
  { id: "owner_email", label: "Owner email" },
  {
    id: "merchant_type",
    label: "Type",
    render: (row) => row.merchant_type_label || row.merchant_type,
  },
  { id: "city", label: "City" },
  {
    id: "status",
    label: "Status",
    sortable: true,
    render: (row) => <StatusChip label={row.status} tone={statusTone(row.status)} />,
  },
  { id: "total_orders", label: "Orders", sortable: true },
  { id: "rating", label: "Rating", sortable: true },
  {
    id: "created_at",
    label: "Joined",
    sortable: true,
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : "N/A"),
  },
];

/**
 * Read-only merchant directory inside the Delivery module.
 *
 * Management (approve / suspend / documents) stays in the merchant platform and
 * the security review endpoints — this page only lists and filters.
 */
export default function MerchantsDirectory({ pathname = "/admin/delivery/merchants" } = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ count: 0, page: 1, total_pages: 1, page_size: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ status: "", merchant_type: "" });
  const [sort, setSort] = useState({ key: "", direction: "asc" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAdminMerchants({
        page,
        page_size: PAGE_SIZE,
        search,
        status: filters.status,
        merchant_type: filters.merchant_type,
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
      setError(err?.response?.data?.detail || "Could not load merchants.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, filters, sort]);

  useEffect(() => {
    load();
  }, [load]);

  const filtersNode = useMemo(
    () => (
      <div className="admin-filters">
        <label className="admin-filters__field">
          Status
          <select
            value={filters.status}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, status: e.target.value }));
            }}
          >
            {MERCHANT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-filters__field">
          Type
          <select
            value={filters.merchant_type}
            onChange={(e) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, merchant_type: e.target.value }));
            }}
          >
            {MERCHANT_TYPE_OPTIONS.map((option) => (
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
            setFilters({ status: "", merchant_type: "" });
            setSearch("");
          }}
        >
          Clear filters
        </button>
      </div>
    ),
    [filters]
  );


  return (
    <AdminShellPage pathname={pathname} title="Merchant Directory">
      <div className="admin-delivery">
        <div className="admin-kpi-row">
          <KPICard
            label="Merchants"
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
            label="Pending"
            value={summary?.pending}
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

        <p className="delivery-cell-hint">
          Read-only directory. Approvals, documents and account changes are handled in the{" "}
          <a href="/admin/merchants">Merchant Platform Center</a>.
        </p>

        <DataTable
          title="Merchants"
          columns={MERCHANT_COLUMNS}
          rows={rows}
          rowKey="id"
          loading={loading}
          error={error}
          emptyLabel="No merchants match these filters."
          serverMode
          searchValue={search}
          onSearchChange={(value) => {
            setPage(1);
            setSearch(value);
          }}
          searchPlaceholder="Search business, owner, email or phone…"
          sortKey={sort.key}
          sortDirection={sort.direction}
          onSortChange={(key, direction) => setSort({ key, direction })}
          page={meta.page}
          pageSize={meta.page_size}
          total={meta.count}
          onPageChange={setPage}
          onRefresh={load}
          filters={filtersNode}
        />
      </div>
    </AdminShellPage>
  );
}

