import {
  createRidePayment,
  markRidePaid,
  payRideWithWallet,
  withPaymentRetry,
} from "./paymentApi";

const DIGITAL_METHODS = new Set(["bankily", "masrvi", "seddad", "card"]);

function normalizeMethod(method) {
  const value = String(method || "card").toLowerCase();
  if (value === "masravi") return "masrvi";
  if (value === "sedad") return "seddad";
  return value;
}

function normalizePaymentResponse(response) {
  return response?.payment || response;
}

function buildStatusMessage(method, payment) {
  if (payment?.status === "paid") {
    return method === "wallet"
      ? "Wallet payment completed."
      : "Payment confirmed.";
  }

  if (method === "cash") {
    // Phase 11 — cashless platform: cash is never a valid payment path.
    return "Cash is not available on Yala. Please choose a digital payment method.";
  }

  if (DIGITAL_METHODS.has(method)) {
    return "Payment submitted. Awaiting driver verification.";
  }

  return "Payment recorded.";
}

/**
 * Submit ride payment using existing backend endpoints only.
 * Amounts are always calculated server-side from ride.fare.
 */
export async function submitRidePayment({ rideId, method, tipPercentage = 0 }) {
  if (!rideId) {
    throw new Error("Ride ID is required.");
  }

  const normalizedMethod = normalizeMethod(method);

  if (normalizedMethod === "wallet") {
    const response = await withPaymentRetry(() =>
      payRideWithWallet(rideId, tipPercentage)
    );
    const payment = normalizePaymentResponse(response);
    return {
      payment,
      message: buildStatusMessage("wallet", payment),
      pendingVerification: false,
    };
  }

  let response;
  try {
    response = await withPaymentRetry(() =>
      createRidePayment({
        rideId,
        method: normalizedMethod,
        tipPercentage,
      })
    );
  } catch (error) {
    const existingPayment = error?.data?.payment;
    if (existingPayment) {
      return {
        payment: existingPayment,
        message: error?.message || "Payment already exists for this ride.",
        pendingVerification: existingPayment.status === "pending_verification",
      };
    }
    throw error;
  }

  const payment = normalizePaymentResponse(response);

  if (normalizedMethod === "cash" || DIGITAL_METHODS.has(normalizedMethod)) {
    try {
      await markRidePaid(rideId);
    } catch (markError) {
      // Non-fatal when payment is already pending verification.
      if (!String(markError?.message || "").includes("already")) {
      }
    }
  }

  return {
    payment,
    message: response?.message || buildStatusMessage(normalizedMethod, payment),
    pendingVerification: payment?.status === "pending_verification",
  };
}

function normalizeStatus(payment) {
  return String(payment?.status || "").trim().toLowerCase();
}

/**
 * True only when the backend reports the payment as settled (`paid`).
 *
 * `authorized` is NOT a settlement — it means the payment was authorized but not
 * captured, so money had not necessarily moved. Treating it as settled could
 * reveal a confirmation for an unsettled payment.
 *
 * This is a *reporting* helper. Never use it to decide whether to re-attempt a
 * payment: use `hasPaymentAttempt()` for that, otherwise a second attempt can be
 * submitted for a ride that already has one.
 */
export function isPaymentSettled(payment) {
  return normalizeStatus(payment) === "paid";
}

/**
 * True when an attempt already exists for this ride — settled, authorized, or
 * awaiting verification.
 *
 * Deliberately WIDER than `isPaymentSettled()`. The ride `create_payment`
 * endpoint returns the existing payment rather than creating a second one for
 * exactly these three statuses, so keeping this gate wide is what prevents
 * duplicate payment attempts.
 */
export function hasPaymentAttempt(payment) {
  return ["paid", "authorized", "pending_verification"].includes(normalizeStatus(payment));
}

export function isPaymentPending(payment) {
  const status = normalizeStatus(payment);
  return status === "pending_verification" || status === "pending";
}
