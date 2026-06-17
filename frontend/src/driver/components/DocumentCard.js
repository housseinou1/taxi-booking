import React from "react";

const STATUS_CONFIG = {
  approved: { icon: "✅", label: "Approved", color: "#22c55e" },
  pending_review: { icon: "⏳", label: "Pending Review", color: "#f59e0b" },
  pending: { icon: "⏳", label: "Pending", color: "#f59e0b" },
  rejected: { icon: "❌", label: "Rejected", color: "#ef4444" },
  expired: { icon: "⚠️", label: "Expired", color: "#f97316" },
  missing: { icon: "📎", label: "Document Required", color: "#94a3b8" },
};

export default function DocumentCard({ document, onUpload }) {
  const config = STATUS_CONFIG[document.status] || STATUS_CONFIG.pending;
  const isExpiringSoon = document.days_remaining != null && document.days_remaining <= 30 && document.days_remaining > 0;

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <div style={styles.info}>
          <strong style={styles.name}>{document.name || document.document_type}</strong>
          <span style={{ ...styles.badge, background: `${config.color}22`, color: config.color }}>
            {config.icon} {config.label}
          </span>
        </div>
        {document.file_url && (
          <div style={styles.thumbnail}>📄</div>
        )}
      </div>

      {/* Expiration info */}
      {document.expires_at && (
        <div style={styles.expiration}>
          <span style={styles.expirationLabel}>
            Expires: {document.expires_at}
          </span>
          {document.days_remaining != null && (
            <span style={{
              ...styles.daysRemaining,
              color: isExpiringSoon ? "#f97316" : "rgba(255,255,255,0.5)",
            }}>
              {document.days_remaining > 0
                ? `${document.days_remaining} days remaining`
                : "Expired"}
            </span>
          )}
          {isExpiringSoon && (
            <span style={styles.renewalWarning}>⚠️ Renewal needed soon</span>
          )}
        </div>
      )}

      {/* Rejection note */}
      {document.status === "rejected" && document.rejection_note && (
        <div style={styles.rejectionNote}>
          <strong>Reason:</strong> {document.rejection_note}
        </div>
      )}

      {/* Upload/re-upload button */}
      {(document.status === "rejected" || document.status === "expired" || document.status === "missing" || !document.file_url) && (
        <button
          type="button"
          onClick={() => onUpload && onUpload(document.document_type || document.type)}
          style={styles.uploadBtn}
        >
          {document.file_url ? "Re-upload" : "Upload"}
        </button>
      )}
    </div>
  );
}

const styles = {
  card: {
    padding: 14,
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  info: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  name: {
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 8px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    width: "fit-content",
  },
  thumbnail: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },
  expiration: {
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  expirationLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
  daysRemaining: {
    fontSize: 12,
    fontWeight: 600,
  },
  renewalWarning: {
    fontSize: 11,
    color: "#f97316",
    fontWeight: 700,
    marginTop: 2,
  },
  rejectionNote: {
    marginTop: 8,
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    fontSize: 12,
    color: "#fca5a5",
    lineHeight: 1.4,
  },
  uploadBtn: {
    marginTop: 10,
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(0, 166, 81, 0.4)",
    background: "rgba(0, 166, 81, 0.1)",
    color: "#00A651",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  },
};
