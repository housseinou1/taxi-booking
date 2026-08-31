import {
  createRidePayment,
  markRidePaid,
  payRideWithWallet,
  withPaymentRetry,
} from "./paymentApi";

const DIGITAL_METHODS = new Set(["bankily", "masrvi", "seddad", "card"]);

function normalizeMethod(method) {
  const value = String(method || "cash").toLowerCase();
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
    return "Cash payment recorded. Pay your driver and they will confirm receipt.";
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

export function isPaymentSettled(payment) {
  const status = payment?.status || "";
  return status === "paid" || status === "authorized";
}

export function isPaymentPending(payment) {
  return payment?.status === "pending_verification" || payment?.status === "pending";
}
