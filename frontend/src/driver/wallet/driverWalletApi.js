import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";

export const WALLET_AUTH_CONFIG = { suppressAuthRedirect: true };

export function createWithdrawalIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `wd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchWalletData() {
  const response = await authenticatedApi.get(
    `${API_URL}/payments/withdrawals/`,
    WALLET_AUTH_CONFIG
  );
  return response.data || {};
}

export async function fetchPayoutMethods() {
  const response = await authenticatedApi.get(
    `${API_URL}/payments/payout-methods/`,
    WALLET_AUTH_CONFIG
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function savePayoutMethod(payload) {
  const response = await authenticatedApi.post(
    `${API_URL}/payments/payout-methods/save/`,
    payload,
    WALLET_AUTH_CONFIG
  );
  return response.data;
}

export async function sendWithdrawalOtp() {
  const response = await authenticatedApi.post(
    `${API_URL}/payments/withdrawals/send-otp/`,
    {},
    WALLET_AUTH_CONFIG
  );
  return response.data;
}

async function postWithdrawalRequest(path, payload) {
  try {
    return await authenticatedApi.post(path, payload, WALLET_AUTH_CONFIG);
  } catch (error) {
    if (error?.response?.status === 404 && path.includes("/wallet/withdrawals/")) {
      return authenticatedApi.post(
        `${API_URL}/payments/withdrawals/request/`,
        payload,
        WALLET_AUTH_CONFIG
      );
    }
    throw error;
  }
}

export async function requestWithdrawal({
  amount,
  method,
  payout_method_id,
  otp_code,
  idempotency_key,
  note = "",
}) {
  const payload = {
    amount: String(amount),
    method,
    payout_method_id,
    payout_method: payout_method_id,
    otp_code,
    idempotency_key,
    note,
  };
  const response = await postWithdrawalRequest(
    `${API_URL}/payments/wallet/withdrawals/`,
    payload
  );
  return response.data;
}
