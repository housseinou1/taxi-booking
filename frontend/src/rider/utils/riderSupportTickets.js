const STORAGE_KEY = "yala_rider_support_tickets";

export const RIDER_SUPPORT_CATEGORIES = [
  { id: "driver", label: "Driver problem", icon: "👤" },
  { id: "payment", label: "Fare or payment issue", icon: "💳" },
  { id: "lost", label: "Lost property", icon: "🎒" },
  { id: "ride", label: "Cancellation issue", icon: "🚫" },
  { id: "emergency", label: "Safety issue", icon: "🆘" },
  { id: "bug", label: "App problem", icon: "🐛" },
  { id: "other", label: "Other", icon: "💬" },
];

function loadTickets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets.slice(0, 50)));
}

export function listRiderSupportTickets() {
  return loadTickets().sort(
    (first, second) =>
      new Date(second.updatedAt || second.createdAt || 0).getTime() -
      new Date(first.updatedAt || first.createdAt || 0).getTime()
  );
}

export function saveRiderSupportTicket(ticket = {}) {
  const entry = {
    id: ticket.id || ticket.reference || `SX-${Date.now().toString().slice(-6)}`,
    reference: ticket.reference || ticket.id,
    category: ticket.category || "other",
    status: ticket.status || "open",
    description: ticket.description || "",
    rideId: ticket.ride_id || ticket.rideId || null,
    createdAt: ticket.created_at || ticket.createdAt || new Date().toISOString(),
    updatedAt: ticket.updated_at || ticket.updatedAt || new Date().toISOString(),
    timeline: Array.isArray(ticket.timeline)
      ? ticket.timeline
      : [
          {
            at: ticket.created_at || new Date().toISOString(),
            author: "you",
            message: ticket.description || "Support request submitted.",
          },
        ],
  };

  const existing = loadTickets().filter((row) => row.reference !== entry.reference);
  saveTickets([entry, ...existing]);
  return entry;
}

export function appendRiderSupportReply(reference, reply = {}) {
  const tickets = loadTickets();
  const index = tickets.findIndex((row) => row.reference === reference || row.id === reference);
  if (index < 0) return null;

  const timelineEntry = {
    at: reply.at || new Date().toISOString(),
    author: reply.author || "support",
    message: reply.message || reply.body || "Support replied to your ticket.",
  };

  tickets[index] = {
    ...tickets[index],
    status: reply.status || tickets[index].status || "in_progress",
    updatedAt: timelineEntry.at,
    timeline: [...(tickets[index].timeline || []), timelineEntry],
  };
  saveTickets(tickets);
  return tickets[index];
}

export function getRiderSupportTicket(reference) {
  return listRiderSupportTickets().find(
    (row) => row.reference === reference || row.id === reference
  );
}
