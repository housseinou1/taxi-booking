import React, { useMemo, useState } from "react";

import {
  ActivityFeed,
  AlertBanner,
  ConfirmationDialog,
  DashboardSkeleton,
  DataTable,
  Drawer,
  ExportMenu,
  FilterBar,
  InlineError,
  KPICard,
  LiveMap,
  DriverMarker,
  RideMarker,
  DeliveryMarker,
  MapLegend,
  MapToolbar,
  MapFilters,
  RetryBlock,
  SearchBar,
  Select,
  StatusChip,
  useToast,
  formatCurrency,
  formatTimestamp,
} from "../components/library";
import ProtectedActionButton from "../components/guards/ProtectedActionButton";
import { usePermissions } from "../permissions/PermissionContext";
import {
  exportIncidentReport,
  postBroadcastNearby,
  postCancelRide,
  postForceAssign,
  postIncidentAction,
  postOpsHandover,
  postOpsHandoverAcknowledge,
  postPauseDriver,
  postReassignRide,
} from "./opsDashboardApi";
import {
  ACTION_AVAILABILITY,
  buildDriverBoard,
  buildExceptionQueue,
  buildOpsKpis,
  formatWait,
  mapIncidentEscalationOwner,
  maskPhone,
  riskForTrip,
} from "./opsDashboardMappers";
import { useOpsDashboardData } from "./useOpsDashboardData";
import "./OpsManagerDashboard.css";

const RIDE_STATUS_OPTIONS = [
  { value: "", label: "All active statuses" },
  { value: "requested", label: "Requested" },
  { value: "driver_arriving", label: "Driver arriving" },
  { value: "driver_arrived", label: "Driver arrived" },
  { value: "in_progress", label: "In progress" },
];

function UnavailableAction({ label, reason }) {
  return (
    <button type="button" className="admin-lib-btn admin-lib-btn--ghost" disabled title={reason}>
      {label} (unavailable)
    </button>
  );
}

export default function OpsManagerDashboard() {
  const { permissions, cityId, setCity, canAction } = usePermissions();
  const { push } = useToast();
  const {
    dashboard,
    tripsPage,
    handovers,
    loading,
    refreshing,
    error,
    lastRefresh,
    loadMs,
    tripFilters,
    refresh,
    refreshTrips,
    pollMs,
  } = useOpsDashboardData(cityId);

  const [serviceFilter, setServiceFilter] = useState("all");
  const [driverStateFilter, setDriverStateFilter] = useState("all");
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [reason, setReason] = useState("");
  const [driverIdInput, setDriverIdInput] = useState("");
  const [snoozedAlerts, setSnoozedAlerts] = useState(() => new Set());
  const [handoverForm, setHandoverForm] = useState({
    open_incidents_summary: "",
    delayed_rides_summary: "",
    drivers_attention_summary: "",
    payment_system_concerns: "",
    pending_escalations: "",
    important_notes: "",
  });
  const [followUp, setFollowUp] = useState("");

  const canDispatch =
    dashboard?.permissions?.dispatch ||
    canAction("dispatch.reassign") ||
    canAction("dispatch.force_assign") ||
    permissions?.role === "ops" ||
    permissions?.role === "ceo" ||
    permissions?.elevated;

  const kpis = useMemo(() => buildOpsKpis(dashboard), [dashboard]);
  const drivers = useMemo(() => buildDriverBoard(dashboard?.fleet), [dashboard]);
  const exceptions = useMemo(
    () => buildExceptionQueue({ dashboard, alerts: dashboard?.alerts }).filter((item) => !snoozedAlerts.has(item.id)),
    [dashboard, snoozedAlerts]
  );
  const incidents = dashboard?.emergency?.incidents || [];
  const alerts = (dashboard?.alerts || []).filter((a) => !snoozedAlerts.has(a.id));

  const mapCenter = useMemo(() => {
    const first = dashboard?.map?.markers?.drivers?.[0];
    if (first?.lat != null) return [first.lat, first.lng];
    return [18.0735, -15.9582];
  }, [dashboard]);

  const filteredDrivers = drivers.filter((d) => driverStateFilter === "all" || d.status === driverStateFilter);

  const exportRows = (tripsPage.trips || []).map((trip) => ({
    id: trip.id,
    status: trip.status,
    rider: trip.rider?.name,
    pickup: trip.pickup,
    destination: trip.destination,
    waiting: formatWait(trip.waiting_seconds),
    driver: trip.driver?.name || "",
    eta: trip.eta_minutes ?? "",
  }));

  const applyKpiFilter = (filter) => {
    if (!filter) return;
    if (filter.startsWith("status:")) {
      const status = filter.split(":")[1];
      if (status === "unassigned") {
        refreshTrips({ ...tripFilters, status: "requested", page: 1 });
      } else if (status === "assigned") {
        refreshTrips({ ...tripFilters, status: "driver_arriving", page: 1 });
      } else if (status !== "cancelled") {
        refreshTrips({ ...tripFilters, status, page: 1 });
      }
      document.getElementById("ops-dispatch")?.scrollIntoView({ behavior: "smooth" });
    }
    if (filter.startsWith("drivers:")) {
      const state = filter.split(":")[1];
      setDriverStateFilter(state === "online" || state === "available" ? "available" : state === "busy" ? "on_trip" : "all");
      document.getElementById("ops-drivers")?.scrollIntoView({ behavior: "smooth" });
    }
    if (filter === "panel:incidents") {
      document.getElementById("ops-incidents")?.scrollIntoView({ behavior: "smooth" });
    }
    if (filter === "risk:delayed") {
      refreshTrips({ ...tripFilters, sort: "waiting_desc", page: 1 });
      document.getElementById("ops-exceptions")?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const openConfirm = (action) => {
    setReason("");
    setDriverIdInput("");
    setConfirm(action);
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    if (!canDispatch) {
      push({ tone: "danger", title: "Permission denied", message: "Dispatch permission required." });
      return;
    }
    if ((confirm.needsReason || confirm.type === "force_assign" || confirm.type === "reassign" || confirm.type === "cancel") && reason.trim().length < 10) {
      push({ tone: "warning", title: "Reason required", message: "Enter at least 10 characters." });
      return;
    }
    try {
      if (confirm.type === "force_assign") {
        await postForceAssign(confirm.rideId, Number(driverIdInput), reason);
      } else if (confirm.type === "reassign") {
        await postReassignRide(confirm.rideId, driverIdInput ? Number(driverIdInput) : null, reason);
      } else if (confirm.type === "cancel") {
        await postCancelRide(confirm.rideId, reason);
      } else if (confirm.type === "pause_driver") {
        await postPauseDriver(confirm.driverId, true);
      } else if (confirm.type === "incident") {
        await postIncidentAction(confirm.incidentId, confirm.incidentAction, { notes: reason || confirm.notes || "" });
      } else if (confirm.type === "broadcast") {
        await postBroadcastNearby({
          lat: confirm.lat,
          lng: confirm.lng,
          message: reason,
          title: "Operations alert",
        });
      }
      push({ tone: "success", title: "Action completed", message: confirm.label });
      setConfirm(null);
      await refresh();
    } catch (err) {
      push({
        tone: "danger",
        title: "Action failed",
        message: err?.response?.data?.error || err?.response?.data?.detail || err?.message,
      });
    }
  };

  const submitHandover = async () => {
    try {
      await postOpsHandover({ ...handoverForm, city_id: cityId || null });
      push({ tone: "success", title: "Handover submitted", message: "Incoming operator can acknowledge." });
      setHandoverForm({
        open_incidents_summary: "",
        delayed_rides_summary: "",
        drivers_attention_summary: "",
        payment_system_concerns: "",
        pending_escalations: "",
        important_notes: "",
      });
      await refresh();
    } catch (err) {
      push({ tone: "danger", title: "Handover failed", message: err?.response?.data?.error || err?.message });
    }
  };

  const acknowledgeHandover = async (id) => {
    try {
      await postOpsHandoverAcknowledge(id, { follow_up_notes: followUp });
      push({ tone: "success", title: "Handover acknowledged" });
      setFollowUp("");
      await refresh();
    } catch (err) {
      push({ tone: "danger", title: "Acknowledge failed", message: err?.response?.data?.error || err?.message });
    }
  };

  // Patch API wrappers that may not accept reason yet — adapt if signatures differ
  // operationsCenterApi.postForceAssign(rideId, driverId) — we need to update it

  if (loading && !dashboard) {
    return (
      <div className="ops-md">
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <div className={`ops-md ${mapFullscreen ? "ops-md--map-fullscreen" : ""}`.trim()}>
      <header className="ops-md__header">
        <div>
          <h1 className="ops-md__title">Operations Control Center</h1>
          <p className="ops-md__subtitle">
            Real-time supervision of rides, drivers, deliveries, and incidents
            {lastRefresh ? ` · Updated ${lastRefresh.toLocaleTimeString()}` : ""}
            {loadMs != null ? ` · Loaded in ${loadMs}ms` : ""}
            {` · Poll ${pollMs / 1000}s`}
            {refreshing ? " · Refreshing…" : ""}
          </p>
        </div>
        <div className="ops-md__header-actions">
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={refresh} disabled={refreshing}>
            Refresh
          </button>
          <ExportMenu
            filename="ops-dispatch-queue"
            rows={exportRows}
            columns={[
              { id: "id", label: "Ride ID" },
              { id: "status", label: "Status" },
              { id: "rider", label: "Rider" },
              { id: "pickup", label: "Pickup" },
              { id: "destination", label: "Destination" },
              { id: "waiting", label: "Waiting" },
              { id: "driver", label: "Driver" },
              { id: "eta", label: "ETA" },
            ]}
            exportScope="reports"
          />
          <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/ops-control">
            Legacy OCC
          </a>
        </div>
      </header>

      {error ? (
        <div>
          <InlineError message={error} />
          <RetryBlock onRetry={refresh} />
        </div>
      ) : null}

      <section className="ops-md__section" aria-label="Live operations summary">
        <div className="ops-md__kpi-grid">
          {kpis.map((kpi) => (
            <KPICard
              key={kpi.id}
              label={kpi.label}
              value={
                kpi.format === "percent"
                  ? kpi.value
                  : kpi.format === "minutes"
                    ? kpi.value != null
                      ? `${kpi.value} min`
                      : "—"
                    : kpi.value
              }
              format={kpi.format === "percent" ? "percent" : "auto"}
              tone={kpi.tone}
              loading={loading && !dashboard}
              empty={kpi.value == null && !loading}
              onClick={() => applyKpiFilter(kpi.filter)}
            />
          ))}
        </div>
      </section>

      <section id="ops-dispatch" className="ops-md__section ops-md__panel">
        <div className="ops-md__panel-head">
          <h2>Live Dispatch Queue</h2>
          <StatusChip label={`${tripsPage.total || 0} rides`} tone="info" />
        </div>
        <FilterBar
          onReset={() =>
            refreshTrips({ status: "", search: "", sort: "waiting_desc", page: 1, page_size: 25 })
          }
        >
          <SearchBar
            value={tripFilters.search || ""}
            onChange={(value) => refreshTrips({ ...tripFilters, search: value, page: 1 })}
            placeholder="Search ride ID, rider, pickup…"
          />
          <Select
            label="Status"
            value={tripFilters.status || ""}
            onChange={(value) => refreshTrips({ ...tripFilters, status: value, page: 1 })}
            options={RIDE_STATUS_OPTIONS}
          />
          <Select
            label="City"
            value={cityId || ""}
            onChange={setCity}
            placeholder="All cities"
            options={[
              { value: "", label: "All cities" },
              ...(permissions?.assigned_city?.id
                ? [{ value: String(permissions.assigned_city.id), label: permissions.assigned_city.name }]
                : []),
            ]}
          />
          <Select
            label="Sort"
            value={tripFilters.sort || "waiting_desc"}
            onChange={(value) => refreshTrips({ ...tripFilters, sort: value, page: 1 })}
            options={[
              { value: "waiting_desc", label: "Longest waiting" },
              { value: "created_desc", label: "Newest first" },
              { value: "created_asc", label: "Oldest first" },
            ]}
          />
        </FilterBar>
        <DataTable
          title="Active rides"
          serverMode
          page={tripsPage.page || 1}
          pageSize={tripsPage.page_size || 25}
          total={tripsPage.total || 0}
          onPageChange={(page) => refreshTrips({ ...tripFilters, page })}
          loading={loading && !tripsPage.trips}
          searchable={false}
          exportFilename="ops-trips"
          exportScope="reports"
          columns={[
            { id: "id", label: "Ride ID", render: (row) => `#${row.id}` },
            { id: "rider", label: "Rider", render: (row) => row.rider?.name || "—" },
            { id: "pickup", label: "Pickup" },
            { id: "destination", label: "Destination" },
            { id: "ride_type", label: "Service", render: (row) => row.ride_type || "Ride" },
            { id: "created_at", label: "Requested", render: (row) => formatTimestamp(row.created_at) },
            { id: "waiting_seconds", label: "Waiting", render: (row) => formatWait(row.waiting_seconds), sortable: true },
            { id: "driver", label: "Driver", render: (row) => row.driver?.name || "—" },
            { id: "eta_minutes", label: "ETA", render: (row) => (row.eta_minutes != null ? `${row.eta_minutes}m` : "—") },
            { id: "status", label: "Status", render: (row) => <StatusChip label={row.status} /> },
            {
              id: "risk",
              label: "Risk",
              render: (row) => {
                const risk = riskForTrip(row);
                return <StatusChip label={risk.label} tone={risk.tone} />;
              },
            },
          ]}
          rows={tripsPage.trips || []}
          rowActions={(row) => (
            <div className="ops-md__row-actions">
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setSelectedTrip(row)}>
                Details
              </button>
              {ACTION_AVAILABILITY.reassign.available ? (
                <ProtectedActionButton
                  action="dispatch.reassign"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => openConfirm({ type: "reassign", rideId: row.id, label: `Reassign ride #${row.id}`, needsReason: true })}
                >
                  Reassign
                </ProtectedActionButton>
              ) : null}
              {ACTION_AVAILABILITY.cancel_ride.available ? (
                <ProtectedActionButton
                  action="dispatch.cancel_ride"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => openConfirm({ type: "cancel", rideId: row.id, label: `Cancel ride #${row.id}`, needsReason: true })}
                >
                  Cancel
                </ProtectedActionButton>
              ) : null}
              {ACTION_AVAILABILITY.force_assign.available ? (
                <ProtectedActionButton
                  action="dispatch.force_assign"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => openConfirm({ type: "force_assign", rideId: row.id, label: `Force assign ride #${row.id}`, needsReason: true })}
                >
                  Force assign
                </ProtectedActionButton>
              ) : null}
            </div>
          )}
        />
      </section>

      <div className="ops-md__grid ops-md__grid--main">
        <section id="ops-drivers" className="ops-md__panel">
          <div className="ops-md__panel-head">
            <h2>Live Driver Board</h2>
            <Select
              label="State"
              value={driverStateFilter}
              onChange={setDriverStateFilter}
              options={[
                { value: "all", label: "All" },
                { value: "available", label: "Available" },
                { value: "on_trip", label: "On trip" },
                { value: "on_delivery", label: "On delivery" },
                { value: "offline", label: "Offline" },
              ]}
            />
          </div>
          <DataTable
            searchable
            exportFilename="ops-drivers"
            exportScope="reports"
            columns={[
              { id: "name", label: "Name" },
              { id: "id", label: "Driver ID" },
              { id: "phone", label: "Contact", render: (row) => maskPhone(row.phone) },
              { id: "vehicle", label: "Vehicle" },
              { id: "plate", label: "Plate" },
              { id: "status", label: "Status", render: (row) => <StatusChip label={row.status} /> },
            ]}
            rows={filteredDrivers}
            emptyLabel="No drivers in this state"
            rowActions={(row) => (
              <div className="ops-md__row-actions">
                <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setSelectedDriver(row)}>
                  Profile
                </button>
                {row.phone ? (
                  <a className="admin-lib-btn admin-lib-btn--ghost" href={`tel:${row.phone}`}>
                    Contact
                  </a>
                ) : null}
                <ProtectedActionButton
                  action="dispatch.pause_driver"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() =>
                    openConfirm({
                      type: "pause_driver",
                      driverId: row.id,
                      label: `Escalate / pause driver #${row.id}`,
                      needsReason: true,
                    })
                  }
                >
                  Escalate review
                </ProtectedActionButton>
                <UnavailableAction label="Ops message" reason={ACTION_AVAILABILITY.broadcast_nearby.api} />
              </div>
            )}
          />
          <p className="ops-md__hint">Suspended / document-blocked states require Fleet Center data — open Fleet for compliance board.</p>
        </section>

        <section className={`ops-md__panel ${mapFullscreen ? "ops-md__panel--fullscreen" : ""}`.trim()}>
          <div className="ops-md__panel-head">
            <h2>Live Operations Map</h2>
            <MapToolbar>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={() => setMapFullscreen((v) => !v)}>
                {mapFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </button>
              <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={refresh}>
                Refresh map
              </button>
            </MapToolbar>
          </div>
          <MapFilters>
            <Select
              label="Service"
              value={serviceFilter}
              onChange={setServiceFilter}
              options={[
                { value: "all", label: "All" },
                { value: "rides", label: "Rides" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </MapFilters>
          <LiveMap
            center={mapCenter}
            zoom={12}
            height={mapFullscreen ? 720 : 360}
            onRefresh={refresh}
            legend={
              <MapLegend
                items={[
                  { type: "driver", label: "Drivers" },
                  { type: "ride", label: "Rides / pickups" },
                  { type: "delivery", label: "Deliveries" },
                ]}
              />
            }
          >
            {(dashboard?.map?.markers?.drivers || []).map((driver) => (
              <DriverMarker
                key={`d-${driver.id}`}
                position={[driver.lat, driver.lng]}
                popup={`${driver.label || `Driver ${driver.id}`} · ${driver.kind || "driver"}`}
              />
            ))}
            {(serviceFilter === "all" || serviceFilter === "rides") &&
              (dashboard?.map?.markers?.trips || []).map((trip) => (
                <RideMarker
                  key={`t-${trip.id}`}
                  position={[trip.lat, trip.lng]}
                  popup={`Ride #${trip.id} · ${trip.status || ""}`}
                />
              ))}
            {(serviceFilter === "all" || serviceFilter === "delivery") &&
              (dashboard?.map?.markers?.deliveries || []).map((delivery) => (
                <DeliveryMarker
                  key={`del-${delivery.id}`}
                  position={[delivery.lat, delivery.lng]}
                  popup={`Delivery #${delivery.id}`}
                />
              ))}
          </LiveMap>
          <p className="ops-md__hint">Service boundary polygons are not exposed by the map API (see known gaps).</p>
        </section>
      </div>

      <section id="ops-exceptions" className="ops-md__section ops-md__panel">
        <div className="ops-md__panel-head">
          <h2>Delay & Exception Queue</h2>
          <StatusChip label={`${exceptions.length} open`} tone={exceptions.length ? "warning" : "success"} />
        </div>
        {exceptions.length === 0 ? (
          <p className="admin-empty">No active exceptions</p>
        ) : (
          <div className="ops-md__stack">
            {exceptions.slice(0, 20).map((item) => (
              <AlertBanner key={item.id} tone={item.tone} title={item.reason}>
                <div className="ops-md__alert-meta">
                  <StatusChip label={item.severity} tone={item.tone} />
                  <span>{item.type}</span>
                  <time>{item.created_at ? new Date(item.created_at).toLocaleString() : "—"}</time>
                  <span>Recommended: {item.recommended_action}</span>
                </div>
                <div className="ops-md__row-actions">
                  <button
                    type="button"
                    className="admin-lib-btn admin-lib-btn--ghost"
                    onClick={() => setSnoozedAlerts((prev) => new Set([...prev, item.id]))}
                    title={ACTION_AVAILABILITY.alert_snooze_persist.reason}
                  >
                    Snooze (session)
                  </button>
                  {item.entity_type === "ride" ? (
                    <ProtectedActionButton
                      action="dispatch.reassign"
                      className="admin-lib-btn admin-lib-btn--ghost"
                      onClick={() =>
                        openConfirm({
                          type: "reassign",
                          rideId: item.entity_id,
                          label: `Reassign ride #${item.entity_id}`,
                          needsReason: true,
                        })
                      }
                    >
                      Intervene
                    </ProtectedActionButton>
                  ) : null}
                </div>
              </AlertBanner>
            ))}
          </div>
        )}
      </section>

      <section id="ops-incidents" className="ops-md__section ops-md__panel">
        <div className="ops-md__panel-head">
          <h2>Incident Management</h2>
          <StatusChip
            label={`${dashboard?.emergency?.open_count || 0} open · ${dashboard?.emergency?.critical_count || 0} critical`}
            tone={(dashboard?.emergency?.critical_count || 0) > 0 ? "danger" : "warning"}
          />
        </div>
        <DataTable
          searchable
          exportFilename="ops-incidents"
          exportScope="reports"
          emptyLabel="No open incidents"
          columns={[
            { id: "reference", label: "ID" },
            { id: "severity", label: "Severity", render: (row) => <StatusChip label={row.severity} tone={SEVERITY_TONE_SAFE(row.severity)} /> },
            { id: "incident_type", label: "Type" },
            { id: "status", label: "Status" },
            { id: "reporter", label: "Reporter", render: (row) => row.reporter?.name || "—" },
            { id: "ride_id", label: "Ride", render: (row) => (row.ride_id ? `#${row.ride_id}` : "—") },
            {
              id: "owner",
              label: "Escalation owner",
              render: (row) => mapIncidentEscalationOwner(row).owner,
            },
          ]}
          rows={incidents}
          rowActions={(row) => (
            <div className="ops-md__row-actions">
              <ProtectedActionButton
                action="dispatch.reassign"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  openConfirm({
                    type: "incident",
                    incidentId: row.id,
                    incidentAction: "acknowledge",
                    label: `Acknowledge ${row.reference}`,
                  })
                }
              >
                Acknowledge
              </ProtectedActionButton>
              <ProtectedActionButton
                action="dispatch.reassign"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  openConfirm({
                    type: "incident",
                    incidentId: row.id,
                    incidentAction: "escalate",
                    label: `Escalate ${row.reference}`,
                    needsReason: true,
                  })
                }
              >
                Escalate
              </ProtectedActionButton>
              <ProtectedActionButton
                action="dispatch.reassign"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={() =>
                  openConfirm({
                    type: "incident",
                    incidentId: row.id,
                    incidentAction: "close",
                    label: `Resolve ${row.reference}`,
                    needsReason: true,
                  })
                }
              >
                Resolve
              </ProtectedActionButton>
              <button
                type="button"
                className="admin-lib-btn admin-lib-btn--ghost"
                onClick={async () => {
                  const blob = await exportIncidentReport(row.id);
                  const url = window.URL.createObjectURL(blob.data);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `incident-${row.reference}.csv`;
                  a.click();
                }}
              >
                Export
              </button>
              <a className="admin-lib-btn admin-lib-btn--ghost" href={mapIncidentEscalationOwner(row).href}>
                Route owner
              </a>
            </div>
          )}
        />
      </section>

      <div className="ops-md__grid ops-md__grid--main">
        <section className="ops-md__panel">
          <h2>Alerts & Notifications</h2>
          {alerts.length === 0 ? (
            <p className="admin-empty">No operational alerts</p>
          ) : (
            alerts.slice(0, 12).map((alert) => (
              <AlertBanner key={alert.id} tone={SEVERITY_TONE_SAFE(alert.severity)} title={alert.message}>
                <div className="ops-md__alert-meta">
                  <StatusChip label={alert.type} />
                  <span>{alert.entity_type} #{alert.entity_id}</span>
                </div>
                <button
                  type="button"
                  className="admin-lib-btn admin-lib-btn--ghost"
                  onClick={() => setSnoozedAlerts((prev) => new Set([...prev, alert.id]))}
                >
                  Acknowledge / snooze (session)
                </button>
              </AlertBanner>
            ))
          )}
          <p className="ops-md__hint">{ACTION_AVAILABILITY.alert_snooze_persist.reason}</p>
        </section>

        <section className="ops-md__panel" id="ops-handover">
          <h2>Shift Handover</h2>
          <div className="ops-md__form-grid">
            {Object.keys(handoverForm).map((key) => (
              <label key={key} className="admin-field">
                <span className="admin-field__label">{key.replace(/_/g, " ")}</span>
                <textarea
                  rows={2}
                  value={handoverForm[key]}
                  onChange={(e) => setHandoverForm((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <ProtectedActionButton action="dispatch.reassign" className="admin-lib-btn" onClick={submitHandover}>
            Submit handover
          </ProtectedActionButton>
          <h3 className="ops-md__subhead">Pending acknowledgements</h3>
          {(handovers || []).length === 0 ? (
            <p className="admin-empty">No submitted handovers</p>
          ) : (
            handovers.map((row) => (
              <article key={row.id} className="ops-md__handover-card">
                <strong>#{row.id}</strong> from {row.outgoing_operator?.name}
                <p>{row.important_notes || "No notes"}</p>
                <label className="admin-field">
                  <span className="admin-field__label">Follow-up notes</span>
                  <textarea rows={2} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
                </label>
                <ProtectedActionButton
                  action="dispatch.reassign"
                  className="admin-lib-btn"
                  onClick={() => acknowledgeHandover(row.id)}
                >
                  Acknowledge
                </ProtectedActionButton>
              </article>
            ))
          )}
        </section>
      </div>

      <section className="ops-md__panel">
        <h2>Recent Activity</h2>
        <ActivityFeed
          items={(dashboard?.timeline || []).slice(0, 15).map((event) => ({
            id: `${event.entity_type}-${event.entity_id}-${event.at}`,
            title: event.summary,
            description: event.type,
            timestamp: event.at,
          }))}
        />
      </section>

      <section className="ops-md__panel">
        <h2>Manual Intervention Matrix</h2>
        <DataTable
          searchable={false}
          columns={[
            { id: "action", label: "Action" },
            { id: "available", label: "Available", render: (row) => (row.available ? "Yes" : "No") },
            { id: "detail", label: "API / note" },
          ]}
          rows={Object.entries(ACTION_AVAILABILITY).map(([action, meta]) => ({
            id: action,
            action,
            available: meta.available,
            detail: meta.api || meta.reason || meta.note || "",
          }))}
        />
        <UnavailableAction label="Approve refund" reason={ACTION_AVAILABILITY.approve_refund.reason} />
        <UnavailableAction label="Approve withdrawal" reason={ACTION_AVAILABILITY.approve_withdrawal.reason} />
        <UnavailableAction label="Add ride note" reason={ACTION_AVAILABILITY.add_ride_note.reason} />
        <a className="admin-lib-btn admin-lib-btn--ghost" href="/admin/finance-ops">
          Request finance review (deep-link)
        </a>
      </section>

      <Drawer open={Boolean(selectedTrip)} title={selectedTrip ? `Ride #${selectedTrip.id}` : "Ride"} onClose={() => setSelectedTrip(null)}>
        {selectedTrip ? (
          <div className="ops-md__drawer">
            <StatusChip label={selectedTrip.status} />
            <p>
              <strong>Rider:</strong> {selectedTrip.rider?.name || "—"} ({maskPhone(selectedTrip.rider?.phone)})
            </p>
            <p>
              <strong>Driver:</strong> {selectedTrip.driver?.name || "Unassigned"} ({maskPhone(selectedTrip.driver?.phone)})
            </p>
            <p>
              <strong>Vehicle:</strong>{" "}
              {selectedTrip.vehicle
                ? `${selectedTrip.vehicle.make || ""} ${selectedTrip.vehicle.model || ""} · ${selectedTrip.vehicle.plate || ""}`
                : "—"}
            </p>
            <p>
              <strong>Pickup:</strong> {selectedTrip.pickup}
            </p>
            <p>
              <strong>Destination:</strong> {selectedTrip.destination}
            </p>
            <p>
              <strong>Fare:</strong> {formatCurrency(selectedTrip.fare)}
            </p>
            <p>
              <strong>Payment:</strong> {selectedTrip.payment_status || "—"}
            </p>
            <p>
              <strong>Waiting:</strong> {formatWait(selectedTrip.waiting_seconds)}
            </p>
            <p>
              <strong>Cancellation reason:</strong> {selectedTrip.cancellation_reason || "—"}
            </p>
            {selectedTrip.rider?.phone ? <a href={`tel:${selectedTrip.rider.phone}`}>Contact rider</a> : null}
            {" · "}
            {selectedTrip.driver?.phone ? <a href={`tel:${selectedTrip.driver.phone}`}>Contact driver</a> : null}
            <p className="ops-md__hint">Chat / notification timelines are not exposed on the center trip payload.</p>
          </div>
        ) : null}
      </Drawer>

      <Drawer open={Boolean(selectedDriver)} title={selectedDriver ? selectedDriver.name : "Driver"} onClose={() => setSelectedDriver(null)}>
        {selectedDriver ? (
          <div className="ops-md__drawer">
            <p>ID: {selectedDriver.id}</p>
            <p>Status: {selectedDriver.status}</p>
            <p>Contact: {maskPhone(selectedDriver.phone)}</p>
            <p>Vehicle: {selectedDriver.vehicle || "—"}</p>
            <a href="/admin/fleet">Open full fleet profile</a>
          </div>
        ) : null}
      </Drawer>

      <ConfirmationDialog
        open={Boolean(confirm)}
        title={confirm?.label || "Confirm"}
        message="This write action is audited. Confirm only if you verified live state on the server."
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirmed}
        confirmLabel="Confirm"
      />
      {confirm ? (
        <div className="ops-md__confirm-fields">
          {(confirm.type === "force_assign" || confirm.type === "reassign") && (
            <label className="admin-field">
              <span className="admin-field__label">Driver ID {confirm.type === "reassign" ? "(optional for rebroadcast)" : ""}</span>
              <input value={driverIdInput} onChange={(e) => setDriverIdInput(e.target.value)} />
            </label>
          )}
          {(confirm.needsReason || confirm.type === "force_assign" || confirm.type === "reassign" || confirm.type === "cancel" || confirm.type === "broadcast") && (
            <label className="admin-field">
              <span className="admin-field__label">Reason (min 10 chars)</span>
              <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SEVERITY_TONE_SAFE(severity) {
  if (severity === "critical" || severity === "high") return "danger";
  if (severity === "medium") return "warning";
  return "info";
}
