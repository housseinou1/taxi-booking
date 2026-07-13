export const REQUIRED_DRIVER_DOCUMENT_TYPES = [
  {
    key: "license",
    label: "Driver License",
    icon: "🪪",
    required: true,
  },
  { key: "national_id", label: "National ID", icon: "🆔", required: true },
  {
    key: "insurance",
    label: "Insurance",
    icon: "🛡️",
    required: true,
  },
  {
    key: "carte_grise",
    label: "Carte Grise",
    icon: "📋",
    required: true,
  },
  {
    key: "vignette",
    label: "Vignette",
    icon: "📄",
    required: true,
  },
  {
    key: "vehicle_registration",
    label: "Vehicle Registration",
    icon: "📝",
    required: false,
  },
  {
    key: "plate_number_photo",
    label: "Plate Number",
    icon: "🔢",
    required: true,
    imageOnly: true,
  },
  { key: "profile_photo", label: "Profile Photo", icon: "📷", required: true },
];

export const BICYCLE_COURIER_VEHICLE_TYPES = ["bicycle"];
export const MOTOR_VEHICLE_COURIER_TYPES = ["motorcycle", "car"];

/** @deprecated use BICYCLE_COURIER_VEHICLE_TYPES */
export const LIGHT_COURIER_VEHICLE_TYPES = BICYCLE_COURIER_VEHICLE_TYPES;

export const COURIER_BICYCLE_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🆔", required: true },
];

export const COURIER_MOTORCYCLE_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🆔", required: true },
  { key: "license", label: "Driving license", icon: "🪪", required: true },
  { key: "carte_grise", label: "Motorcycle Registration", icon: "📋", required: true },
  { key: "insurance", label: "Insurance", icon: "🛡️", required: true },
];

export const COURIER_CAR_DOCUMENT_TYPES = [
  { key: "national_id", label: "National ID", icon: "🆔", required: true },
  { key: "license", label: "Driving license", icon: "🪪", required: true },
  { key: "carte_grise", label: "Vehicle Registration", icon: "📋", required: true },
  { key: "insurance", label: "Insurance", icon: "🛡️", required: true },
];

/** @deprecated use COURIER_MOTORCYCLE_DOCUMENT_TYPES or COURIER_CAR_DOCUMENT_TYPES */
export const COURIER_VEHICLE_DOCUMENT_TYPES = COURIER_MOTORCYCLE_DOCUMENT_TYPES;

/** @deprecated use COURIER_BICYCLE_DOCUMENT_TYPES */
export const COURIER_LIGHT_VEHICLE_DOCUMENT_TYPES = COURIER_BICYCLE_DOCUMENT_TYPES;

export function isBicycleCourier(vehicleType = "") {
  return BICYCLE_COURIER_VEHICLE_TYPES.includes(String(vehicleType || "").toLowerCase());
}

export function isMotorVehicleCourier(vehicleType = "") {
  return MOTOR_VEHICLE_COURIER_TYPES.includes(String(vehicleType || "").toLowerCase());
}

export function isLightCourierVehicle(vehicleType = "") {
  return isBicycleCourier(vehicleType);
}

export function getRequiredCourierDocumentTypes(deliveryVehicleType = "motorcycle") {
  if (isBicycleCourier(deliveryVehicleType)) {
    return COURIER_BICYCLE_DOCUMENT_TYPES;
  }
  if (String(deliveryVehicleType || "").toLowerCase() === "car") {
    return COURIER_CAR_DOCUMENT_TYPES;
  }
  return COURIER_MOTORCYCLE_DOCUMENT_TYPES;
}

export const DOCUMENTS_UNDER_REVIEW_TITLE = "Documents under review";
export const DOCUMENTS_UNDER_REVIEW_MESSAGE =
  "You have uploaded all required documents. Our team is reviewing your application. You will be able to go online once your documents are approved.";

export const DOCUMENT_EXPIRATION_ALERT_DAYS = 15;

export const COURIER_PROFILE_UNDER_REVIEW_MESSAGE =
  "Your Yala Delivery profile is under review.";

export const COURIER_DOCUMENT_EXPIRED_MESSAGE =
  "Document expired. Please update before going online.";

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

function getDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiresAt);
  expDate.setHours(0, 0, 0, 0);
  const diffMs = expDate - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getDocumentDaysUntilExpiration(document) {
  if (!document) return null;
  if (document.days_until_expiry !== undefined && document.days_until_expiry !== null) {
    return Number(document.days_until_expiry);
  }
  return getDaysRemaining(document.expires_at);
}

/**
 * Required-document expiration status used for menu badges and alert dots.
 * Optional document types are ignored.
 */
export function getRequiredDocumentExpirationStatus(document, docType = {}) {
  if (docType.required === false) return "valid";
  if (!document || document.status === "rejected") return "expired";

  const days = getDocumentDaysUntilExpiration(document);
  if (days === null) return "valid";
  if (days < 0) return "expired";
  if (days <= DOCUMENT_EXPIRATION_ALERT_DAYS) return "expiring_soon";
  return "valid";
}

export function getDocumentMenuStatusLabel(status) {
  const labels = {
    valid: "✓ Valid",
    expiring_soon: "⚠ Expiring Soon",
    expired: "● Expired",
    missing: "● Expired",
    pending_review: "Pending Review",
    rejected: "Rejected",
  };
  return labels[status] || status;
}

export function getExpiringSoonDocuments(
  documents,
  documentTypes = REQUIRED_DRIVER_DOCUMENT_TYPES,
) {
  const results = [];

  documentTypes.forEach((docType) => {
    if (!docType.required) return;
    const uploaded = findDocumentForRequiredType(documents, docType.key);
    if (!uploaded || uploaded.status === "rejected") return;

    const days = getDocumentDaysUntilExpiration(uploaded);
    if (days === null || days < 0 || days > DOCUMENT_EXPIRATION_ALERT_DAYS) return;

    results.push({
      key: docType.key,
      label: docType.label,
      days_remaining: days,
      expires_at: uploaded.expires_at,
    });
  });

  return results;
}

/** Mirror backend DocumentService legacy field checks. */
export function legacySatisfiesRequiredDocument(profile = {}, docType = "") {
  if (!profile || !docType) return false;
  switch (docType) {
    case "profile_photo":
      return Boolean(profile.driver_photo);
    case "plate_number_photo":
      return Boolean(profile.vehicle_plate || profile.plate_number);
    case "national_id":
      return Boolean(profile.has_national_id_document || profile.national_id_document);
    case "license":
      return Boolean(profile.license_file);
    case "insurance":
      return Boolean(profile.insurance_document);
    case "vignette":
      return Boolean(profile.vignette_document);
    case "carte_grise":
      return Boolean(profile.vehicle_registration);
    default:
      return false;
  }
}

function unresolvedMissingDocumentTypes(profile = {}) {
  const missing = Array.isArray(profile.missing_document_types)
    ? profile.missing_document_types
    : [];
  return missing.filter((docType) => !legacySatisfiesRequiredDocument(profile, docType));
}

export function getDriverDocumentsAlertLevel(profile = {}) {
  if (!profile) return null;

  if (profile.documents_alert_level) {
    return profile.documents_alert_level;
  }

  if (profile.documents_block_online) {
    return "error";
  }

  const missing = unresolvedMissingDocumentTypes(profile);
  const expired = profile.expired_document_types;
  if (
    (Array.isArray(missing) && missing.length > 0) ||
    (Array.isArray(expired) && expired.length > 0)
  ) {
    return "error";
  }

  if (Array.isArray(profile.expiring_soon_documents) && profile.expiring_soon_documents.length > 0) {
    return "warning";
  }

  if (Array.isArray(profile.documents) && profile.documents.length > 0) {
    if (getExpiredOrMissingDocuments(profile.documents).length > 0) {
      return "error";
    }
    if (getExpiringSoonDocuments(profile.documents).length > 0) {
      return "warning";
    }
    return null;
  }

  return null;
}

export function driverDocumentsBlockOnline(profile = {}) {
  if (!profile) return false;

  // QA/debug bypass: set localStorage.yala_debug_bypass_documents = "1"
  // in Chrome DevTools to unblock online status on test devices without
  // uploading real documents. Never enabled in production by default.
  try {
    if (typeof window !== "undefined" && window.localStorage?.getItem("yala_debug_bypass_documents") === "1") {
      return false;
    }
  } catch {
    // Ignore localStorage access errors
  }

  if (typeof profile.documents_block_online === "boolean") {
    return profile.documents_block_online;
  }
  if (Array.isArray(profile.expired_document_types) && profile.expired_document_types.length > 0) {
    return true;
  }
  return unresolvedMissingDocumentTypes(profile).length > 0;
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

export function findDocumentForRequiredType(documents, docTypeKey) {
  const list = Array.isArray(documents) ? documents : [];
  const direct = list.find((doc) => doc.document_type === docTypeKey);
  if (direct) return direct;
  if (docTypeKey === "carte_grise") {
    return list.find((doc) => doc.document_type === "vehicle_registration") || null;
  }
  return null;
}

/**
 * Get documents that are expired or missing (required but not uploaded).
 */
export function getExpiredOrMissingDocuments(
  documents,
  documentTypes = REQUIRED_DRIVER_DOCUMENT_TYPES,
) {
  const alerts = [];
  documentTypes.forEach((docType) => {
    if (!docType.required) return;

    const uploaded = findDocumentForRequiredType(documents, docType.key);

    if (!uploaded || uploaded.status === "rejected") {
      alerts.push({
        key: docType.key,
        label: docType.label,
        reason: "missing",
      });
      return;
    }

    const displayStatus = getDocumentDisplayStatus(uploaded);
    if (displayStatus === "expired") {
      alerts.push({
        key: docType.key,
        label: docType.label,
        reason: "expired",
      });
      return;
    }

    if (uploaded.expires_at) {
      const daysRemaining = getDaysRemaining(uploaded.expires_at);
      if (daysRemaining !== null && daysRemaining < 0) {
        alerts.push({
          key: docType.key,
          label: docType.label,
          reason: "expired",
        });
      }
    }
  });

  return alerts;
}

export function areAllRequiredDocumentsUploaded(
  documents,
  documentTypes = REQUIRED_DRIVER_DOCUMENT_TYPES,
) {
  return getExpiredOrMissingDocuments(documents, documentTypes).length === 0;
}

export function shouldShowDocumentsUnderReview({
  documents = [],
  driverStatus = "pending",
  documentsUnderReview,
  allRequiredDocumentsUploaded,
} = {}) {
  if (driverStatus === "approved") {
    return false;
  }

  if (driverStatus === "pending_review") {
    return true;
  }

  if (typeof documentsUnderReview === "boolean") {
    return documentsUnderReview;
  }

  if (typeof allRequiredDocumentsUploaded === "boolean") {
    return allRequiredDocumentsUploaded && driverStatus !== "approved";
  }

  return areAllRequiredDocumentsUploaded(documents);
}

/**
 * True when the driver menu should show a documents alert dot.
 * Orange for expiring soon (<=15 days), red for expired/missing.
 */
export function driverNeedsDocumentAlert(profile = {}) {
  return getDriverDocumentsAlertLevel(profile) !== null;
}

export function getDriverApprovalNotice(profile = {}, documents = []) {
  const status = profile?.status || "pending";

  if (status === "approved") {
    return "Verified driver. You can go online and receive ride requests.";
  }

  if (status === "rejected") {
    return (
      profile?.document_rejection_reason ||
      "Your driver application was rejected. Update your documents and submit again for admin review."
    );
  }

  if (
    shouldShowDocumentsUnderReview({
      documents,
      driverStatus: status,
      documentsUnderReview: profile?.documents_under_review,
      allRequiredDocumentsUploaded: profile?.all_required_documents_uploaded,
    })
  ) {
    return DOCUMENTS_UNDER_REVIEW_MESSAGE;
  }

  return "Upload all required documents to complete your driver application.";
}

export function getCourierApprovalNotice(onboarding = {}) {
  if (onboarding.has_expired_documents) {
    return COURIER_DOCUMENT_EXPIRED_MESSAGE;
  }
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
