import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminShellPage } from "../layouts/AdminShell";
import {
  AlertBanner,
  DataTable,
  KPICard,
  formatCurrency,
  formatTimestamp,
} from "../components/library";
import { fetchDeliveryCityAnalytics } from "./deliveryApi";

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

const COLUMNS = [
  { id: "service_city", label: "City" },
  { id: "total", label: "Total" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "active", label: "Active" },
  { id: "exceptions", label: "Exceptions" },
  {
    id: "delivered_revenue",
    label: "Delivered revenue",
    render: (row) =>
      hasValue(row.delivered_revenue) ? formatCurrency(row.delivered_revenue) : "\u2014",
  },
];

/**
 * Delivery city analytics (`/admin/delivery/cities`) — Task 7 §4.
 *
 * Backed by `GET /deliveries/admin/analytics/cities/`, which groups by the *exact stored*
 * `service_city` text and never merges spelling variants. Only cities actually returned by
 * the API are rendered, so the view scales to new cities with no frontend change and never
 * invents a city.
 */
export default function CityAnalytics({ pathname = "/admin/delivery/cities" } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
      const payload = await fetchDeliveryCityAnalytics({
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (!mountedRef.current) return;
      setData(payload);
      setForbidden(false);
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setData(null);
      if (err?.response?.status === 403) {
        // City-scoped refusal (Task 8). The backend is the authority.
        setForbidden(true);
        setError("");
      } else {
        setForbidden(false);
        setError(err?.response?.data?.detail || "Could not load city analytics.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const cities = useMemo(() => (Array.isArray(data?.cities) ? data.cities : []), [data]);
  const totals = data?.totals || null;
  const variants = Array.isArray(data?.possible_name_variants) ? data.possible_name_variants : [];
  const tableError = forbidden ? "" : error;

  return (
    <AdminShellPage pathname={pathname} title="Delivery City Analytics">
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
            Your account is not authorised for this city scope. The backend refused the request
            (HTTP 403); no data was returned.
          </AlertBanner>
        ) : null}

        {error ? (
          <AlertBanner tone="danger" title="City analytics unavailable">
            {error}
          </AlertBanner>
        ) : null}

        <div className="admin-filters">
          <label className="admin-filters__field">
            <span>From</span>
            <input
              type="date"
              aria-label="Date from"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="admin-filters__field">
            <span>To</span>
            <input
              type="date"
              aria-label="Date to"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="admin-lib-btn admin-lib-btn--ghost"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
          >
            Clear dates
          </button>
        </div>

        <section className="dlvops-section" aria-labelledby="city-totals-heading">
          <h2 className="dlvops-section__title" id="city-totals-heading">
            Totals across all returned cities
          </h2>
          <div className="admin-kpi-row">
            <KPICard
              label="Total deliveries"
              value={totals?.total}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
            <KPICard
              label="Completed"
              value={totals?.completed}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
            <KPICard
              label="Cancelled"
              value={totals?.cancelled}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
            <KPICard
              label="Active"
              value={totals?.active}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
            <KPICard
              label="Exceptions"
              value={totals?.exceptions}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
            <KPICard
              label="Delivered revenue"
              value={hasValue(totals?.delivered_revenue) ? totals.delivered_revenue : undefined}
              format={hasValue(totals?.delivered_revenue) ? "currency" : "auto"}
              loading={loading}
              error={tableError}
              onRefresh={load}
            />
          </div>
        </section>

        <section className="dlvops-section" aria-labelledby="city-table-heading">
          <h2 className="dlvops-section__title" id="city-table-heading">
            By city
          </h2>
          <p className="delivery-cell-hint">
            {data?.normalization ||
              "Cities are grouped by their exact stored service_city text and are never merged."}
          </p>
          {variants.length ? (
            <AlertBanner tone="info" title="Possible spelling variants">
              These city names differ only by spelling and are reported separately:{" "}
              {variants.map((group) => group.join(" / ")).join("; ")}.
            </AlertBanner>
          ) : null}
          <DataTable
            title="City analytics"
            columns={COLUMNS}
            rows={cities}
            rowKey="service_city"
            loading={loading}
            error={tableError}
            emptyLabel="No deliveries recorded for this period."
            onRefresh={load}
          />
        </section>
      </div>
    </AdminShellPage>
  );
}
