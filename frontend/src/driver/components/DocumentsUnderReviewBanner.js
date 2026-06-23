import React from "react";
import {
  DOCUMENTS_UNDER_REVIEW_MESSAGE,
  DOCUMENTS_UNDER_REVIEW_TITLE,
} from "../utils/documentReview";
import "./DocumentsUnderReviewBanner.css";

export default function DocumentsUnderReviewBanner({ compact = false }) {
  return (
    <div
      className={`documents-under-review-banner${compact ? " documents-under-review-banner--compact" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="documents-under-review-banner__icon" aria-hidden="true">
        ⏳
      </span>
      <div>
        <strong>{DOCUMENTS_UNDER_REVIEW_TITLE}</strong>
        <p>{DOCUMENTS_UNDER_REVIEW_MESSAGE}</p>
      </div>
    </div>
  );
}
