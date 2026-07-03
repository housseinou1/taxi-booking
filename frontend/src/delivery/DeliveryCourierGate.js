import React, { useCallback, useEffect, useState } from "react";

import { API_URL } from "../apiConfig";
import { isDeliveryUberUI } from "../native/platform";
import DeliveryCourierOnboarding from "./DeliveryCourierOnboarding";
import DeliveryCourierDashboard from "./DeliveryCourierDashboard";
import { apiRequest } from "./DeliveryShared";
import "./delivery-uber.css";

function DocumentAlertBanner({ onboarding, onNavigate }) {
  const expiredDocs = onboarding?.expired_document_types || [];
  const missingDocs = onboarding?.missing_document_types || [];
  const isSuspended = onboarding?.is_suspended;
  const driverStatus = onboarding?.driver_status;

  if (!expiredDocs.length && !missingDocs.length && !isSuspended && driverStatus !== "rejected") {
    return null;
  }

  const docLabel = (type) =>
    ({ national_id: "National ID", license: "Driver License", carte_grise: "Registration", insurance: "Insurance" }[type] || type);

  return (
    <div className="delivery-alert-banner" role="alert">
      {isSuspended && (
        <p className="delivery-alert-banner__item is-critical">
          <span className="delivery-alert-dot" aria-hidden="true" />
          {onboarding?.suspension_reason || "Your courier account is suspended. Contact support."}
        </p>
      )}
      {driverStatus === "rejected" && !isSuspended && (
        <p className="delivery-alert-banner__item is-critical">
          <span className="delivery-alert-dot" aria-hidden="true" />
          Your courier application was rejected. Update your profile and resubmit.
        </p>
      )}
      {expiredDocs.map((doc) => (
        <p key={doc} className="delivery-alert-banner__item is-expired">
          <span className="delivery-alert-dot" aria-hidden="true" />
          {docLabel(doc)} expired. Please update before going online.
        </p>
      ))}
      {missingDocs.length > 0 && !expiredDocs.length && (
        <p className="delivery-alert-banner__item is-warning">
          <span className="delivery-alert-dot" aria-hidden="true" />
          Missing documents: {missingDocs.map(docLabel).join(", ")}
        </p>
      )}
      <button
        type="button"
        className="delivery-alert-banner__action"
        onClick={onNavigate}
      >
        Update documents
      </button>
    </div>
  );
}

function PendingReviewBanner({ driverStatus }) {
  if (driverStatus !== "pending_review") return null;
  return (
    <div className="delivery-alert-banner delivery-alert-banner--review" role="status">
      <p className="delivery-alert-banner__item">
        <span className="delivery-alert-dot is-pending" aria-hidden="true" />
        Your Yala Delivery profile is under review. You'll be notified once approved.
      </p>
    </div>
  );
}

function ResignRequiredBanner({ onNavigate }) {
  return (
    <div className="delivery-alert-banner" role="alert">
      <p className="delivery-alert-banner__item is-critical">
        <span className="delivery-alert-dot" aria-hidden="true" />
        Updated terms require your electronic signature before you can deliver.
      </p>
      <button type="button" className="delivery-alert-banner__action" onClick={onNavigate}>
        Sign agreement
      </button>
    </div>
  );
}

export default function DeliveryCourierGate() {
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState(() => {
    try {
      const cached = sessionStorage.getItem("yala_courier_onboarding");
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [error, setError] = useState("");

  const loadOnboarding = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const state = await apiRequest(`${API_URL}/deliveries/courier/onboarding/`);
      setOnboarding(state);
      // Cache for instant return navigation
      try { sessionStorage.setItem("yala_courier_onboarding", JSON.stringify(state)); } catch {}
    } catch (err) {
      setError(err.message || "Could not load courier profile.");
      // Try to use cached state
      if (!onboarding) {
        try {
          const cached = sessionStorage.getItem("yala_courier_onboarding");
          if (cached) setOnboarding(JSON.parse(cached));
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOnboarding();
  }, [loadOnboarding]);

  if (loading) {
    return (
      <div className={isDeliveryUberUI() ? "delivery-uber-page" : "delivery-onboarding delivery-onboarding--loading"}>
        <div className={isDeliveryUberUI() ? "delivery-uber__empty" : undefined} style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
          <p>Loading courier profile...</p>
        </div>
      </div>
    );
  }

  if (error && !onboarding) {
    // Only show error screen if we have no cached data at all
    return (
      <div className={isDeliveryUberUI() ? "delivery-uber-page" : "delivery-onboarding delivery-onboarding--error"}>
        <div className="delivery-uber-page__content" style={{ textAlign: "center", paddingTop: 48 }}>
          <p>{error}</p>
          <button type="button" className="delivery-uber__btn" onClick={loadOnboarding}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (onboarding?.ready) {
    if (onboarding?.requires_resign) {
      return (
        <div className={isDeliveryUberUI() ? "delivery-uber-page" : "delivery-onboarding"}>
          <div className="delivery-uber-page__content" style={{ paddingTop: 24 }}>
            <ResignRequiredBanner
              onNavigate={() => {
                window.location.href = "/delivery/courier/sign?return=/delivery/courier";
              }}
            />
          </div>
        </div>
      );
    }
    return <DeliveryCourierDashboard />;
  }

  // Show specific banners based on status
  const hasExpiredOrMissing =
    (onboarding?.expired_document_types?.length > 0) ||
    (onboarding?.missing_document_types?.length > 0);
  const isPendingReview = onboarding?.driver_status === "pending_review";
  const needsSignature =
    onboarding?.requires_resign ||
    (onboarding?.signature && !onboarding.signature.signature_complete && onboarding?.application_submitted);
  const showAlertBanner = onboarding?.is_suspended || onboarding?.driver_status === "rejected" || hasExpiredOrMissing;

  return (
    <>
      {needsSignature && !showAlertBanner ? (
        <ResignRequiredBanner
          onNavigate={() => {
            window.location.href = "/delivery/courier/sign?return=/delivery/courier";
          }}
        />
      ) : null}
      {showAlertBanner && (
        <DocumentAlertBanner
          onboarding={onboarding}
          onNavigate={() => { window.location.href = "/delivery/documents"; }}
        />
      )}
      {!showAlertBanner && isPendingReview && (
        <PendingReviewBanner driverStatus={onboarding?.driver_status} />
      )}
      <DeliveryCourierOnboarding state={onboarding} onRefresh={loadOnboarding} />
    </>
  );
}
