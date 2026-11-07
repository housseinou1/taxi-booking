import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useOperatingCityOptions } from "../layouts/useOperatingCityOptions";
import {
  DRIVER_STATUS_LABELS,
  VEHICLE_DOCUMENTS,
  exportFleetReport,
  fetchFleetVehicles,
  vehicleDocumentState,
} from "./fleetApi";
import {
  DriverCell,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingSkeleton,
  Pager,
  Panel,
  Pill,
  SectionHead,
  SortHeader,
  StatusPill,
  formatCount,
  formatDate,
  formatDateTime,
} from "./fleetUi";
import "./fleetUi.css";
import "./VehicleManagementCenter.css";

/**
 * Vehicle Management (Fleet).
 *
 * Reads the READ-ONLY endpoint GET /operations/vehicles/, which is derived entirely
 * from the existing DriverProfile vehicle fields — no new model, no migration, and
 * no duplicate vehicle records. Vehicle document approval stays with the existing
 * Fleet Document Center, so those permissions and workflows are untouched: this page
 * links there rather than re-implementing review.
 *
 * Two different units are shown and never mixed:
 *   • VEHICLE counts  — one per driver profile with vehicle fields.
 *   • DOCUMENT counts — four tracked documents per vehicle.
 * Every card states which unit it counts.
 */

const PAGE_SIZE = 10;

const APPROVAL_FILTERS = [
  { value: "", label: "All approval statuses" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "pending_review", label: "Pending review" },
  { value: "rejected", label: "Rejected" },
];

const DOCUMENT_FILTERS = [
  { value: "", label: "Any document state" },
  { value: "valid", label: "All documents valid" },
  { value: "expiring_soon", label: "Has expiring document" },
  { value: "expired", label: "Has expired document" },
  { value: "missing", label: "Has not-uploaded document" },
  { value: "no_expiry_recorded", label: "Has document with no expiry" },
];

const EMPTY_FILTERS = { search: "", approval: "", document: "", city: "" };

function vehicleLabel(vehicle) {
  if (!vehicle) return "—";
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return name || vehicle.plate_number || "—";
}

function plateLabel(row) {
  return row?.vehicle?.plate_number || row?.vehicle?.vehicle_plate || "—";
}

/** One document column cell: state badge plus the expiry date when one exists. */
function DocCell({ row, docKey }) {
  const state = row?.documents?.[docKey];
  const meta = vehicleDocumentState(state);
  const expiresAt = row?.[`${docKey}_expires_at`];
  let secondary = "No expiry date";
  if (expiresAt) secondary = `Expires ${formatDate(expiresAt)}`;
  else if (state === "missing") secondary = "No file on record";
  return (
    <div className="veh-doc">
      <Pill tone={meta.tone}>{meta.label}</Pill>
      <span className="veh-doc__date">{secondary}</span>
    </div>
  );
}

export default function VehicleManagementCenter() {
  const { registryOptions, cities: operatingCities } = useOperatingCityOptions();
  const [rows, setRows] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [reportedCount, setReportedCount] = useState(0);
  const [expiryAlertDays, setExpiryAlertDays] = useState(30);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: "driver_name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastLoaded, setLastLoaded] = useState(null);

  const load = useCallback(async (options = {}) => {
    const silent = options.silent === true;
    if (!silent) setLoading(true);
    try {
      setError("");
      // Fetch once (the directory caps at 500 rows) and filter/sort/page on the
      // client. That keeps search instant, avoids a request per keystroke, and —
      // importantly — filters the WHOLE dataset rather than the post-limit slice.
      const response = await fetchFleetVehicles({ limit: 500 });
      const data = response.data || {};
      setRows(Array.isArray(data.vehicles) ? data.vehicles : []);
      setAlerts(Array.isArray(data.expiring_documents) ? data.expiring_documents : []);
      setReportedCount(typeof data.count === "number" ? data.count : 0);
      setExpiryAlertDays(data.expiry_alert_days ?? 30);
      setLastLoaded(new Date());
    } catch (err) {
      const status = err?.response?.status;
      setError(
        status === 403
          ? "You are not authorized to view the vehicle directory."
          : err?.response?.data?.detail || err?.message || "Could not load the vehicle directory."
      );
      setRows([]);
      setAlerts([]);
      setReportedCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filter changes reset pagination so the user never lands on an empty page.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const cityNameById = useMemo(() => {
    const index = new Map();
    (operatingCities || []).forEach((city) => {
      if (city.primary_registry_city_id != null) {
        index.set(String(city.primary_registry_city_id), city.name);
      }
    });
    return index;
  }, [operatingCities]);

  const cityOptions = registryOptions;

  /* ── Filtering ─────────────────────────────────────────────────────────────── */

  const filteredRows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.approval && row.driver_status !== filters.approval) return false;
      if (filters.city && String(row.city_id) !== filters.city) return false;
      if (
        filters.document &&
        !Object.values(row.documents || {}).includes(filters.document)
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        row.vehicle?.plate_number,
        row.vehicle?.vehicle_plate,
        row.vehicle?.make,
        row.vehicle?.model,
        row.driver_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [rows, filters]);

  const compare = useCallback((a, b, key) => {
    const read = (row) => {
      if (key === "vehicle") return vehicleLabel(row.vehicle);
      if (key === "plate") return plateLabel(row);
      if (key === "driver_name") return row.driver_name || "";
      return row[key];
    };
    const left = read(a);
    const right = read(b);
    return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
      sensitivity: "base",
    });
  }, []);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      const result = compare(a, b, sort.key);
      return sort.dir === "asc" ? result : -result;
    });
    return copy;
  }, [filteredRows, sort, compare]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pagedRows = useMemo(
    () => sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [sortedRows, safePage]
  );

  const handleSort = useCallback((key) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }, []);

  /* ── Aggregates ─────────────────────────────────────────────────────────────
     Two distinct units, computed and labelled separately:
       vehicleStats  — one increment per VEHICLE
       documentStats — one increment per DOCUMENT (4 tracked documents per vehicle)
     ─────────────────────────────────────────────────────────────────────────── */

  const vehicleStats = useMemo(() => {
    const hasState = (row, state) => Object.values(row.documents || {}).includes(state);
    const allValid = (row) => {
      const states = Object.values(row.documents || {});
      return states.length > 0 && states.every((state) => state === "valid");
    };
    return {
      total: rows.length,
      approved: rows.filter((row) => row.driver_status === "approved").length,
      pending: rows.filter(
        (row) => row.driver_status === "pending" || row.driver_status === "pending_review"
      ).length,
      rejected: rows.filter((row) => row.driver_status === "rejected").length,
      withExpired: rows.filter((row) => hasState(row, "expired")).length,
      withExpiring: rows.filter((row) => hasState(row, "expiring_soon")).length,
      withMissing: rows.filter((row) => hasState(row, "missing")).length,
      fullyCompliant: rows.filter(allValid).length,
    };
  }, [rows]);

  const documentStats = useMemo(() => {
    const counts = {
      valid: 0,
      expiring_soon: 0,
      expired: 0,
      missing: 0,
      no_expiry_recorded: 0,
    };
    rows.forEach((row) => {
      Object.values(row.documents || {}).forEach((state) => {
        if (state in counts) counts[state] += 1;
      });
    });
    return { ...counts, slots: rows.length * VEHICLE_DOCUMENTS.length };
  }, [rows]);

  const truncated = reportedCount > rows.length;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSort({ key: "driver_name", dir: "asc" });
    setPage(1);
  };

  const handleExport = async () => {
    setNotice("");
    try {
      // Reuses the existing fleet report export — no new endpoint, no new report type.
      const response = await exportFleetReport("document_expiration", "csv");
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "document_expiration.csv";
      link.click();
      window.URL.revokeObjectURL(url);
      setNotice("Exported the document expiration report (CSV).");
    } catch (err) {
      setNotice(err?.response?.data?.detail || "Export failed.");
    }
  };

  if (loading && !lastLoaded) {
    return (
      <div className="fleet-center">
        <div className="fleet-center__header">
          <div className="fleet-center__heading">
            <h1 className="fleet-center__title">Vehicle Management</h1>
            <p className="fleet-center__subtitle">Loading the vehicle directory…</p>
          </div>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="fleet-center">
      <nav className="veh-crumbs" aria-label="Breadcrumb">
        <a href="/admin">Admin</a>
        <span aria-hidden="true">/</span>
        <a href="/admin/fleet">Fleet</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Vehicle Management</span>
      </nav>

      <header className="fleet-center__header">
        <div className="fleet-center__heading">
          <h1 className="fleet-center__title">Vehicle Management</h1>
          <p className="fleet-center__subtitle">
            Manage fleet vehicles, driver assignments, approval status, and document compliance.
          </p>
          <div className="fleet-center__meta">
            <span className="fleet-live">
              <span className="fleet-live__dot" aria-hidden="true" />
              Live
            </span>
            <span>Updated {lastLoaded ? lastLoaded.toLocaleTimeString() : "—"}</span>
            <span>
              {formatCount(vehicleStats.total)} vehicles · {formatCount(documentStats.slots)} tracked
              documents
            </span>
          </div>
        </div>
        <div className="fleet-center__actions">
          <button type="button" className="fleet-btn" onClick={handleExport}>
            Export report (CSV)
          </button>
          <a className="fleet-btn" href="/admin/fleet">
            Fleet document center
          </a>
          <button
            type="button"
            className="fleet-btn"
            onClick={() => load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error ? <ErrorState message={error} onRetry={() => load()} /> : null}
      {notice ? <div className="fleet-notice">{notice}</div> : null}

      <div className="veh-note">
        <span>
          <strong>Derived data.</strong> Each row is a ride-driver profile carrying vehicle fields —
          there is no separate vehicle table, so a vehicle cannot be duplicated. Vehicle document
          review stays in the Fleet document center; this page links there and never approves or
          rejects anything.
        </span>
      </div>

      {truncated ? (
        <div className="fleet-gap">
          <span>
            <strong>Partial directory.</strong> The API reports {formatCount(reportedCount)} vehicles
            but returns at most 500 rows; the figures below describe the {formatCount(rows.length)}{" "}
            returned.
          </span>
        </div>
      ) : null}

      <section className="fleet-section">
        <SectionHead
          title="Vehicle overview"
          hint="Each card counts VEHICLES. Approval status is the assigned driver's DriverProfile status, because a vehicle is stored on the driver profile."
        />
        <div className="fleet-kpis">
          <KpiCard
            label="Total vehicles"
            value={formatCount(vehicleStats.total)}
            icon="🚙"
            tone="idle"
            sub="Vehicles (ride-driver profiles with vehicle fields)"
          />
          <KpiCard
            label="Approved vehicles"
            value={formatCount(vehicleStats.approved)}
            icon="✅"
            tone="ok"
            sub="Vehicles whose driver profile is approved"
          />
          <KpiCard
            label="Pending approval"
            value={formatCount(vehicleStats.pending)}
            icon="⏱️"
            tone="warn"
            sub="Vehicles awaiting driver verification"
          />
          <KpiCard
            label="Rejected"
            value={formatCount(vehicleStats.rejected)}
            icon="🚫"
            tone="danger"
            sub="Vehicles whose driver profile was rejected"
          />
          <KpiCard
            label="Fully compliant"
            value={formatCount(vehicleStats.fullyCompliant)}
            icon="🛡️"
            tone="ok"
            sub="Vehicles with all 4 tracked documents valid"
          />
          <KpiCard
            label="With expired documents"
            value={formatCount(vehicleStats.withExpired)}
            icon="⛔"
            tone="danger"
            sub="Vehicles with at least one expired document"
          />
          <KpiCard
            label="Expiring soon"
            value={formatCount(vehicleStats.withExpiring)}
            icon="📅"
            tone="warn"
            sub={`Vehicles with a document expiring within ${expiryAlertDays} days`}
          />
          <KpiCard
            label="With missing documents"
            value={formatCount(vehicleStats.withMissing)}
            icon="❓"
            tone="idle"
            sub="Vehicles with at least one document not uploaded"
          />
        </div>
      </section>

      <section className="fleet-section">
        <SectionHead
          title="Document compliance"
          hint={`Each card counts DOCUMENTS, not vehicles. ${formatCount(
            vehicleStats.total
          )} vehicles × ${VEHICLE_DOCUMENTS.length} tracked documents = ${formatCount(
            documentStats.slots
          )} document slots.`}
        />
        <div className="fleet-kpis">
          <KpiCard
            label="Valid documents"
            value={formatCount(documentStats.valid)}
            icon="📄"
            tone="ok"
            sub={`Documents (of ${formatCount(documentStats.slots)} tracked)`}
          />
          <KpiCard
            label="Expiring soon"
            value={formatCount(documentStats.expiring_soon)}
            icon="📅"
            tone="warn"
            sub="Documents expiring within the alert window"
          />
          <KpiCard
            label="Expired documents"
            value={formatCount(documentStats.expired)}
            icon="⛔"
            tone="danger"
            sub="Documents already past their expiry date"
          />
          <KpiCard
            label="Not uploaded"
            value={formatCount(documentStats.missing)}
            icon="❓"
            tone="idle"
            sub="Documents with no file on record"
          />
          <KpiCard
            label="No expiry recorded"
            value={formatCount(documentStats.no_expiry_recorded)}
            icon="🗓️"
            tone="info"
            sub="Documents uploaded without an expiry date"
          />
          <KpiCard
            label="Documents tracked"
            value={formatCount(documentStats.slots)}
            icon="🗂️"
            tone="idle"
            sub={`${VEHICLE_DOCUMENTS.map((doc) => doc.label).join(" · ")}`}
          />
        </div>
      </section>

      <div className="fleet-toolbar">
        <label className="fleet-field fleet-field--grow">
          <span className="fleet-field__label">Search</span>
          <input
            type="search"
            className="fleet-input"
            placeholder="Plate, make, model or driver"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            aria-label="Search vehicles by plate, make, model or driver"
          />
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">Approval status</span>
          <select
            className="fleet-select"
            value={filters.approval}
            onChange={(event) => updateFilter("approval", event.target.value)}
            aria-label="Filter by vehicle approval status"
          >
            {APPROVAL_FILTERS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">Document compliance</span>
          <select
            className="fleet-select"
            value={filters.document}
            onChange={(event) => updateFilter("document", event.target.value)}
            aria-label="Filter by document compliance"
          >
            {DOCUMENT_FILTERS.map((option) => (
              <option key={option.value || "any"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fleet-field">
          <span className="fleet-field__label">City</span>
          <select
            className="fleet-select"
            value={filters.city}
            onChange={(event) => updateFilter("city", event.target.value)}
            aria-label="Filter by city"
            disabled={!cityOptions.length}
          >
            {cityOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="fleet-btn"
          onClick={resetFilters}
          disabled={activeFilterCount === 0}
        >
          Reset filters
        </button>

        <span className="fleet-toolbar__spacer" />
        <span className="fleet-toolbar__count">
          <strong>{formatCount(sortedRows.length)}</strong> of {formatCount(rows.length)} vehicles
          {activeFilterCount ? ` · ${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} active` : ""}
        </span>
      </div>

      <section className="fleet-section">
        <SectionHead
          title="Vehicle directory"
          hint="One row per vehicle, joined to its assigned driver. Sort any column, search by plate, make, model or driver, and use the toolbar filters above."
        />
        <Panel flush>
          {rows.length === 0 ? (
            <div className="fleet-panel__body">
              <EmptyState
                icon="🚙"
                title="No vehicles are registered yet"
                hint="Vehicles appear here as soon as ride-driver profiles carry vehicle details. Delivery couriers are not part of this directory."
              />
            </div>
          ) : (
            <>
              <div className="fleet-table-wrap">
                <table className="fleet-table veh-table" aria-label="Vehicle directory">
              <thead>
                <tr>
                  <SortHeader label="Vehicle" sortKey="vehicle" sort={sort} onSort={handleSort} />
                  <SortHeader label="License plate" sortKey="plate" sort={sort} onSort={handleSort} />
                  <SortHeader
                    label="Assigned driver"
                    sortKey="driver_name"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <th scope="col">Approval status</th>
                  {VEHICLE_DOCUMENTS.map((doc) => (
                    <th key={doc.key} scope="col" title={doc.label}>
                      {doc.label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="veh-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length ? (
                  pagedRows.map((row) => (
                    <tr key={row.driver_id}>
                      <td>
                        <div className="veh-name">
                          <span className="veh-name__primary" title={vehicleLabel(row.vehicle)}>
                            {vehicleLabel(row.vehicle)}
                          </span>
                          <span className="veh-name__meta">
                            {[row.vehicle?.colour, row.vehicle?.year].filter(Boolean).join(" · ") ||
                              "—"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="veh-plate">{plateLabel(row)}</span>
                      </td>
                      <td>
                        <DriverCell name={row.driver_name} meta={row.driver_email} />
                      </td>
                      <td>
                        <StatusPill status={row.driver_status} map={DRIVER_STATUS_LABELS} />
                      </td>
                      {VEHICLE_DOCUMENTS.map((doc) => (
                        <td key={doc.key}>
                          <DocCell row={row} docKey={doc.key} />
                        </td>
                      ))}
                      <td>
                        <div className="fleet-table__actions">
                          <button
                            type="button"
                            className="fleet-btn fleet-btn--sm"
                            onClick={() => setSelected(row)}
                          >
                            View details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="fleet-table__empty" colSpan={9}>
                      No vehicles match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
              <Pager
                page={safePage}
                pageCount={pageCount}
                total={sortedRows.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
            </>
          )}
        </Panel>
      </section>

      {alerts.length ? (
        <section className="fleet-section">
          <SectionHead
            title="Document expiry alerts"
            hint={`Documents the backend flagged as expired or expiring within ${expiryAlertDays} days. The API caps this list at 200 alerts.`}
          />
          <Panel flush>
            <div className="fleet-table-wrap">
              <table className="fleet-table">
                <thead>
                  <tr>
                    <th scope="col">Assigned driver</th>
                    <th scope="col">License plate</th>
                    <th scope="col">Document</th>
                    <th scope="col">State</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.slice(0, 50).map((alert, index) => {
                    const meta = vehicleDocumentState(alert.state);
                    const docMeta = VEHICLE_DOCUMENTS.find((doc) => doc.key === alert.document);
                    return (
                      <tr key={`${alert.driver_id}-${alert.document}-${index}`}>
                        <td>
                          <DriverCell name={alert.driver_name} />
                        </td>
                        <td>
                          <span className="veh-plate">{alert.plate || "—"}</span>
                        </td>
                        <td>{docMeta?.label || alert.document}</td>
                        <td>
                          <Pill tone={meta.tone}>{meta.label}</Pill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      ) : null}

      {selected ? (
        <section className="fleet-section">
          <div className="fleet-drawer" role="region" aria-label="Vehicle details">
            <div className="fleet-drawer__head">
              <div>
                <h3 className="fleet-drawer__title">{vehicleLabel(selected.vehicle)}</h3>
                <p className="fleet-panel__note">
                  Plate {plateLabel(selected)} · driver profile id {selected.driver_id}
                </p>
              </div>
              <div className="fleet-action-bar">
                <button
                  type="button"
                  className="fleet-btn fleet-btn--sm"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="fleet-drawer__body">
              <div className="veh-drawer__grid">
                <div className="veh-drawer__col">
                  <h4 className="veh-drawer__heading">Vehicle information</h4>
                  <div className="fleet-facts">
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Make</div>
                      <div className="fleet-fact__value">{selected.vehicle?.make || "—"}</div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Model</div>
                      <div className="fleet-fact__value">{selected.vehicle?.model || "—"}</div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Colour</div>
                      <div className="fleet-fact__value">{selected.vehicle?.colour || "—"}</div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">License plate</div>
                      <div className="fleet-fact__value">{plateLabel(selected)}</div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Alternate plate</div>
                      <div className="fleet-fact__value">
                        {selected.vehicle?.vehicle_plate || "—"}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Registration expires</div>
                      <div className="fleet-fact__value">
                        {formatDate(selected.registration_expires_at)}
                      </div>
                    </div>
                  </div>
                  <p className="veh-drawer__note">
                    Make, model, colour and plate are stored on the driver profile — there is no
                    separate vehicle record, so a vehicle cannot be duplicated. Vehicle photo on
                    file: {selected.vehicle?.photo_available ? "yes" : "no"}.
                  </p>
                </div>

                <div className="veh-drawer__col">
                  <h4 className="veh-drawer__heading">Assigned driver</h4>
                  <div className="fleet-facts">
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Driver name</div>
                      <div className="fleet-fact__value" title={selected.driver_name}>
                        {selected.driver_name || "—"}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Driver status</div>
                      <div className="fleet-fact__value">
                        {DRIVER_STATUS_LABELS[selected.driver_status]?.label ||
                          selected.driver_status ||
                          "—"}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">City</div>
                      <div className="fleet-fact__value">
                        {cityNameById.get(String(selected.city_id)) || "—"}
                      </div>
                    </div>
                  </div>
                  <div className="fleet-action-bar">
                    <a className="fleet-btn fleet-btn--sm" href="/admin/drivers">
                      Open driver management
                    </a>
                  </div>
                </div>
                <div className="veh-drawer__col">
                  <h4 className="veh-drawer__heading">Document compliance</h4>
                  <div className="veh-doc-list">
                    {VEHICLE_DOCUMENTS.map((doc) => {
                      const meta = vehicleDocumentState(selected.documents?.[doc.key]);
                      const expiresAt = selected[`${doc.key}_expires_at`];
                      return (
                        <div key={doc.key} className="veh-doc-list__row">
                          <span className="veh-doc-list__label">{doc.label}</span>
                          <span className="veh-doc-list__value">
                            <Pill tone={meta.tone}>{meta.label}</Pill>
                            <span className="veh-doc__date">
                              {expiresAt ? `Expires ${formatDate(expiresAt)}` : "No expiry date"}
                            </span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="veh-drawer__note">
                    These states are derived from expiry dates and uploaded files. Review and
                    approval stay in the Fleet document center, so this page never approves or
                    rejects a document.
                  </p>
                </div>

                <div className="veh-drawer__col">
                  <h4 className="veh-drawer__heading">Operational status</h4>
                  <div className="fleet-facts">
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Approval status</div>
                      <div className="fleet-fact__value">
                        {DRIVER_STATUS_LABELS[selected.driver_status]?.label ||
                          selected.driver_status ||
                          "—"}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Documents valid</div>
                      <div className="fleet-fact__value">
                        {Object.values(selected.documents || {}).filter(
                          (state) => state === "valid"
                        ).length}{" "}
                        / {VEHICLE_DOCUMENTS.length}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Insurance expiry</div>
                      <div className="fleet-fact__value">
                        {formatDate(selected.insurance_expires_at)}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Vignette expiry</div>
                      <div className="fleet-fact__value">
                        {formatDate(selected.vignette_expires_at)}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Licence expiry</div>
                      <div className="fleet-fact__value">
                        {formatDate(selected.licence_expires_at)}
                      </div>
                    </div>
                    <div className="fleet-fact">
                      <div className="fleet-fact__label">Directory loaded</div>
                      <div className="fleet-fact__value">
                        {lastLoaded ? formatDateTime(lastLoaded.toISOString()) : "—"}
                      </div>
                    </div>
                  </div>
                  <p className="veh-drawer__note">
                    Live availability is not part of the vehicle directory payload, so it is not
                    shown here rather than being guessed.
                  </p>
                </div>


              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}







