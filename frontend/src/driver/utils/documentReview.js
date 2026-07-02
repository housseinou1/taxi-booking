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

/**
 * Get documents that are expired or missing (required but not uploaded).
 */
export function getExpiredOrMissingDocuments(
  documents,
  documentTypes = REQUIRED_DRIVER_DOCUMENT_TYPES,
) {
  const alerts = [];
  const uploadedMap = buildDocumentMap(documents);

  documentTypes.forEach((docType) => {
    if (!docType.required) return;

    const uploaded = uploadedMap[docType.key];

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
