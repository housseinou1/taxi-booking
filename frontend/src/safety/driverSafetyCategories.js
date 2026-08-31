export const DRIVER_INCIDENT_CATEGORIES = [
  { id: "accident", label: "Accident", icon: "🚗" },
  { id: "vehicle_breakdown", label: "Vehicle breakdown", icon: "🔧" },
  { id: "unsafe_passenger", label: "Unsafe passenger", icon: "⚠️" },
  { id: "harassment", label: "Harassment", icon: "🛑" },
  { id: "lost_property", label: "Lost property", icon: "🧳" },
  { id: "medical_emergency", label: "Medical emergency", icon: "🏥" },
  { id: "other", label: "Other", icon: "📋" },
];

export const DRIVER_SAFETY_TIPS = [
  {
    id: "verify_rider",
    title: "Verify the rider",
    text: "Confirm the rider name and pickup PIN before starting the trip.",
  },
  {
    id: "share_trip",
    title: "Share your trip",
    text: "Send a live trip link to a trusted contact when driving at night.",
  },
  {
    id: "pull_over",
    title: "Stop safely first",
    text: "Pull over before using SOS or reporting an incident.",
  },
  {
    id: "local_numbers",
    title: "Know local numbers",
    text: "Save police, ambulance, and Yala support in your phone.",
  },
];

export function formatIncidentType(value = "") {
  return String(value).replaceAll("_", " ");
}

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
