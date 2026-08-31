export const RIDER_INCIDENT_CATEGORIES = [
  { id: "report_driver", label: "Dangerous driving", icon: "🚗", backendType: "report_driver" },
  { id: "harassment", label: "Harassment", icon: "🛑", backendType: "harassment" },
  { id: "medical_emergency", label: "Assault / medical emergency", icon: "🆘", backendType: "medical_emergency" },
  { id: "report_driver_vehicle", label: "Vehicle issue", icon: "🔧", backendType: "report_driver" },
  { id: "accident", label: "Accident", icon: "💥", backendType: "accident" },
  { id: "lost_property", label: "Lost property", icon: "🎒", backendType: "lost_property" },
  { id: "safety_incident", label: "Other safety concern", icon: "📋", backendType: "safety_incident" },
];

export const RIDER_SAFETY_TIP_KEYS = [
  "riderCheckDriver",
  "shareStatus",
  "sitComfortable",
  "useSos",
];

export function formatIncidentStatus(status = "") {
  const map = {
    open: "Submitted",
    acknowledged: "Acknowledged",
    investigating: "Investigating",
    resolved: "Resolved",
    dismissed: "Closed",
  };
  return map[String(status).toLowerCase()] || status;
}

export function formatIncidentType(value = "") {
  return String(value).replaceAll("_", " ");
}

export function getVerificationFields(ride = {}) {
  return {
    driverName:
      ride.driver_name ||
      [ride.driver_first_name, ride.driver_last_name].filter(Boolean).join(" ") ||
      "Driver",
    driverPhoto: ride.driver_photo || ride.driver?.profile_picture || "",
    vehicle:
      [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(" ") ||
      ride.vehicle ||
      "Vehicle pending",
    color: ride.vehicle_color || ride.car_color || "—",
    plate: ride.plate_number || ride.vehicle_plate || ride.driver_vehicle_plate || "—",
    verified: Boolean(ride.driver_verified),
  };
}
