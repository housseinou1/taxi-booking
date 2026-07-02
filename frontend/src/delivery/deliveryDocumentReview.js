export const BICYCLE_COURIER_VEHICLE_TYPES = ["bicycle"];
export const MOTOR_VEHICLE_COURIER_TYPES = ["motorcycle", "car"];

export const COURIER_BICYCLE_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🪪", required: true },
];

export const COURIER_MOTORCYCLE_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🪪", required: true },
  { key: "license", label: "Driver license", icon: "🪪", required: true },
  { key: "carte_grise", label: "Registration", icon: "📋", required: true },
  { key: "insurance", label: "Insurance", icon: "🛡️", required: true },
];

export const COURIER_CAR_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🪪", required: true },
  { key: "license", label: "Driver license", icon: "🪪", required: true },
  { key: "carte_grise", label: "Registration", icon: "📋", required: true },
  { key: "insurance", label: "Insurance", icon: "🛡️", required: true },
];

export function isBicycleCourier(vehicleType = "") {
  return BICYCLE_COURIER_VEHICLE_TYPES.includes(String(vehicleType || "").toLowerCase());
}

export function isMotorVehicleCourier(vehicleType = "") {
  return MOTOR_VEHICLE_COURIER_TYPES.includes(String(vehicleType || "").toLowerCase());
}

export function getRequiredCourierDocumentTypes(deliveryVehicleType = "motorcycle") {
  if (isBicycleCourier(deliveryVehicleType)) return COURIER_BICYCLE_DOCUMENT_TYPES;
  if (String(deliveryVehicleType || "").toLowerCase() === "car") return COURIER_CAR_DOCUMENT_TYPES;
  return COURIER_MOTORCYCLE_DOCUMENT_TYPES;
}

function getDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiresAt);
  expDate.setHours(0, 0, 0, 0);
  const diffMs = expDate - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getDocumentDisplayStatus(document) {
  if (!document) return "missing";
  if (document.display_status) return document.display_status;
  if (document.expires_at) {
    const daysRemaining = getDaysRemaining(document.expires_at);
    if (daysRemaining !== null && daysRemaining < 0) return "expired";
  }
  if (document.status === "pending_review") return "pending_review";
  return document.status || "uploaded";
}

export function buildDocumentMap(documents) {
  const map = {};
  const list = Array.isArray(documents) ? documents : [];
  list.forEach((doc) => {
    map[doc.document_type] = doc;
  });
  if (!map.carte_grise && map.vehicle_registration) {
    map.carte_grise = map.vehicle_registration;
  }
  return map;
}

export function getExpiredOrMissingDocuments(documents, documentTypes = COURIER_MOTORCYCLE_DOCUMENT_TYPES) {
  const alerts = [];
  const uploadedMap = buildDocumentMap(documents);

  documentTypes.forEach((docType) => {
    if (!docType.required) return;
    const uploaded = uploadedMap[docType.key];
    if (!uploaded || uploaded.status === "rejected") {
      alerts.push({ key: docType.key, label: docType.label, reason: "missing" });
      return;
    }
    if (getDocumentDisplayStatus(uploaded) === "expired") {
      alerts.push({ key: docType.key, label: docType.label, reason: "expired" });
    }
  });

  return alerts;
}

export const COURIER_PROFILE_UNDER_REVIEW_MESSAGE = "Your Yala Delivery profile is under review.";
export const COURIER_DOCUMENT_EXPIRED_MESSAGE = "Document expired. Please update before going online.";

export function getCourierApprovalNotice(onboarding = {}) {
  if (onboarding.has_expired_documents) return COURIER_DOCUMENT_EXPIRED_MESSAGE;
  if (onboarding.profile_under_review || onboarding.driver_status === "pending_review") {
    return COURIER_PROFILE_UNDER_REVIEW_MESSAGE;
  }
  if (onboarding.driver_status === "rejected") {
    return onboarding.message || "Your courier application was rejected.";
  }
  if (onboarding.courier_status === "suspended" || onboarding.is_suspended) {
    return onboarding.suspension_reason || onboarding.message || "Your courier account is suspended.";
  }
  return onboarding.message || "";
}

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function validateDeliveryDocumentFile(file) {
  if (!file) return { valid: false, error: "No file selected." };
  const fileExtension = "." + file.name.split(".").pop().toLowerCase();
  const isValidFormat =
    ACCEPTED_FORMATS.includes(file.type) || ACCEPTED_EXTENSIONS.includes(fileExtension);
  if (!isValidFormat) {
    return { valid: false, error: "Invalid file format. Accepted formats: JPEG, PNG, PDF." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE_MB} MB limit. Please choose a smaller file.`,
    };
  }
  return { valid: true, error: null };
}
