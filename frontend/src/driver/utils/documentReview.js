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

export const DOCUMENTS_UNDER_REVIEW_TITLE = "Documents under review";
export const DOCUMENTS_UNDER_REVIEW_MESSAGE =
  "You have uploaded all required documents. Our team is reviewing your application. You will be able to go online once your documents are approved.";

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
export function getExpiredOrMissingDocuments(documents) {
  const alerts = [];
  const uploadedMap = buildDocumentMap(documents);

  REQUIRED_DRIVER_DOCUMENT_TYPES.forEach((docType) => {
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

export function areAllRequiredDocumentsUploaded(documents) {
  return getExpiredOrMissingDocuments(documents).length === 0;
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
