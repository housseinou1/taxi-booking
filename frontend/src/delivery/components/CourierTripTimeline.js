import React from "react";

import { COURIER_TIMELINE_STEPS, getCourierTimelineStep } from "../deliveryTrip";

export default function CourierTripTimeline({
  delivery,
  dropoffArrived = false,
  showPickupProof = false,
  showDropoffProof = false,
}) {
  const current = getCourierTimelineStep(delivery, {
    dropoffArrived,
    showPickupProof,
    showDropoffProof,
  });
  const isDelivered = delivery?.status === "delivered";

  return (
    <ol className="cce-timeline cce-timeline--vertical" aria-label="Delivery progress">
      {COURIER_TIMELINE_STEPS.map((step, index) => {
        const done = isDelivered ? index <= 7 : index < current;
        const active = !isDelivered && index === current;

        return (
          <li
            key={step.key}
            className={[
              "cce-timeline__step",
              done ? "is-done" : "",
              active ? "is-active" : "",
              !done && !active ? "is-future" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-current={active ? "step" : undefined}
          >
            <span className="cce-timeline__rail" aria-hidden>
              <span className="cce-timeline__dot">
                {done ? "✓" : active ? "●" : ""}
              </span>
              {index < COURIER_TIMELINE_STEPS.length - 1 ? (
                <span className={`cce-timeline__line ${done ? "is-done" : ""}`} />
              ) : null}
            </span>
            <span className="cce-timeline__label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
