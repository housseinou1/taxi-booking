import React, { useMemo } from "react";

import { getDocumentDisplayStatus, validateDeliveryDocumentFile } from "../deliveryDocumentReview";

const STATUS_LABELS = {
  approved: "Approved",
  pending_review: "Pending review",
  uploaded: "Uploaded",
  rejected: "Rejected",
  expired: "Expired",
  missing: "Not uploaded",
};

const STATUS_CLASS = {
  approved: "is-approved",
  pending_review: "is-pending",
  uploaded: "is-uploaded",
  rejected: "is-rejected",
  expired: "is-expired",
  missing: "is-missing",
};

function isImageFile(url = "", fileName = "") {
  const lower = `${url} ${fileName}`.toLowerCase();
  return lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") || lower.includes(".webp");
}

export default function DeliveryCourierOnboardingDocCard({
  docType,
  uploaded,
  pendingPreviewUrl,
  isUploading,
  uploadProgress = 0,
  disabled,
  onPick,
}) {
  const displayStatus = getDocumentDisplayStatus(uploaded);
  const statusLabel = STATUS_LABELS[displayStatus] || displayStatus;
  const statusClass = STATUS_CLASS[displayStatus] || "is-missing";

  const previewUrl = useMemo(() => {
    if (pendingPreviewUrl) return pendingPreviewUrl;
    if (uploaded?.file) return uploaded.file;
    return "";
  }, [pendingPreviewUrl, uploaded?.file]);

  const showImagePreview = previewUrl && isImageFile(previewUrl, uploaded?.file_name);

  return (
    <article className={`delivery-courier-doc-card ${isUploading ? "is-uploading" : ""}`}>
      <div className="delivery-courier-doc-card__header">
        <div>
          <strong>{docType.label}</strong>
          <span className={`delivery-courier-doc-card__badge ${statusClass}`}>{statusLabel}</span>
        </div>
        <button
          type="button"
          className="delivery-uber__btn delivery-uber__btn--sm"
          disabled={disabled || isUploading}
          onClick={() => onPick(docType.key)}
        >
          {isUploading ? "Uploading..." : uploaded ? "Replace" : "Upload"}
        </button>
      </div>

      {isUploading ? (
        <div className="delivery-courier-doc-card__progress" aria-label="Upload progress">
          <div
            className="delivery-courier-doc-card__progress-bar"
            style={{ width: `${Math.max(uploadProgress, 8)}%` }}
          />
        </div>
      ) : null}

      {previewUrl ? (
        <div className="delivery-courier-doc-card__preview">
          {showImagePreview ? (
            <img src={previewUrl} alt={`${docType.label} preview`} />
          ) : (
            <div className="delivery-courier-doc-card__pdf">
              <span aria-hidden="true">📄</span>
              <p>{uploaded?.file ? "PDF document on file" : "PDF selected"}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="delivery-courier-doc-card__hint">JPEG, PNG, or PDF · max 10 MB</p>
      )}
    </article>
  );
}

export function validateOnboardingDocumentFile(file) {
  return validateDeliveryDocumentFile(file);
}
