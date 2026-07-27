import React from "react";
import { getDocumentDashboardStatus } from "../utils/documentReview";

const STEPS = [
  { key: "uploaded", label: "Uploaded" },
  { key: "pending_review", label: "Under Review" },
  { key: "approved", label: "Approved" },
];

function resolveActiveStep(document, dashboardStatus) {
  if (!document) return null;
  if (dashboardStatus === "expired") return "expired";
  if (dashboardStatus === "rejected") return "rejected";
  if (dashboardStatus === "valid" || dashboardStatus === "expiring_soon") return "approved";
  if (document.status === "pending_review" || dashboardStatus === "pending_review") {
    return "pending_review";
  }
  if (document.status === "approved") return "approved";
  return "uploaded";
}

function formatDate(value) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export default function DocumentReviewTimeline({ document, docType }) {
  if (!document) return null;

  const dashboardStatus = getDocumentDashboardStatus(document, docType);
  const activeStep = resolveActiveStep(document, dashboardStatus);

  if (activeStep === "expired") {
    return (
      <ol className="driver-docs-timeline" aria-label="Document review timeline">
        <li className="driver-docs-timeline__step driver-docs-timeline__step--done">Uploaded</li>
        <li className="driver-docs-timeline__step driver-docs-timeline__step--done">Approved</li>
        <li className="driver-docs-timeline__step driver-docs-timeline__step--expired">Expired</li>
      </ol>
    );
  }

  if (activeStep === "rejected") {
    return (
      <div className="driver-docs-timeline-wrap">
        <ol className="driver-docs-timeline" aria-label="Document review timeline">
          <li className="driver-docs-timeline__step driver-docs-timeline__step--done">Uploaded</li>
          <li className="driver-docs-timeline__step driver-docs-timeline__step--done">Under Review</li>
          <li className="driver-docs-timeline__step driver-docs-timeline__step--rejected">Rejected</li>
        </ol>
        {document.rejection_reason ? (
          <p className="driver-docs-timeline__reason">
            <strong>Reason:</strong> {document.rejection_reason}
          </p>
        ) : null}
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((step) => step.key === activeStep);

  return (
    <ol className="driver-docs-timeline" aria-label="Document review timeline">
      {STEPS.map((step, index) => {
        let state = "upcoming";
        if (index < stepIndex) state = "done";
        if (index === stepIndex) state = "active";
        return (
          <li
            key={step.key}
            className={`driver-docs-timeline__step driver-docs-timeline__step--${state}`}
          >
            {step.label}
            {step.key === "uploaded" && document.uploaded_at ? (
              <span className="driver-docs-timeline__date">{formatDate(document.uploaded_at)}</span>
            ) : null}
            {step.key === "approved" && document.reviewed_at ? (
              <span className="driver-docs-timeline__date">{formatDate(document.reviewed_at)}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
