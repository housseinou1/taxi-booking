import React from "react";

const STATUS_ITEMS = [
  { key: "valid", label: "Valid", tone: "valid" },
  { key: "expiringSoon", label: "Expiring", tone: "expiring" },
  { key: "expired", label: "Expired", tone: "expired" },
  { key: "pendingReview", label: "Pending", tone: "pending" },
];

export default function DriverDocumentsDashboard({ summary, compliancePercentage }) {
  if (!summary) return null;

  return (
    <section className="driver-docs-dashboard" aria-label="Document compliance overview">
      <div className="driver-docs-dashboard__ring">
        <span className="driver-docs-dashboard__pct">{compliancePercentage}%</span>
        <span className="driver-docs-dashboard__pct-label">Compliant</span>
      </div>
      <div className="driver-docs-dashboard__stats">
        {STATUS_ITEMS.map((item) => (
          <div key={item.key} className={`driver-docs-stat driver-docs-stat--${item.tone}`}>
            <span className="driver-docs-stat__value">{summary[item.key] ?? 0}</span>
            <span className="driver-docs-stat__label">{item.label}</span>
          </div>
        ))}
      </div>
      <p className="driver-docs-dashboard__hint">
        {summary.expired > 0 || summary.missing > 0
          ? "Expired or missing mandatory documents may prevent you from going online."
          : summary.expiringSoon > 0
            ? "Renew documents before they expire to stay online without interruption."
            : "All required documents are in good standing."}
      </p>
    </section>
  );
}
