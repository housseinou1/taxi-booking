import { useEffect, useState } from "react";
import { MARKET, formatMoney } from "../marketConfig";

export function computeWaitingStatus(driverArrivedAt, nowMs = Date.now()) {
  if (!driverArrivedAt) return null;

  const arrivedMs = new Date(driverArrivedAt).getTime();
  if (Number.isNaN(arrivedMs)) return null;

  const { freeMinutes, perMinuteFee, maxWaitMinutes = 5 } = MARKET.waiting;
  const freeSeconds = freeMinutes * 60;
  const maxWaitSeconds = maxWaitMinutes * 60;
  const waitedSeconds = Math.max(0, Math.floor((nowMs - arrivedMs) / 1000));
  const billingStarted = waitedSeconds > freeSeconds;
  const freeSecondsRemaining = Math.max(0, freeSeconds - waitedSeconds);
  const maxWaitSecondsRemaining = Math.max(0, maxWaitSeconds - waitedSeconds);
  const chargeableSeconds = billingStarted ? waitedSeconds - freeSeconds : 0;
  const chargeableMinutes = billingStarted ? Math.ceil(chargeableSeconds / 60) : 0;
  const estimatedFee = chargeableMinutes * perMinuteFee;

  return {
    active: true,
    waitedSeconds,
    freeMinutes,
    freeSecondsRemaining,
    maxWaitMinutes,
    maxWaitSeconds,
    maxWaitSecondsRemaining,
    noShowUnlocked: waitedSeconds >= maxWaitSeconds,
    billingStarted,
    chargeableMinutes,
    perMinuteFee,
    estimatedFee,
    currency: MARKET.currency || "MRU",
  };
}

export function formatWaitDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function useLiveWaitingStatus(ride) {
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (ride?.status !== "driver_arrived" || !ride?.driver_arrived_at) {
      return undefined;
    }

    const timerId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, [ride?.status, ride?.driver_arrived_at]);

  if (ride?.status !== "driver_arrived" || !ride?.driver_arrived_at) {
    return null;
  }

  return computeWaitingStatus(ride.driver_arrived_at, nowMs);
}

export function getWaitingFeeMessage(waitingStatus, { audience = "rider" } = {}) {
  if (!waitingStatus) return "";

  const { freeMinutes, perMinuteFee, maxWaitMinutes = 5 } = MARKET.waiting;
  const currency = MARKET.currency || "MRU";
  const feeLabel = formatMoney(waitingStatus.estimatedFee);

  if (!waitingStatus.billingStarted) {
    const remaining = formatWaitDuration(waitingStatus.freeSecondsRemaining);
    if (audience === "driver") {
      return (
        `Free wait: ${remaining} left. Charges start after ${freeMinutes} min ` +
        `(${perMinuteFee} ${currency}/min). Rider no-show unlocks after ${maxWaitMinutes} min.`
      );
    }
    return `Driver is waiting. Free for ${remaining} more.`;
  }

  if (audience === "driver") {
    if (waitingStatus.noShowUnlocked) {
      return (
        `Rider wait charge: ${feeLabel}. Max wait ended — Rider no-show is available if you are near pickup.`
      );
    }
    return (
      `Rider wait charge: ${feeLabel} (${waitingStatus.chargeableMinutes} min × ${perMinuteFee} ${currency}). ` +
      `Rider no-show in ${formatWaitDuration(waitingStatus.maxWaitSecondsRemaining)}.`
    );
  }

  return `Waiting fee: ${feeLabel} (${waitingStatus.chargeableMinutes} min after ${freeMinutes} min free).`;
}
