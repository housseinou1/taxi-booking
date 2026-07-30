import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { isDeliveryCourierApp } from "../native/platform";
import "./DriverDocuments.css";
import DocumentsUnderReviewBanner from "./components/DocumentsUnderReviewBanner";
import {
  DOCUMENTS_UNDER_REVIEW_MESSAGE,
  DOCUMENT_EXPIRATION_ALERT_DAYS,
  getExpiredOrMissingDocuments,
  getExpiringSoonDocuments,
  getRequiredCourierDocumentTypes,
  getRequiredDocumentExpirationStatus,
  isBicycleCourier,
  isMotorVehicleCourier,
  REQUIRED_DRIVER_DOCUMENT_TYPES,
  shouldShowDocumentsUnderReview,
} from "./utils/documentReview";

// ─── Constants ──────────────────────────────────────────────────────────────

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const EXPIRATION_WARNING_DAYS = DOCUMENT_EXPIRATION_ALERT_DAYS;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calculate days remaining until expiration.
 * @param {string|null} expiresAt - ISO date string
 * @returns {number|null} Days remaining, or null if no expiration
 */
function getDaysRemaining(expiresAt) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiresAt);
  expDate.setHours(0, 0, 0, 0);
  const diffMs = expDate - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Validate a file for upload.
 * @param {File} file
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateDocumentFile(file) {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  // Check file format
  const fileExtension = "." + file.name.split(".").pop().toLowerCase();
  const isValidFormat =
    ACCEPTED_FORMATS.includes(file.type) ||
    ACCEPTED_EXTENSIONS.includes(fileExtension);

  if (!isValidFormat) {
    return {
      valid: false,
      error: "Invalid file format. Accepted formats: JPEG, PNG, PDF.",
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds ${MAX_FILE_SIZE_MB} MB limit. Please choose a smaller file.`,
    };
  }

  return { valid: true, error: null };
}

export { getExpiredOrMissingDocuments } from "./utils/documentReview";

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DriverDocuments() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadingType, setUploadingType] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [uploadDates, setUploadDates] = useState({
    issued_at: "",
    expires_at: "",
  });
  const [documentsUnderReview, setDocumentsUnderReview] = useState(false);
  const [deliveryVehicleType, setDeliveryVehicleType] = useState("motorcycle");

  const isDeliveryCourier = isDeliveryCourierApp();
  const documentTypes = useMemo(
    () =>
      isDeliveryCourier
        ? getRequiredCourierDocumentTypes(deliveryVehicleType)
        : REQUIRED_DRIVER_DOCUMENT_TYPES,
    [deliveryVehicleType, isDeliveryCourier],
  );
  const isBicycleCourierProfile = isDeliveryCourier && isBicycleCourier(deliveryVehicleType);
  const isMotorVehicleCourierProfile =
    isDeliveryCourier && isMotorVehicleCourier(deliveryVehicleType);

  const fileInputRef = useRef(null);
  const selectedDocTypeRef = useRef(null);

  // ─── Fetch Documents ────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const documentsUrl = isDeliveryCourier
        ? `${API_URL}/drivers/me/documents/?context=delivery`
        : `${API_URL}/drivers/me/documents/`;
      const response = await authenticatedApi.get(documentsUrl);
      // Backend returns { documents: [...], expiring_documents: [...], alerts: [...] }
      const data = response.data;
      const nextDocuments = data.documents || data.results || data || [];
      setDocuments(nextDocuments);
      if (data.delivery_vehicle_type) {
        setDeliveryVehicleType(data.delivery_vehicle_type);
      }
      setDocumentsUnderReview(
        shouldShowDocumentsUnderReview({
          documents: nextDocuments,
          documentsUnderReview: data.documents_under_review,
          allRequiredDocumentsUploaded: data.all_required_documents_uploaded,
        })
      );
    } catch (err) {
      setError("Failed to load documents. Please try again.");
      console.error("Documents fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [isDeliveryCourier]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ─── WebSocket Handler for document_status ──────────────────────────────

  useEffect(() => {
    // Listen for document_status messages from the WebSocket
    // The DriverContext/WebSocket hook dispatches messages; we handle them here
    function handleWebSocketMessage(event) {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.type === "document_status") {
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.document_type === data.document_type
                ? {
                    ...doc,
                    status: data.status,
                    rejection_reason: data.reason || doc.rejection_reason,
                  }
                : doc
            )
          );
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Subscribe to custom event for WebSocket messages
    window.addEventListener("driver_ws_message", handleWebSocketMessage);
    return () => {
      window.removeEventListener("driver_ws_message", handleWebSocketMessage);
    };
  }, []);

  // ─── Upload Handler ─────────────────────────────────────────────────────

  const handleUploadClick = useCallback((docTypeKey) => {
    setUploadError(null);
    setUploadSuccess(null);
    selectedDocTypeRef.current = docTypeKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  const handleFileSelected = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const docTypeKey = selectedDocTypeRef.current;
      if (!docTypeKey) return;

      // Client-side validation
      const validation = validateDocumentFile(file);
      if (!validation.valid) {
        setUploadError(validation.error);
        return;
      }

      // Image-only restriction for plate number photo
      const docType = documentTypes.find((item) => item.key === docTypeKey);
      if (docType?.imageOnly) {
        const ext = "." + file.name.split(".").pop().toLowerCase();
        if (ext === ".pdf" || file.type === "application/pdf") {
          setUploadError("Plate Number requires an image file (JPEG or PNG). PDF is not accepted.");
          return;
        }
      }

      setUploadError(null);
      setUploadSuccess(null);
      setPendingUpload({ file, docTypeKey });
      setUploadDates({ issued_at: "", expires_at: "" });
    },
    []
  );

  const submitPendingUpload = useCallback(
    async () => {
      if (!pendingUpload) return;
      const { file, docTypeKey } = pendingUpload;

      setUploadingType(docTypeKey);
      setUploadError(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("document_type", docTypeKey);

        const uploadResponse = await authenticatedApi.post(
          `${API_URL}/drivers/me/documents/upload/`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );

        setPendingUpload(null);
        window.dispatchEvent(new CustomEvent("yala:documents-changed"));
        if (uploadResponse?.data?.documents_under_review) {
          setUploadSuccess(DOCUMENTS_UNDER_REVIEW_MESSAGE);
        } else {
          setUploadSuccess(
            `${documentTypes.find((d) => d.key === docTypeKey)?.label || "Document"} uploaded successfully.`
          );
        }

        // Refresh documents list
        await fetchDocuments();
      } catch (err) {
        const serverError =
          err.response?.data?.error ||
          err.response?.data?.detail ||
          "Upload failed. Please try again.";
        setUploadError(serverError);
      } finally {
        setUploadingType(null);
      }
    },
    [fetchDocuments, pendingUpload, uploadDates]
  );

  // ─── Computed Values ────────────────────────────────────────────────────

  const documentAlerts = useMemo(
    () => getExpiredOrMissingDocuments(documents, documentTypes),
    [documents, documentTypes]
  );

  const expiringSoonDocuments = useMemo(
    () => getExpiringSoonDocuments(documents, documentTypes),
    [documents, documentTypes]
  );

  const documentMap = useMemo(() => {
    const map = {};
    documents.forEach((doc) => {
      map[doc.document_type] = doc;
    });
    if (!map.carte_grise && map.vehicle_registration) {
      map.carte_grise = map.vehicle_registration;
    }
    return map;
  }, [documents]);

  // ─── Loading State ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="dd-container">
        <div className="dd-state" role="status" aria-live="polite">
          <span className="dd-state__icon" aria-hidden="true">⏳</span>
          <p className="dd-state__text">Loading documents...</p>
        </div>
      </main>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────

  if (error) {
    return (
      <main className="dd-container">
        <div className="dd-state">
          <p className="dd-state__text">{error}</p>
          <button type="button" className="dd-retry-btn" onClick={fetchDocuments}>
            Retry
          </button>
        </div>
      </main>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <main className="dd-container">
      <div className="dd-accent-bar" aria-hidden="true" />

      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        className="dd-hidden-input"
        onChange={handleFileSelected}
        aria-label="Upload document file"
      />

      {documentAlerts.length > 0 && (
        <div className="dd-alert dd-alert--danger" role="alert" aria-live="assertive">
          <span className="dd-alert__icon" aria-hidden="true">●</span>
          <div className="dd-alert__content">
            <strong className="dd-alert__title">Action Required</strong>
            <p className="dd-alert__message">
              Upload renewed documents before going online.{" "}
              {documentAlerts.map((alert, idx) => (
                <span key={alert.key}>
                  {alert.label} ({alert.reason === "expired" ? "expired" : "missing"})
                  {idx < documentAlerts.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {documentAlerts.length === 0 && expiringSoonDocuments.length > 0 && (
        <div className="dd-alert dd-alert--warning" role="status" aria-live="polite">
          <span className="dd-alert__icon" aria-hidden="true">⚠</span>
          <div className="dd-alert__content">
            <strong className="dd-alert__title dd-alert__title--warning">
              Documents expiring soon
            </strong>
            <p className="dd-alert__message">
              {expiringSoonDocuments.map((item, idx) => (
                <span key={item.key}>
                  {item.label}: Expiring in {item.days_remaining} day
                  {item.days_remaining !== 1 ? "s" : ""}
                  {idx < expiringSoonDocuments.length - 1 ? "; " : ""}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      <header className="dd-header">
        <h1 className="dd-title">
          <span aria-hidden="true">📄</span>
          {isDeliveryCourier ? "Courier documents" : "Document Center"}
        </h1>
        <p className="dd-subtitle">
          {isBicycleCourierProfile
            ? "Upload your National ID. Profile photo is added during profile setup."
            : isMotorVehicleCourierProfile
            ? "Upload National ID, license, registration, and insurance for your courier type."
            : "Upload and manage your required documents"}
        </p>
      </header>

      {documentsUnderReview && <DocumentsUnderReviewBanner />}

      {uploadError && (
        <div className="dd-feedback dd-feedback--error" role="status" aria-live="assertive">
          <span aria-hidden="true">❌</span> {uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div className="dd-feedback dd-feedback--success" role="status" aria-live="polite">
          <span aria-hidden="true">✅</span> {uploadSuccess}
        </div>
      )}

      {pendingUpload && (
        <div className="dd-upload-details">
          <strong className="dd-upload-details__title">
            Complete {documentTypes.find((item) => item.key === pendingUpload.docTypeKey)?.label}
          </strong>
          <span className="dd-upload-details__file">{pendingUpload.file.name}</span>
          <div className="dd-upload-details__actions">
            <button
              type="button"
              onClick={() => setPendingUpload(null)}
              className="dd-btn dd-btn--outline"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitPendingUpload}
              disabled={Boolean(uploadingType)}
              className="dd-btn dd-btn--primary"
            >
              {uploadingType ? "Uploading..." : "Upload document"}
            </button>
          </div>
        </div>
      )}

      <div className="dd-document-list">
        {documentTypes.map((docType) => {
          const doc = documentMap[docType.key];
          const daysRemaining = doc?.expires_at
            ? getDaysRemaining(doc.expires_at)
            : doc?.days_until_expiry ?? null;
          const expirationStatus = getRequiredDocumentExpirationStatus(doc, docType);
          const showExpirationWarning = expirationStatus === "expiring_soon";
          const isExpired = expirationStatus === "expired";
          const isUploading = uploadingType === docType.key;

          return (
            <DocumentCard
              key={docType.key}
              docType={docType}
              document={doc}
              daysRemaining={daysRemaining}
              expirationStatus={expirationStatus}
              showExpirationWarning={showExpirationWarning}
              isExpired={isExpired}
              isUploading={isUploading}
              onUpload={handleUploadClick}
            />
          );
        })}
      </div>
    </main>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function DocumentCard({
  docType,
  document: doc,
  daysRemaining,
  expirationStatus,
  showExpirationWarning,
  isExpired,
  isUploading,
  onUpload,
}) {
  const status = !doc
    ? "missing"
    : doc.display_status === "rejected" || doc.status === "rejected"
      ? "rejected"
      : expirationStatus === "expired"
        ? "expired"
        : expirationStatus === "expiring_soon"
          ? "expiring_soon"
          : (doc.display_status === "approved" || doc.status === "approved") && expirationStatus === "valid"
            ? "valid"
            : doc.display_status || doc.status || null;

  const showExpiredBadge = isExpired && status !== "rejected";

  return (
    <div className="dd-document-card">
      <div className="dd-document-card__header">
        <div className="dd-document-info">
          <span className="dd-document-icon" aria-hidden="true">
            {docType.icon}
            {showExpiredBadge ? <span className="dd-document-icon__dot" aria-label="Expired document" /> : null}
          </span>
          <div className="dd-document-meta">
            <h3 className="dd-document-name">{docType.label}</h3>
            {doc && (
              <div className="dd-document-dates">
                <span>Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                {doc.issued_at && <span>Issued: {doc.issued_at}</span>}
                {doc.expires_at && <span>Expires: {doc.expires_at}</span>}
              </div>
            )}
          </div>
        </div>

        {(status || !doc) && <StatusBadge status={status} />}
      </div>

      {showExpirationWarning && (
        <div className="dd-expiration-warning" role="status" aria-live="polite">
          <span aria-hidden="true">⚠</span>
          <span>
            Expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {showExpiredBadge && (
        <div className="dd-expired-badge" aria-label="Expired">
          <span aria-hidden="true">🚫</span>
          <span>Expired</span>
        </div>
      )}

      {status === "rejected" && doc?.rejection_reason && (
        <div className="dd-rejection-reason">
          <strong>Reason:</strong> {doc.rejection_reason}
        </div>
      )}

      <button
        type="button"
        className="dd-upload-btn"
        onClick={() => onUpload(docType.key)}
        disabled={isUploading}
        aria-label={doc ? `Replace ${docType.label}` : `Upload ${docType.label}`}
        aria-busy={isUploading}
      >
        {isUploading ? "Uploading..." : doc ? "Replace" : "Upload"}
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    valid: { label: "Approved" },
    approved: { label: "Approved" },
    expiring_soon: { label: "Expiring Soon" },
    pending_review: { label: "Pending Review" },
    pending: { label: "Pending Review" },
    needs_review: { label: "Pending Review" },
    under_review: { label: "Pending Review" },
    submitted: { label: "Pending Review" },
    rejected: { label: "Rejected" },
    expired: { label: "Expired" },
    missing: { label: "Not Uploaded" },
  };

  const statusKey = status || "missing";
  const statusConfig = config[statusKey] || config.pending_review;

  return (
    <span className={`dd-status-badge dd-status-badge--${statusKey}`}>
      {statusConfig.label}
    </span>
  );
}


/* Presentation styles moved to DriverDocuments.css */
