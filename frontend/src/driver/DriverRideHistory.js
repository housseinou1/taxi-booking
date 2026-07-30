import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import authenticatedApi from "../auth/authenticatedApi";
import { API_URL } from "../apiConfig";
import StatusChip from "../design-system/components/StatusChip";
import { formatMoney } from "../marketConfig";
import { DriverErrorState, DriverLoadingState } from "./ui/DriverAppStates";
import {
  filterDriverHistoryRides,
  printDriverReceipt,
  shareDriverReceipt,
} from "./utils/driverReceipt";
import RouteTimeline, { buildLiveRoutePoints } from "../components/RouteTimeline";
import "./DriverRideHistory.css";

const STATUS_OPTIONS = [
  { key: "", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "in_progress", label: "In Progress" },
];

const SEARCH_DEBOUNCE_MS = 250;

function statusToIntent(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed") return "success";
  if (normalized === "cancelled") return "danger";
  if (normalized === "in_progress") return "warning";
  return "neutral";
}

function formatRideDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEarning(ride) {
  const value = ride?.driver_earning ?? ride?.fare;
  if (value === undefined || value === null) return "—";
  return formatMoney(Number(value));
}

function isInvalidRange(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return false;
  return new Date(dateFrom) > new Date(dateTo);
}

function matchesClientSearch(ride, query) {
  if (!query.trim()) return true;
  if (filterDriverHistoryRides([ride], query).length > 0) return true;
  const rideType = String(ride?.ride_type || "").toLowerCase();
  return rideType.includes(query.trim().toLowerCase());
}

function DetailRow({ label, value }) {
  return (
    <div className="drh-detail-row">
      <dt className="drh-detail-label">{label}</dt>
      <dd className="drh-detail-value">{value}</dd>
    </div>
  );
}

function RideCard({ ride, expanded, detail, loading, error, onExpand, onRetry }) {
  const detailId = `drh-detail-${ride.id}`;
  const detailTitleId = `drh-detail-title-${ride.id}`;
  const display = detail || ride;
  const canReceipt = !!detail && !!ride.id;
  const hasAdditional = !!(
    display.waiting_fee ||
    display.payment_tip_amount ||
    display.bonus
  );
  const titleId = `drh-ride-title-${ride.id}`;

  return (
    <article className="drh-card" aria-labelledby={titleId}>
      <div className="drh-card-top">
        <div className="drh-card-header">
          <time
            id={titleId}
            className="drh-card-date"
            dateTime={ride.completed_at || ride.created_at}
          >
            {formatRideDate(ride.completed_at || ride.created_at)}
          </time>
          <StatusChip intent={statusToIntent(ride.status)} dot>
            {ride.status || "Unknown"}
          </StatusChip>
        </div>
        {ride.rider_name ? (
          <span className="drh-card-rider">Rider: {ride.rider_name}</span>
        ) : null}
      </div>

      <div className="drh-card-route">
        <div className="drh-route-row">
          <span className="drh-dot drh-dot--pickup" aria-hidden="true" />
          <span className="drh-route-text">
            {ride.pickup_address || ride.pickup || "—"}
          </span>
        </div>
        <div className="drh-route-row">
          <span className="drh-dot drh-dot--dropoff" aria-hidden="true" />
          <span className="drh-route-text">
            {ride.destination_address || ride.destination || "—"}
          </span>
        </div>
      </div>

      <div className="drh-card-meta">
        {ride.distance_km != null ? (
          <span className="drh-meta-item">
            {Number(ride.distance_km).toFixed(1)} km
          </span>
        ) : null}
        {ride.ride_type ? (
          <span className="drh-meta-item">{ride.ride_type}</span>
        ) : null}
        {ride.rating != null ? (
          <span className="drh-meta-item">Rating: {ride.rating}</span>
        ) : null}
        {ride.stop_count > 0 ? (
          <span className="drh-meta-item">
            {ride.stop_count} {ride.stop_count === 1 ? "stop" : "stops"}
          </span>
        ) : null}
      </div>

      <div className="drh-card-footer">
        <span className="drh-earning-label">Earning</span>
        <strong className="drh-earning">{formatEarning(display)}</strong>
      </div>

      <div className="drh-card-toggle">
        <button
          type="button"
          className="drh-detail-toggle"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${expanded ? "Hide" : "Show"} details for ride on ${formatRideDate(ride.completed_at || ride.created_at)}`}
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>

      {expanded ? (
        <div id={detailId} className="drh-detail" aria-live="polite">
          {loading ? (
            <div className="drh-detail-loading">Loading details…</div>
          ) : error ? (
            <div className="drh-detail-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="drh-detail-retry"
                onClick={onRetry}
              >
                Try again
              </button>
            </div>
          ) : (
            <div
              className="drh-detail-body"
              aria-labelledby={detailTitleId}
            >
              <h3 id={detailTitleId} className="drh-detail-title">
                Ride details
              </h3>

              <section className="drh-detail-timeline" aria-label="Trip route">
                <RouteTimeline
                  points={buildLiveRoutePoints({
                    ...display,
                    pickup:
                      display.pickup_address || display.pickup || "Pickup",
                    destination:
                      display.destination_address ||
                      display.destination ||
                      "Destination",
                  })}
                  compact
                />
              </section>

              <section className="drh-detail-section">
                <h4 className="drh-detail-section-title">Trip</h4>
                <dl className="drh-detail-grid">
                  <DetailRow
                    label="Fare"
                    value={
                      display.fare != null
                        ? formatMoney(Number(display.fare))
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Distance"
                    value={
                      display.distance_km != null
                        ? `${Number(display.distance_km).toFixed(1)} km`
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Status"
                    value={display.status || "—"}
                  />
                  <DetailRow
                    label="Ride type"
                    value={display.ride_type || "—"}
                  />
                  <DetailRow
                    label="Created"
                    value={formatRideDate(display.created_at)}
                  />
                  <DetailRow
                    label="Completed"
                    value={formatRideDate(display.completed_at)}
                  />
                </dl>
              </section>

              <section className="drh-detail-section">
                <h4 className="drh-detail-section-title">Driver payout</h4>
                <dl className="drh-detail-grid">
                  <DetailRow
                    label="Earning"
                    value={
                      display.driver_earning != null
                        ? formatMoney(Number(display.driver_earning))
                        : "—"
                    }
                  />
                  {display.app_fee ? (
                    <DetailRow
                      label="Commission"
                      value={formatMoney(Number(display.app_fee))}
                    />
                  ) : null}
                </dl>
              </section>

              {hasAdditional ? (
                <section className="drh-detail-section">
                  <h4 className="drh-detail-section-title">
                    Additional amounts
                  </h4>
                  <dl className="drh-detail-grid">
                    {display.waiting_fee ? (
                      <DetailRow
                        label="Waiting fee"
                        value={formatMoney(Number(display.waiting_fee))}
                      />
                    ) : null}
                    {display.payment_tip_amount ? (
                      <DetailRow
                        label="Tip"
                        value={formatMoney(Number(display.payment_tip_amount))}
                      />
                    ) : null}
                    {display.bonus ? (
                      <DetailRow
                        label="Bonus"
                        value={formatMoney(Number(display.bonus))}
                      />
                    ) : null}
                  </dl>
                </section>
              ) : null}

              {display.notes ? (
                <section className="drh-detail-section">
                  <h4 className="drh-detail-section-title">Notes</h4>
                  <p className="drh-detail-notes">{display.notes}</p>
                </section>
              ) : null}

              <div className="drh-receipt-actions">
                <button
                  type="button"
                  className="drh-receipt-btn"
                  onClick={() => printDriverReceipt(display)}
                  disabled={!canReceipt}
                  aria-label="Print receipt"
                >
                  <span className="drh-receipt-icon" aria-hidden="true">
                    🖨
                  </span>
                  Print receipt
                </button>
                <button
                  type="button"
                  className="drh-receipt-btn"
                  onClick={() => shareDriverReceipt(display)}
                  disabled={!canReceipt}
                  aria-label="Share receipt"
                >
                  <span className="drh-receipt-icon" aria-hidden="true">
                    ↗
                  </span>
                  Share receipt
                </button>
              </div>

              {!canReceipt ? (
                <p className="drh-receipt-disabled">
                  Receipt actions are available once details load.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function DriverRideHistory() {
  const [rides, setRides] = useState([]);
  const [page, setPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [validation, setValidation] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimeoutRef = useRef(null);

  const [expandedId, setExpandedId] = useState(null);
  const [detailById, setDetailById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [detailErrorById, setDetailErrorById] = useState({});

  const fetchRides = useCallback(
    async ({ showLoading = true } = {}) => {
      if (isInvalidRange(dateFrom, dateTo)) {
        setValidation("From date cannot be later than To date.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setValidation("");
      setError("");
      if (showLoading) setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams({ page: String(page) });
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);

        const response = await authenticatedApi.get(
          `${API_URL}/drivers/me/rides/?${params.toString()}`
        );
        const data = response?.data ?? {};

        const results = Array.isArray(data.results)
          ? data.results
          : Array.isArray(data)
          ? data
          : [];
        const total = Number(data.total_pages) || 1;
        const current = Number(data.current_page) || page;

        setRides(results);
        setTotalPages(total);
        setCurrentPage(current);
        setHasPrevious(current > 1);
        setHasNext(current < total);
      } catch (err) {
        setError("Could not load ride history. Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, statusFilter, dateFrom, dateTo]
  );

  const fetchDetail = useCallback(async (rideId) => {
    setDetailLoadingId(rideId);
    setDetailErrorById((prev) => ({ ...prev, [rideId]: "" }));
    try {
      const response = await authenticatedApi.get(`${API_URL}/rides/${rideId}/`);
      setDetailById((prev) => ({ ...prev, [rideId]: response?.data ?? null }));
    } catch (err) {
      setDetailErrorById((prev) => ({
        ...prev,
        [rideId]: "Could not load ride details. Please try again.",
      }));
    } finally {
      setDetailLoadingId(null);
    }
  }, []);

  const handleExpand = useCallback(
    (rideId) => {
      setExpandedId((current) => {
        if (current === rideId) return null;
        if (!detailById[rideId]) {
          fetchDetail(rideId);
        }
        return rideId;
      });
    },
    [detailById, fetchDetail]
  );

  useEffect(() => {
    fetchRides({ showLoading: true });
  }, [fetchRides]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      window.clearTimeout(searchTimeoutRef.current);
    }
    if (!search.trim()) {
      setDebouncedSearch("");
      return;
    }
    searchTimeoutRef.current = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  const handleStatusChange = (key) => {
    setStatusFilter(key);
    setPage(1);
  };

  const handleDateFrom = (value) => {
    setDateFrom(value);
    setPage(1);
  };

  const handleDateTo = (value) => {
    setDateTo(value);
    setPage(1);
  };

  const handleSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const clearSearch = () => {
    setSearch("");
    setPage(1);
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    setExpandedId(null);
  };

  const hasActiveFilters =
    statusFilter || dateFrom || dateTo || search || debouncedSearch;

  const visibleRides = useMemo(() => {
    if (!debouncedSearch) return rides;
    return rides.filter((ride) => matchesClientSearch(ride, debouncedSearch));
  }, [rides, debouncedSearch]);

  const visibleCount = visibleRides.length;

  const activeFilterLabels = useMemo(() => {
    const labels = [];
    if (statusFilter) labels.push(`Status: ${statusFilter}`);
    if (dateFrom) labels.push(`From: ${dateFrom}`);
    if (dateTo) labels.push(`To: ${dateTo}`);
    if (search) labels.push(`Search: "${search}"`);
    return labels;
  }, [statusFilter, dateFrom, dateTo, search]);

  const emptyTitle = useMemo(() => {
    if (debouncedSearch) return "No rides match the current search.";
    if (statusFilter || dateFrom || dateTo) return "No rides match these filters.";
    return "No rides yet.";
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  const emptyMessage = useMemo(() => {
    if (debouncedSearch) return "Try a different search term.";
    if (statusFilter || dateFrom || dateTo) return "Try adjusting your filters.";
    return "Your completed and cancelled rides will appear here.";
  }, [debouncedSearch, statusFilter, dateFrom, dateTo]);

  if (loading && rides.length === 0) {
    return (
      <main className="drh-page" aria-label="Ride history">
        <header className="drh-hero">
          <div className="drh-hero-text">
            <h1 className="drh-title">Ride History</h1>
            <p className="drh-subtitle">Track every trip, fare, and reward.</p>
          </div>
        </header>
        <DriverLoadingState title="Loading ride history..." />
      </main>
    );
  }

  if (error && rides.length === 0) {
    return (
      <main className="drh-page" aria-label="Ride history">
        <header className="drh-hero">
          <div className="drh-hero-text">
            <h1 className="drh-title">Ride History</h1>
            <p className="drh-subtitle">Track every trip, fare, and reward.</p>
          </div>
        </header>
        <DriverErrorState
          title="Could not load ride history"
          message={error}
          actionLabel="Try again"
          onAction={() => fetchRides({ showLoading: true })}
        />
      </main>
    );
  }

  return (
    <main className="drh-page" aria-label="Ride history">
      <header className="drh-hero">
        <div className="drh-hero-text">
          <h1 className="drh-title">Ride History</h1>
          <p className="drh-subtitle">Track every trip, fare, and reward.</p>
        </div>
        {visibleCount > 0 ? (
          <span className="drh-total" aria-live="polite">
            {visibleCount} {visibleCount === 1 ? "ride" : "rides"}
          </span>
        ) : null}
      </header>

      <section className="drh-filters" aria-label="Filter rides">
        <div className="drh-search">
          <label className="drh-filter-label" htmlFor="drh-search-input">
            Search rides
          </label>
          <div className="drh-search-field">
            <input
              id="drh-search-input"
              type="search"
              className="drh-search-input"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Pickup, destination, rider, status, type"
              aria-label="Search rides"
            />
            {search ? (
              <button
                type="button"
                className="drh-clear-search"
                onClick={clearSearch}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>
        </div>

        <div className="drh-filter-group">
          <span className="drh-filter-label" id="drh-status-label">
            Status
          </span>
          <div className="drh-status-list" role="group" aria-labelledby="drh-status-label">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`drh-status-btn${statusFilter === option.key ? " is-selected" : ""}`}
                aria-pressed={statusFilter === option.key}
                onClick={() => handleStatusChange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="drh-filter-group">
          <div className="drh-date-field">
            <label className="drh-filter-label" htmlFor="drh-date-from">
              From
            </label>
            <input
              id="drh-date-from"
              type="date"
              className="drh-date-input"
              value={dateFrom}
              onChange={(e) => handleDateFrom(e.target.value)}
              aria-describedby={validation ? "drh-validation" : undefined}
            />
          </div>
          <div className="drh-date-field">
            <label className="drh-filter-label" htmlFor="drh-date-to">
              To
            </label>
            <input
              id="drh-date-to"
              type="date"
              className="drh-date-input"
              value={dateTo}
              onChange={(e) => handleDateTo(e.target.value)}
              aria-describedby={validation ? "drh-validation" : undefined}
            />
          </div>
        </div>

        {validation ? (
          <div id="drh-validation" className="drh-validation" role="alert" aria-live="assertive">
            {validation}
          </div>
        ) : null}

        {hasActiveFilters ? (
          <div className="drh-filters-toolbar">
            <div className="drh-active-filters" aria-live="polite">
              {activeFilterLabels.map((label) => (
                <span key={label} className="drh-filter-chip">
                  {label}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="drh-clear-filters"
              onClick={clearFilters}
              aria-label="Clear all filters"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </section>

      {refreshing ? (
        <div className="drh-refreshing" role="status" aria-live="polite">
          Updating…
        </div>
      ) : null}

      {error && rides.length > 0 ? (
        <div className="drh-inline-error" role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}

      <section className="drh-results" aria-label="Ride results">
        <p className="drh-count" aria-live="polite" aria-atomic="true">
          Showing {visibleCount} {visibleCount === 1 ? "ride" : "rides"} · Page {currentPage} of {totalPages}
        </p>

        {visibleRides.length === 0 ? (
          <div className="drh-empty" role="status" aria-live="polite">
            <span className="drh-empty-icon" aria-hidden="true">
              🚗
            </span>
            <p className="drh-empty-title">{emptyTitle}</p>
            <p className="drh-empty-message">{emptyMessage}</p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="drh-clear-filters"
                onClick={clearFilters}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="drh-list">
            {visibleRides.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                expanded={expandedId === ride.id}
                detail={detailById[ride.id]}
                loading={detailLoadingId === ride.id}
                error={detailErrorById[ride.id]}
                onExpand={() => handleExpand(ride.id)}
                onRetry={() => fetchDetail(ride.id)}
              />
            ))}
          </div>
        )}

        {visibleRides.length > 0 ? (
          <nav className="drh-pagination" aria-label="Pagination">
            <button
              type="button"
              className="drh-page-btn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!hasPrevious}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="drh-page-info" aria-live="polite">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="drh-page-btn"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext}
              aria-label="Next page"
            >
              Next
            </button>
          </nav>
        ) : null}
      </section>
    </main>
  );
}
