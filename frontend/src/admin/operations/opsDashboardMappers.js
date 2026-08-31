const SEVERITY_TONE = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

export function formatWait(seconds) {
  if (seconds == null) return "—";
  const mins = Math.floor(Number(seconds) / 60);
  const secs = Number(seconds) % 60;
  return `${mins}m ${secs}s`;
}

export function maskPhone(phone) {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

export function buildOpsKpis(dashboard) {
  const s = dashboard?.live_summary || {};
  return [
    { id: "drivers_online", label: "Drivers online", value: s.drivers_online, filter: "drivers:online" },
    { id: "drivers_available", label: "Drivers available", value: s.drivers_available, filter: "drivers:available", tone: "success" },
    { id: "drivers_on_trip", label: "Drivers on trip", value: s.drivers_on_trip, filter: "drivers:busy" },
    { id: "active_requests", label: "Active ride requests", value: s.active_ride_requests, filter: "status:requested" },
    { id: "assigned", label: "Assigned rides", value: s.assigned_rides, filter: "status:assigned" },
    { id: "arriving", label: "Drivers arriving", value: s.drivers_arriving, filter: "status:driver_arriving" },
    { id: "in_progress", label: "Trips in progress", value: s.trips_in_progress, filter: "status:in_progress" },
    { id: "deliveries", label: "Active deliveries", value: s.active_deliveries, filter: "service:delivery" },
    { id: "unassigned", label: "Unassigned requests", value: s.unassigned_requests, filter: "status:unassigned", tone: "warning" },
    { id: "delayed", label: "Delayed pickups", value: s.delayed_pickups, filter: "risk:delayed", tone: (s.delayed_pickups || 0) > 0 ? "danger" : undefined },
    { id: "cancelled", label: "Cancelled rides today", value: s.cancelled_rides_today, filter: "status:cancelled" },
    { id: "incidents", label: "Open incidents", value: s.open_incidents, filter: "panel:incidents", tone: (s.open_incidents || 0) > 0 ? "danger" : undefined },
    { id: "avg_pickup", label: "Avg pickup time", value: s.average_pickup_time_minutes, format: "minutes", filter: "panel:dispatch" },
    { id: "completion", label: "Ride completion rate", value: s.ride_completion_rate, format: "percent", filter: "panel:dispatch" },
  ];
}

export function riskForTrip(trip) {
  const wait = trip?.waiting_seconds || 0;
  if (wait > 900) return { label: "Critical delay", tone: "danger" };
  if (wait > 600) return { label: "Delayed", tone: "warning" };
  if (!trip?.driver?.id && trip?.status === "requested") return { label: "Unassigned", tone: "warning" };
  return { label: "OK", tone: "success" };
}

export function buildExceptionQueue({ dashboard, alerts = [] }) {
  const items = [];
  const seen = new Set();

  const push = (item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    items.push({
      ...item,
      tone: SEVERITY_TONE[item.severity] || "warning",
      status: item.status || "new",
    });
  };

  (alerts.length ? alerts : dashboard?.alerts || []).forEach((alert) => {
    push({
      id: alert.id,
      severity: alert.severity || "medium",
      reason: alert.message || alert.type,
      type: alert.type,
      created_at: alert.created_at,
      entity_type: alert.entity_type,
      entity_id: alert.entity_id,
      recommended_action: recommendedAction(alert.type),
      assigned_operator: null,
    });
  });

  (dashboard?.trips || []).forEach((trip) => {
    if ((trip.waiting_seconds || 0) > 600 && ["requested", "driver_arriving"].includes(trip.status)) {
      push({
        id: `search-long-${trip.id}`,
        severity: "high",
        reason: `Ride #${trip.id} searching/waiting too long`,
        type: "ride_searching_too_long",
        created_at: trip.created_at,
        entity_type: "ride",
        entity_id: trip.id,
        related_ride: trip.id,
        related_driver: trip.driver?.id,
        recommended_action: "Reassign or broadcast nearby drivers",
      });
    }
  });

  (dashboard?.deliveries || []).forEach((delivery) => {
    if (["picked_up", "in_transit", "assigned"].includes(delivery.status) && delivery.eta_minutes != null && delivery.eta_minutes > 45) {
      push({
        id: `delivery-overdue-${delivery.id}`,
        severity: "medium",
        reason: `Delivery #${delivery.id} overdue ETA`,
        type: "delivery_overdue",
        created_at: delivery.created_at,
        entity_type: "delivery",
        entity_id: delivery.id,
        recommended_action: "Contact courier or reassign",
      });
    }
  });

  return items.sort((a, b) => {
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9);
  });
}

function recommendedAction(type) {
  const map = {
    excessive_waiting: "Check driver ETA and reassign if needed",
    driver_offline_during_trip: "Contact driver; escalate if no response",
    document_expiry: "Route to Driver Operations",
    fraud_alert: "Escalate to Trust & Safety",
    surge_demand: "Monitor supply; consider broadcast",
  };
  return map[type] || "Investigate and update status";
}

export function buildDriverBoard(fleet = {}) {
  const rows = [];
  const push = (driver, state) => {
    rows.push({
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      vehicle: driver.vehicle || driver.vehicle_plate,
      plate: driver.vehicle_plate || "—",
      status: state,
      lat: driver.lat,
      lng: driver.lng,
      is_available: driver.is_available,
      current_ride: driver.current_ride || null,
      rating: driver.rating,
      acceptance_rate: driver.acceptance_rate,
      cancellation_rate: driver.cancellation_rate,
      last_gps_at: driver.last_gps_at || driver.updated_at,
      online_duration: driver.online_duration,
    });
  };
  (fleet.online_drivers || []).forEach((d) => push(d, "available"));
  (fleet.busy_drivers || []).forEach((d) => push(d, "on_trip"));
  (fleet.offline_drivers || []).forEach((d) => push(d, "offline"));
  (fleet.online_couriers || []).forEach((d) => push(d, "on_delivery"));
  return rows;
}

export function mapIncidentEscalationOwner(incident) {
  const type = String(incident?.incident_type || "").toLowerCase();
  const severity = String(incident?.severity || "").toLowerCase();
  if (severity === "critical" || type.includes("safety") || type.includes("accident") || type.includes("harass")) {
    return { owner: "CEO / Trust & Safety", href: "/admin/trust-safety" };
  }
  if (type.includes("payment") || type.includes("fraud")) {
    return { owner: "Finance / Trust & Safety", href: "/admin/finance-ops" };
  }
  if (type.includes("driver") || type.includes("conduct") || type.includes("document")) {
    return { owner: "Driver Operations", href: "/admin/fleet" };
  }
  if (type.includes("complaint") || type.includes("rider") || type.includes("lost")) {
    return { owner: "Support", href: "/admin/support" };
  }
  if (type.includes("system") || type.includes("app") || type.includes("outage")) {
    return { owner: "System Admin", href: "/admin/status" };
  }
  return { owner: "Operations", href: "/admin/ops-control" };
}

export const ACTION_AVAILABILITY = {
  reassign: { available: true, api: "POST /operations/center/rides/{id}/reassign/" },
  force_assign: { available: true, api: "POST /operations/center/rides/{id}/force-assign/" },
  cancel_ride: { available: true, api: "POST /operations/center/rides/{id}/cancel/" },
  contact_rider: { available: true, mode: "tel_link", note: "Uses masked tel: link; no SMS API" },
  contact_driver: { available: true, mode: "tel_link", note: "Uses masked tel: link; no SMS API" },
  broadcast_nearby: { available: true, api: "POST /operations/center/broadcast-nearby/" },
  pause_driver: { available: true, api: "POST /operations/center/drivers/{id}/pause/" },
  incident_ack: { available: true, api: "POST /operations/center/incidents/{id}/action/" },
  incident_escalate: { available: true, api: "POST /operations/center/incidents/{id}/action/" },
  incident_close: { available: true, api: "POST /operations/center/incidents/{id}/action/" },
  shift_handover: { available: true, api: "POST /operations/center/handovers/" },
  add_ride_note: { available: false, reason: "No ride ops-note endpoint" },
  request_finance_review: { available: false, reason: "No ops→finance review ticket API; deep-link only" },
  alert_snooze_persist: { available: false, reason: "Alerts are computed snapshots; snooze is session-local only" },
  approve_refund: { available: false, reason: "Financial approvals outside Operations RBAC" },
  approve_withdrawal: { available: false, reason: "Financial approvals outside Operations RBAC" },
};
