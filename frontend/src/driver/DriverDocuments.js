import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { useDriverContext } from "./context/DriverContext";

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
  errorRed: "#EF4444",
  warningOrange: "#F59E0B",
  pendingBlue: "#3B82F6",
  approvedGreen: "#10B981",
  rejectedRed: "#EF4444",
};

const DOCUMENT_TYPES = [
  { key: "license", label: "Driver License", icon: "🪪", required: true },
  { key: "national_id", label: "National ID", icon: "🆔", required: true },
  { key: "insurance", label: "Insurance", icon: "🛡️", required: true },
  { key: "vehicle_registration", label: "Vehicle Registration", icon: "📋", required: true },
  { key: "profile_photo", label: "Profile Photo", icon: "📷", required: true },
];

const ACCEPTED_FORMATS = ["image/jpeg", "image/png", "application/pdf"];
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const EXPIRATION_WARNING_DAYS = 30;

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

/**
 * Get documents that are expired or missing (required but not uploaded).
 * @param {Array} documents - Array of document objects from API
 * @returns {Array} Array of { key, label, reason } for problematic documents
 */
export function getExpiredOrMissingDocuments(documents) {
  const alerts = [];
  const uploadedMap = {};

  if (documents) {
    documents.forEach((doc) => {
      uploadedMap[doc.document_type] = doc;
    });
  }

  DOCUMENT_TYPES.forEach((docType) => {
    if (!docType.required) return;

    const uploaded = uploadedMap[docType.key];

    if (!uploaded) {
      alerts.push({
        key: docType.key,
        label: docType.label,
        reason: "missing",
      });
    } else if (uploaded.expires_at) {
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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DriverDocuments() {
  const token = localStorage.getItem("access");
  const { state } = useDriverContext();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadingType, setUploadingType] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const fileInputRef = useRef(null);
  const selectedDocTypeRef = useRef(null);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  // ─── Fetch Documents ────────────────────────────────────────────────────

  const fetchDocuments = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/documents/`,
        authHeaders
      );
      // Backend returns { documents: [...], expiring_documents: [...], alerts: [...] }
      const data = response.data;
      setDocuments(data.documents || data.results || data || []);
    } catch (err) {
      setError("Failed to load documents. Please try again.");
      console.error("Documents fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, token]);

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
    async (event) => {
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

      setUploadingType(docTypeKey);
      setUploadError(null);
      setUploadSuccess(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("document_type", docTypeKey);

        await axios.post(
          `${API_URL}/drivers/me/documents/upload/`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          }
        );

        setUploadSuccess(
          `${DOCUMENT_TYPES.find((d) => d.key === docTypeKey)?.label || "Document"} uploaded successfully.`
        );

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
    [token, fetchDocuments]
  );

  // ─── Computed Values ────────────────────────────────────────────────────

  const documentAlerts = useMemo(
    () => getExpiredOrMissingDocuments(documents),
    [documents]
  );

  const documentMap = useMemo(() => {
    const map = {};
    documents.forEach((doc) => {
      map[doc.document_type] = doc;
    });
    return map;
  }, [documents]);

  // ─── Loading State ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={loadingStyle}>
          <span style={loadingSpinnerStyle}>⏳</span>
          <p style={loadingTextStyle}>Loading documents...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorContainerStyle}>
          <p style={errorTextStyle}>{error}</p>
          <button style={retryButtonStyle} onClick={fetchDocuments}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={containerStyle}>
      {/* Mauritania accent bar */}
      <div style={mauritaniaAccentBarStyle} aria-hidden="true" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf"
        style={{ display: "none" }}
        onChange={handleFileSelected}
        aria-label="Upload document file"
      />

      {/* Persistent Alert for Expired/Missing Documents */}
      {documentAlerts.length > 0 && (
        <div style={dashboardAlertStyle} role="alert" aria-live="assertive">
          <span style={alertIconStyle}>⚠️</span>
          <div style={alertContentStyle}>
            <strong style={alertTitleStyle}>Action Required</strong>
            <p style={alertMessageStyle}>
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

      {/* Page Header */}
      <div style={headerStyle}>
        <h1 style={pageTitleStyle}>📄 Document Center</h1>
        <p style={pageSubtitleStyle}>
          Upload and manage your required documents
        </p>
      </div>

      {/* Upload Feedback Messages */}
      {uploadError && (
        <div style={uploadErrorStyle} role="alert">
          <span>❌</span> {uploadError}
        </div>
      )}
      {uploadSuccess && (
        <div style={uploadSuccessStyle} role="status">
          <span>✅</span> {uploadSuccess}
        </div>
      )}

      {/* Document List */}
      <div style={documentListStyle}>
        {DOCUMENT_TYPES.map((docType) => {
          const doc = documentMap[docType.key];
          const daysRemaining = doc?.expires_at
            ? getDaysRemaining(doc.expires_at)
            : null;
          const showExpirationWarning =
            daysRemaining !== null &&
            daysRemaining >= 0 &&
            daysRemaining <= EXPIRATION_WARNING_DAYS;
          const isExpired = daysRemaining !== null && daysRemaining < 0;
          const isUploading = uploadingType === docType.key;

          return (
            <DocumentCard
              key={docType.key}
              docType={docType}
              document={doc}
              daysRemaining={daysRemaining}
              showExpirationWarning={showExpirationWarning}
              isExpired={isExpired}
              isUploading={isUploading}
              onUpload={handleUploadClick}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function DocumentCard({
  docType,
  document: doc,
  daysRemaining,
  showExpirationWarning,
  isExpired,
  isUploading,
  onUpload,
}) {
  const status = doc?.status || null;

  return (
    <div style={documentCardStyle}>
      <div style={documentCardHeaderStyle}>
        <div style={documentInfoStyle}>
          <span style={documentIconStyle}>{docType.icon}</span>
          <div>
            <h3 style={documentNameStyle}>{docType.label}</h3>
            {doc && (
              <span style={uploadedDateStyle}>
                Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Status Badge */}
        {status && <StatusBadge status={status} />}
        {!doc && (
          <span style={notUploadedBadgeStyle}>Not Uploaded</span>
        )}
      </div>

      {/* Expiration Warning Badge */}
      {showExpirationWarning && (
        <div style={expirationWarningStyle} role="status">
          <span style={warningBadgeIconStyle}>⏰</span>
          <span style={warningBadgeTextStyle}>
            Expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Expired Badge */}
      {isExpired && (
        <div style={expiredBadgeStyle} role="alert">
          <span style={warningBadgeIconStyle}>🚫</span>
          <span style={expiredBadgeTextStyle}>Expired</span>
        </div>
      )}

      {/* Rejection Reason */}
      {status === "rejected" && doc?.rejection_reason && (
        <div style={rejectionReasonStyle}>
          <span style={rejectionLabelStyle}>Reason:</span>{" "}
          {doc.rejection_reason}
        </div>
      )}

      {/* Upload/Replace Button */}
      <button
        style={{
          ...uploadButtonStyle,
          opacity: isUploading ? 0.6 : 1,
          cursor: isUploading ? "not-allowed" : "pointer",
        }}
        onClick={() => onUpload(docType.key)}
        disabled={isUploading}
        aria-label={
          doc
            ? `Replace ${docType.label}`
            : `Upload ${docType.label}`
        }
      >
        {isUploading ? "Uploading..." : doc ? "Replace" : "Upload"}
      </button>
    </div>
  );
}

function StatusBadge({ status }) {
  const config = {
    pending_review: {
      label: "Pending Review",
      color: COLORS.pendingBlue,
      bgColor: "rgba(59, 130, 246, 0.15)",
    },
    approved: {
      label: "Approved",
      color: COLORS.approvedGreen,
      bgColor: "rgba(16, 185, 129, 0.15)",
    },
    rejected: {
      label: "Rejected",
      color: COLORS.rejectedRed,
      bgColor: "rgba(239, 68, 68, 0.15)",
    },
  };

  const statusConfig = config[status] || config.pending_review;

  return (
    <span
      style={{
        ...statusBadgeBaseStyle,
        color: statusConfig.color,
        backgroundColor: statusConfig.bgColor,
        borderColor: statusConfig.color,
      }}
      aria-label={`Status: ${statusConfig.label}`}
    >
      {statusConfig.label}
    </span>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const containerStyle = {
  position: "relative",
  minHeight: "100vh",
  backgroundColor: COLORS.darkNavy,
  padding: "24px 16px 80px",
  overflowY: "auto",
};

const mauritaniaAccentBarStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  background: `linear-gradient(90deg, ${COLORS.primaryGreen} 0%, ${COLORS.goldAccent} 50%, ${COLORS.primaryGreen} 100%)`,
};

// ─── Loading & Error ────────────────────────────────────────────────────────

const loadingStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
};

const loadingSpinnerStyle = {
  fontSize: "32px",
  marginBottom: "12px",
};

const loadingTextStyle = {
  color: COLORS.lightGray,
  fontSize: "14px",
};

const errorContainerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  gap: "16px",
};

const errorTextStyle = {
  color: COLORS.errorRed,
  fontSize: "14px",
  textAlign: "center",
};

const retryButtonStyle = {
  padding: "10px 24px",
  borderRadius: "12px",
  border: "none",
  backgroundColor: COLORS.primaryGreen,
  color: COLORS.white,
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

// ─── Dashboard Alert ────────────────────────────────────────────────────────

const dashboardAlertStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  padding: "14px 16px",
  backgroundColor: "rgba(239, 68, 68, 0.12)",
  border: `1px solid ${COLORS.errorRed}`,
  borderRadius: "12px",
  marginBottom: "20px",
  marginTop: "8px",
};

const alertIconStyle = {
  fontSize: "20px",
  flexShrink: 0,
  marginTop: "2px",
};

const alertContentStyle = {
  flex: 1,
};

const alertTitleStyle = {
  color: COLORS.errorRed,
  fontSize: "14px",
  fontWeight: 800,
  display: "block",
  marginBottom: "4px",
};

const alertMessageStyle = {
  color: COLORS.lightGray,
  fontSize: "12px",
  margin: 0,
  lineHeight: 1.4,
};

// ─── Header ─────────────────────────────────────────────────────────────────

const headerStyle = {
  marginBottom: "20px",
  paddingTop: "12px",
};

const pageTitleStyle = {
  color: COLORS.white,
  fontSize: "22px",
  fontWeight: 900,
  margin: "0 0 4px 0",
};

const pageSubtitleStyle = {
  color: COLORS.lightGray,
  fontSize: "13px",
  margin: 0,
};

// ─── Upload Feedback ────────────────────────────────────────────────────────

const uploadErrorStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  backgroundColor: "rgba(239, 68, 68, 0.12)",
  border: `1px solid ${COLORS.errorRed}`,
  borderRadius: "10px",
  color: COLORS.errorRed,
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "16px",
};

const uploadSuccessStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 14px",
  backgroundColor: "rgba(16, 185, 129, 0.12)",
  border: `1px solid ${COLORS.approvedGreen}`,
  borderRadius: "10px",
  color: COLORS.approvedGreen,
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "16px",
};

// ─── Document List ──────────────────────────────────────────────────────────

const documentListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
};

const documentCardStyle = {
  backgroundColor: COLORS.cardBg,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: "16px",
  padding: "16px",
  backdropFilter: "blur(8px)",
  transition: "border-color 0.2s ease",
};

const documentCardHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "8px",
};

const documentInfoStyle = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const documentIconStyle = {
  fontSize: "24px",
};

const documentNameStyle = {
  color: COLORS.white,
  fontSize: "14px",
  fontWeight: 700,
  margin: 0,
};

const uploadedDateStyle = {
  color: COLORS.lightGray,
  fontSize: "11px",
};

// ─── Status Badge ───────────────────────────────────────────────────────────

const statusBadgeBaseStyle = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 700,
  border: "1px solid",
  whiteSpace: "nowrap",
};

const notUploadedBadgeStyle = {
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: "20px",
  fontSize: "11px",
  fontWeight: 700,
  color: COLORS.lightGray,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  whiteSpace: "nowrap",
};

// ─── Expiration Warning ─────────────────────────────────────────────────────

const expirationWarningStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  backgroundColor: "rgba(245, 158, 11, 0.12)",
  borderRadius: "8px",
  marginBottom: "8px",
};

const warningBadgeIconStyle = {
  fontSize: "14px",
};

const warningBadgeTextStyle = {
  color: COLORS.warningOrange,
  fontSize: "12px",
  fontWeight: 700,
};

const expiredBadgeStyle = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "6px 10px",
  backgroundColor: "rgba(239, 68, 68, 0.12)",
  borderRadius: "8px",
  marginBottom: "8px",
};

const expiredBadgeTextStyle = {
  color: COLORS.errorRed,
  fontSize: "12px",
  fontWeight: 700,
};

// ─── Rejection Reason ───────────────────────────────────────────────────────

const rejectionReasonStyle = {
  padding: "8px 10px",
  backgroundColor: "rgba(239, 68, 68, 0.08)",
  borderRadius: "8px",
  color: COLORS.lightGray,
  fontSize: "12px",
  marginBottom: "8px",
  lineHeight: 1.4,
};

const rejectionLabelStyle = {
  color: COLORS.rejectedRed,
  fontWeight: 700,
};

// ─── Upload Button ──────────────────────────────────────────────────────────

const uploadButtonStyle = {
  width: "100%",
  padding: "10px 16px",
  borderRadius: "10px",
  border: `1px solid ${COLORS.primaryGreen}`,
  backgroundColor: "transparent",
  color: COLORS.primaryGreen,
  fontWeight: 700,
  fontSize: "13px",
  textAlign: "center",
  transition: "background-color 0.2s ease, color 0.2s ease",
  marginTop: "4px",
};
