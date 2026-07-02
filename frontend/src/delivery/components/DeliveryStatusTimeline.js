import React from "react";

import { getTimelineSteps } from "../deliveryTrackingStatus";

export default function DeliveryStatusTimeline({ delivery, etaMinutes }) {
  const steps = getTimelineSteps(delivery, etaMinutes);

  return (
    <ol className="delivery-track__timeline" aria-label="Delivery progress">
      {steps.map((step) => (
        <li key={step.key} className={`delivery-track__timeline-step is-${step.state}`}>
          <span className="delivery-track__timeline-marker" aria-hidden>
            {step.state === "done" ? "✓" : step.state === "active" ? "●" : ""}
          </span>
          <span className="delivery-track__timeline-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
