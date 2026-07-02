import React from "react";

import { getAppType, isDeliveryUberUI } from "../native/platform";
import { getCourierApprovalNotice } from "./deliveryDocumentReview";
import { DeliveryHeader } from "./DeliveryShared";
import { DeliveryUberPage } from "./DeliveryUberLayout";
import "./Delivery.css";
import "./delivery-uber.css";

const STEP_ICONS = {
  account: "👤",
  courier_type: "🛵",
  phone: "📱",
  profile: "📝",
  vehicle: "🚲",
  documents: "📄",
  approval: "✅",
  payout: "🏦",
};

function getStepActionLabel(step) {
  if (step.complete) return "Done";
  if (step.status === "under_review") return "Review";
  if (step.id === "account") return "Sign up";
  if (step.id === "phone") return "Verify";
  if (step.id === "approval") return "Waiting";
  return "Continue";
}

export default function DeliveryCourierOnboarding({ state, onRefresh }) {
  const steps = state?.steps || [];
  const completedCount = steps.filter((step) => step.complete).length;
  const progress = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;
  const isDeliveryApp = getAppType() === "delivery";
  const uberUI = isDeliveryUberUI();
  const statusBanner = getCourierApprovalNotice(state);

  const handleStepAction = (step) => {
    if (step.complete || !step.action_path) return;
    window.location.href = step.action_path;
  };

  const content = (
    <>
      <div className={uberUI ? "delivery-uber-card" : "delivery-onboarding-hero"}>
        {!uberUI ? <span className="delivery-onboarding-eyebrow">Yala Delivery</span> : null}
        <h2 style={uberUI ? { margin: "0 0 8px", fontSize: 22 } : undefined}>Complete your profile</h2>
        <p>{statusBanner || state?.message || "Create an account and complete every step before you can accept deliveries."}</p>

        {state?.profile_under_review ? (
          <div className={uberUI ? "delivery-uber-card delivery-uber-card--notice" : "delivery-onboarding-notice"}>
            Your Yala Delivery profile is under review.
          </div>
        ) : null}

        {state?.has_expired_documents ? (
          <div className={uberUI ? "delivery-uber-card delivery-uber-card--alert" : "delivery-onboarding-notice delivery-onboarding-notice--alert"}>
            Document expired. Please update before going online.
          </div>
        ) : null}

        <div
          className={uberUI ? "delivery-onboarding-progress" : "delivery-onboarding-progress"}
          aria-label={`${progress}% complete`}
          style={uberUI ? { marginTop: 14 } : undefined}
        >
          <div className="delivery-onboarding-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        <small>
          {completedCount} of {steps.length} steps complete
        </small>
      </div>

      <div className={uberUI ? "delivery-uber-card" : "delivery-onboarding-steps"}>
        {steps.map((step) => (
          <article
            key={step.id}
            className={
              uberUI
                ? `delivery-uber-step ${step.complete ? "is-complete" : ""}`
                : `delivery-onboarding-step ${step.complete ? "is-complete" : ""} ${
                    step.status === "under_review" ? "is-review" : ""
                  }`
            }
          >
            <div className={uberUI ? "delivery-uber-step__icon" : "delivery-onboarding-step-icon"}>
              {STEP_ICONS[step.id] || "•"}
            </div>
            <div className={uberUI ? undefined : "delivery-onboarding-step-body"}>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </div>
            <button
              type="button"
              className={
                uberUI
                  ? `delivery-uber__btn delivery-uber__btn--sm ${
                      step.complete ? "delivery-uber__btn--secondary" : ""
                    }`
                  : `delivery-button ${step.complete ? "delivery-button-secondary" : ""}`
              }
              disabled={step.complete || !step.action_path}
              onClick={() => handleStepAction(step)}
            >
              {getStepActionLabel(step)}
            </button>
          </article>
        ))}
      </div>

      {state?.documents_under_review && !state?.ready ? (
        <div className={uberUI ? "delivery-uber-card" : "delivery-onboarding-notice"}>
          Your documents are under review. You will be notified when your courier account is approved.
        </div>
      ) : null}

      <div className={uberUI ? "delivery-uber__job-actions" : "delivery-onboarding-actions"}>
        <button
          type="button"
          className={uberUI ? "delivery-uber__btn delivery-uber__btn--secondary" : "delivery-button delivery-button-secondary"}
          onClick={onRefresh}
        >
          Refresh
        </button>
        {isDeliveryApp ? (
          <button
            type="button"
            className={uberUI ? "delivery-uber__btn" : "delivery-button"}
            onClick={() => {
              window.location.href = "/register?next=/delivery/profile-setup";
            }}
          >
            Create courier account
          </button>
        ) : (
          <button
            type="button"
            className={uberUI ? "delivery-uber__btn" : "delivery-button delivery-button-secondary"}
            onClick={() => {
              window.location.href = "/login?next=/delivery/courier";
            }}
          >
            Sign in
          </button>
        )}
      </div>
    </>
  );

  if (uberUI) {
    return (
      <DeliveryUberPage title="Courier setup" onBack={null}>
        {content}
      </DeliveryUberPage>
    );
  }

  return (
    <div className="delivery-page delivery-onboarding">
      <DeliveryHeader
        subtitle="Courier onboarding"
        backPath={isDeliveryApp ? "/delivery/courier" : "/"}
        showBack={!isDeliveryApp}
      />
      {content}
    </div>
  );
}
