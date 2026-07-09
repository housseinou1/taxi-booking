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
    ? `Charged: ${formatWaitDuration(waitingStatus.waitedSeconds)}`
    : `Free wait: ${formatWaitDuration(waitingStatus.waitedSeconds)}`;

  const isNoShowUnlocked = waitingStatus.noShowUnlocked;

  return (
    <section
      className={[
        "waiting-fee-banner",
        isNoShowUnlocked
          ? "waiting-fee-banner--noshow"
          : waitingStatus.billingStarted
          ? "waiting-fee-banner--billing"
          : "waiting-fee-banner--grace",
      ].join(" ")}
      role="status"
      aria-live="polite"
    >
      <div className="waiting-fee-banner__header">
        <strong>
          {isNoShowUnlocked
            ? audience === "rider"
              ? "⚠️ Driver may leave soon"
              : "No-show unlocked"
            : waitingStatus.billingStarted
            ? "⏱ Waiting charges apply"
            : "🟢 Driver is waiting"}
        </strong>
        <span className="waiting-fee-banner__timer">{timerLabel}</span>
      </div>

      <p className="waiting-fee-banner__message">{message}</p>

      {/* Rider: show fee estimate once billing starts */}
      {audience === "rider" && waitingStatus.billingStarted && (
        <p className="waiting-fee-banner__fee">
          Waiting fee so far: <strong>{formatMoney(waitingStatus.estimatedFee)}</strong>
        </p>
      )}

      {/* Rider: countdown to no-show before it unlocks */}
      {audience === "rider" && !isNoShowUnlocked && waitingStatus.billingStarted && (
        <p className="waiting-fee-banner__countdown">
          Driver can mark no-show in{" "}
          <strong>{formatWaitDuration(waitingStatus.maxWaitSecondsRemaining)}</strong>
          {" — "}please meet your driver at the pickup point.
        </p>
      )}

      {/* Rider: urgent warning once no-show is unlocked */}
      {audience === "rider" && isNoShowUnlocked && (
        <p className="waiting-fee-banner__noshow-warning">
          Your driver has been waiting longer than the allowed time. Please go to
          the pickup point now or your ride may be cancelled as a no-show.
        </p>
      )}

      {/* Driver: no-show ready indicator */}
      {audience === "driver" && isNoShowUnlocked && (
        <p className="waiting-fee-banner__fee">
          Max wait ended — tap <strong>Cancel ride → Rider no-show</strong> if near pickup.
        </p>
      )}
    </section>
  );
}

export default WaitingFeeBanner;
