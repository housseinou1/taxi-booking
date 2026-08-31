import authenticatedApi from "../../auth/authenticatedApi";
import { API_URL } from "../../apiConfig";

const BASE = `${API_URL}/operations/support`;

export const QUEUE_TABS = [
  "open",
  "assigned",
  "waiting",
  "waiting_internal",
  "escalated",
  "sla_breach",
  "lost_property",
  "resolved",
  "closed",
  "reopened",
];

export const STATUS_OPTIONS = [
  { value: "open", label: "New" },
  { value: "assigned", label: "Open" },
  { value: "waiting", label: "Waiting for customer" },
  { value: "waiting_internal", label: "Waiting for internal team" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "reopened", label: "Reopened" },
];

export const CATEGORY_OPTIONS = [
  "ride",
  "delivery",
  "payment",
  "refund",
  "driver",
  "rider",
  "safety",
  "lost_property",
  "account",
  "promotion",
  "technical",
  "other",
];

export const SEVERITY_OPTIONS = ["P0", "P1", "P2", "P3"];
export const APP_OPTIONS = [
  { value: "rider", label: "Rider" },
  { value: "driver", label: "Driver" },
  { value: "delivery", label: "Courier" },
];

export const LOST_PROPERTY_STATUSES = [
  "reported",
  "driver_contacted",
  "item_found",
  "return_arranged",
  "returned",
  "not_found",
  "closed",
];

export const SAVED_REPLY_TEMPLATES = {
  en: [
    { id: "ack_en", label: "Acknowledgement", body: "Thank you for contacting YALA Support. We have received your request and are looking into it." },
    { id: "eta_en", label: "Working on it", body: "We are actively investigating your case and will update you shortly." },
    { id: "resolved_en", label: "Resolved", body: "Your case has been resolved. Please reply if you need further help." },
  ],
  fr: [
    { id: "ack_fr", label: "Accusé de réception", body: "Merci d'avoir contacté le support YALA. Nous avons bien reçu votre demande." },
    { id: "eta_fr", label: "En cours", body: "Nous analysons votre dossier et vous tiendrons informé(e) rapidement." },
    { id: "resolved_fr", label: "Résolu", body: "Votre dossier a été résolu. Répondez-nous si vous avez besoin d'aide." },
  ],
  ar: [
    { id: "ack_ar", label: "تأكيد الاستلام", body: "شكرًا لتواصلك مع دعم يالا. استلمنا طلبك وسنراجعه." },
    { id: "eta_ar", label: "قيد المعالجة", body: "نحن نعمل على حالتك وسنوافيك بالتحديث قريبًا." },
    { id: "resolved_ar", label: "تم الحل", body: "تم حل حالتك. يرجى الرد إذا احتجت إلى مساعدة إضافية." },
  ],
};

export function fetchSupportList(params = {}) {
  return authenticatedApi.get(`${BASE}/`, { params });
}

export function fetchSupportDashboard(params = {}) {
  return authenticatedApi.get(`${BASE}/dashboard/`, { params });
}

export function fetchSupportTicket(id) {
  return authenticatedApi.get(`${BASE}/${id}/`);
}

export function updateSupportTicket(id, payload) {
  return authenticatedApi.patch(`${BASE}/${id}/`, payload);
}

export function bulkAssignTickets(ticketIds, ownerId) {
  return authenticatedApi.post(`${BASE}/bulk-assign/`, {
    ticket_ids: ticketIds,
    owner_id: ownerId,
  });
}

export function ticketsToCsv(rows) {
  const headers = [
    "reference",
    "customer",
    "customer_type",
    "category",
    "priority",
    "status",
    "owner",
    "created_at",
    "sla_resolution_due",
  ];
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(
      [
        row.reference,
        row.user_email || row.user_name,
        row.customer_type || row.app_type,
        row.category,
        row.priority || row.severity,
        row.status,
        row.owner_email || "",
        row.created_at,
        row.sla_resolution_due || "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
  });
  return lines.join("\n");
}
