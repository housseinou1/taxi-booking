import React from "react";

export default function DocumentUploadSheet({
  open,
  docLabel,
  fileName,
  uploadProgress,
  uploading,
  error,
  onClose,
  onConfirm,
  onPickCamera,
  onPickGallery,
  onPickPdf,
  allowPdf,
  showExpiryField,
  expiresAt,
  onExpiresAtChange,
}) {
  if (!open) return null;

  return (
    <div className="driver-docs-sheet" role="dialog" aria-modal="true" aria-label={`Upload ${docLabel}`}>
      <div className="driver-docs-sheet__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="driver-docs-sheet__panel">
        <h2 className="driver-docs-sheet__title">Upload {docLabel}</h2>
        <p className="driver-docs-sheet__subtitle">
          Use camera, gallery, or PDF. Images are compressed automatically for faster uploads.
        </p>

        {!fileName ? (
          <div className="driver-docs-sheet__sources">
            <button type="button" className="driver-docs-sheet__source" onClick={onPickCamera}>
              📷 Camera
            </button>
            <button type="button" className="driver-docs-sheet__source" onClick={onPickGallery}>
              🖼 Gallery
            </button>
            {allowPdf ? (
              <button type="button" className="driver-docs-sheet__source" onClick={onPickPdf}>
                📄 PDF
              </button>
            ) : null}
          </div>
        ) : (
          <div className="driver-docs-sheet__preview">
            <span className="driver-docs-sheet__file">{fileName}</span>
            {showExpiryField ? (
              <label className="driver-docs-sheet__expiry">
                <span>Expiration date</span>
                <input
                  type="date"
                  value={expiresAt || ""}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => onExpiresAtChange?.(event.target.value)}
                  disabled={uploading}
                />
              </label>
            ) : null}
            {uploading ? (
              <div
                className="driver-docs-sheet__progress"
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="driver-docs-sheet__progress-bar" style={{ width: `${uploadProgress}%` }} />
                <span>{uploadProgress}%</span>
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="driver-docs-sheet__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="driver-docs-sheet__actions">
          <button type="button" className="driver-docs-sheet__cancel" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          {fileName ? (
            <button
              type="button"
              className="driver-docs-sheet__confirm"
              onClick={onConfirm}
              disabled={uploading || (showExpiryField && !expiresAt)}
            >
              {uploading ? "Uploading…" : "Upload document"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
