import React, { useCallback, useEffect, useMemo, useState } from "react";

import authenticatedApi from "../auth/authenticatedApi";
import { API_URL } from "../apiConfig";
import StatusChip from "../design-system/components/StatusChip";
import { formatMoney } from "../marketConfig";
import { DriverErrorState, DriverLoadingState } from "./ui/DriverAppStates";
import { printDriverReceipt, shareDriverReceipt } from "./utils/driverReceipt";
import "./DriverRideHistory.css";

const STATUS_OPTIONS = [
  { key: "", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "in_progress", label: "In Progress" },
];

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

function DetailRow({ label, value }) {
  return (
    <div className="drh-detail-row">
      <span className="drh-detail-label">{label}</span>
      <span className="drh-detail-value">{value}</span>
    </div>
  );
}

function RideCard({ ride, expanded, detail, loading, error, onExpand, onRetry }) {
  const detailId = `drh-detail-${ride.id}`;
  const display = detail || ride;
  const canReceipt = !!detail && !!ride.id;

  return (
    <article className="drh-card" key={ride.id}>
      <div className="drh-card-header">
        <time className="drh-card-date" dateTime={ride.completed_at || ride.created_at}>
          {formatRideDate(ride.completed_at || ride.created_at)}
        </time>
        <StatusChip intent={statusToIntent(ride.status)} dot>
          {ride.status || "Unknown"}
        </StatusChip>
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
        {ride.rider_name ? (
          <span className="drh-meta-item">Rider: {ride.rider_name}</span>
        ) : null}
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
            <div className="drh-detail-body">
              <h3 className="drh-detail-title">Ride details</h3>
              <div className="drh-detail-grid">
                <DetailRow
                  label="Pickup"
                  value={display.pickup_address || display.pickup || "—"}
                />
                <DetailRow
                  label="Destination"
                  value={display.destination_address || display.destination || "—"}
                />
                <DetailRow
                  label="Fare"
                  value={display.fare != null ? formatMoney(Number(display.fare)) : "—"}
                />
                <DetailRow
                  label="Earning"
                  value={
                    display.driver_earning != null
                      ? formatMoney(Number(display.driver_earning))
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
                <DetailRow label="Status" value={display.status || "—"} />
                <DetailRow label="Ride type" value={display.ride_type || "—"} />
                <DetailRow label="Created" value={formatRideDate(display.created_at)} />
                <DetailRow label="Completed" value={formatRideDate(display.completed_at)} />
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
                {display.app_fee ? (
                  <DetailRow
                    label="Commission"
                    value={formatMoney(Number(display.app_fee))}
                  />
                ) : null}
                {display.bonus ? (
                  <DetailRow
                    label="Bonus"
                    value={formatMoney(Number(display.bonus))}
                  />
                ) : null}
                {display.notes ? (
                  <DetailRow label="Notes" value={display.notes} />
                ) : null}
              </div>

              {display.stops && display.stops.length > 0 ? (
                <div className="drh-detail-stops">
                  <h4 className="drh-detail-stops-title">Stops</h4>
                  <ol className="drh-detail-stops-list">
                    {display.stops.map((stop, index) => (
                      <li key={stop.id || index} className="drh-detail-stop">
                        {stop.location_name || `Stop ${index + 1}`}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              <div className="drh-receipt-actions">
                <button
                  type="button"
                  className="drh-receipt-btn"
                  onClick={() => printDriverReceipt(display)}
                  disabled={!canReceipt}
                >
                  Print receipt
                </button>
                <button
                  type="button"
                  className="drh-receipt-btn"
                  onClick={() => shareDriverReceipt(display)}
                  disabled={!canReceipt}
                >
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
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [validation, setValidation] = useState("");

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
        setCount(Number(data.count) || 0);
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

  const emptyTitle = useMemo(() => {
    if (statusFilter || dateFrom || dateTo) return "No rides match these filters.";
    return "No rides yet.";
  }, [statusFilter, dateFrom, dateTo]);

  const emptyMessage = useMemo(() => {
    if (statusFilter || dateFrom || dateTo) return "Try adjusting your filters.";
    return "Your completed and cancelled rides will appear here.";
  }, [statusFilter, dateFrom, dateTo]);

  if (loading && rides.length === 0) {
    return (
      <main className="drh-page" aria-label="Ride history">
        <h1 className="drh-title">Ride History</h1>
        <DriverLoadingState title="Loading ride history..." />
      </main>
    );
  }

  if (error && rides.length === 0) {
    return (
      <main className="drh-page" aria-label="Ride history">
        <h1 className="drh-title">Ride History</h1>
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
      <h1 className="drh-title">Ride History</h1>

      <section className="drh-filters" aria-label="Filter rides">
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
        <p className="drh-count" aria-live="polite">
          {count} {count === 1 ? "ride" : "rides"}
        </p>

        {rides.length === 0 ? (
          <div className="drh-empty" role="status" aria-live="polite">
            <span className="drh-empty-icon" aria-hidden="true">
              🚗
            </span>
            <p className="drh-empty-title">{emptyTitle}</p>
            <p className="drh-empty-message">{emptyMessage}</p>
          </div>
        ) : (
          <div className="drh-list">
            {rides.map((ride) => (
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

        {rides.length > 0 ? (
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
