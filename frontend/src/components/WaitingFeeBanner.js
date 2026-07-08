import React from "react";
import {
  formatWaitDuration,
  getWaitingFeeMessage,
  useLiveWaitingStatus,
} from "../utils/waitingFee";
import { formatMoney } from "../marketConfig";
import "./WaitingFeeBanner.css";

function WaitingFeeBanner({ ride, audience = "rider" }) {
  const waitingStatus = useLiveWaitingStatus(ride);

  if (!waitingStatus) {
    return null;
  }

  const message = getWaitingFeeMessage(waitingStatus, { audience });
  const timerLabel = waitingStatus.billingStarted
    ? `Charged wait: ${formatWaitDuration(waitingStatus.waitedSeconds)}`
    : `Free wait: ${formatWaitDuration(waitingStatus.waitedSeconds)}`;

  return (
    <section
      className={`waiting-fee-banner ${
        waitingStatus.billingStarted
          ? "waiting-fee-banner--billing"
          : "waiting-fee-banner--grace"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="waiting-fee-banner__header">
        <strong>
          {waitingStatus.billingStarted ? "Waiting charges apply" : "Driver is waiting"}
        </strong>
        <span className="waiting-fee-banner__timer">{timerLabel}</span>
      </div>
      <p className="waiting-fee-banner__message">{message}</p>
      {waitingStatus.billingStarted && (
        <p className="waiting-fee-banner__fee">
          Current estimate: {formatMoney(waitingStatus.estimatedFee)}
        </p>
      )}
      {audience === "driver" && waitingStatus.noShowUnlocked && (
        <p className="waiting-fee-banner__fee">
          Max wait ended — Rider no-show is available near pickup.
        </p>
      )}
    </section>
  );
}

export default WaitingFeeBanner;
