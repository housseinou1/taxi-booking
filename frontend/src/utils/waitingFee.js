import { useEffect, useState } from "react";
import { MARKET, formatMoney } from "../marketConfig";

export function computeWaitingStatus(driverArrivedAt, nowMs = Date.now()) {
  if (!driverArrivedAt) return null;

  const arrivedMs = new Date(driverArrivedAt).getTime();
  if (Number.isNaN(arrivedMs)) return null;

  const { freeMinutes, perMinuteFee } = MARKET.waiting;
  const freeSeconds = freeMinutes * 60;
  const waitedSeconds = Math.max(0, Math.floor((nowMs - arrivedMs) / 1000));
  const billingStarted = waitedSeconds > freeSeconds;
  const freeSecondsRemaining = Math.max(0, freeSeconds - waitedSeconds);
  const chargeableSeconds = billingStarted ? waitedSeconds - freeSeconds : 0;
  const chargeableMinutes = billingStarted ? Math.ceil(chargeableSeconds / 60) : 0;
  const estimatedFee = chargeableMinutes * perMinuteFee;

  return {
    active: true,
    waitedSeconds,
    freeMinutes,
    freeSecondsRemaining,
    billingStarted,
    chargeableMinutes,
    perMinuteFee,
    estimatedFee,
    currency: MARKET.currency,
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

  const { freeMinutes, perMinuteFee, currency } = MARKET.waiting;
  const feeLabel = formatMoney(waitingStatus.estimatedFee);

  if (!waitingStatus.billingStarted) {
    const remaining = formatWaitDuration(waitingStatus.freeSecondsRemaining);
    if (audience === "driver") {
      return `Free wait: ${remaining} left. Charges start after ${freeMinutes} min (${perMinuteFee} ${currency}/min).`;
    }
    return `Driver is waiting. Free for ${remaining} more.`;
  }

  if (audience === "driver") {
    return `Rider wait charge: ${feeLabel} (${waitingStatus.chargeableMinutes} min × ${perMinuteFee} ${currency}).`;
  }

  return `Waiting fee: ${feeLabel} (${waitingStatus.chargeableMinutes} min after ${freeMinutes} min free).`;
}
