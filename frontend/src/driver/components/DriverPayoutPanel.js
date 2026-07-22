import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import PlatformWithdrawalAccounts, {
  payoutTypeForMethod,
} from "../../components/PlatformWithdrawalAccounts";
import "./DriverPayoutPanel.css";

const NON_REDIRECTING_AUTH_CONFIG = { suppressAuthRedirect: true };

const WITHDRAWAL_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  paid: "Paid",
  rejected: "Rejected",
};

async function payoutGet(url, { authHeaders, useAuthenticatedApi }) {
  if (useAuthenticatedApi) {
    return authenticatedApi.get(url, NON_REDIRECTING_AUTH_CONFIG);
  }
  return axios.get(url, authHeaders);
}

async function payoutPost(url, data, { authHeaders, useAuthenticatedApi }) {
  if (useAuthenticatedApi) {
    return authenticatedApi.post(url, data, NON_REDIRECTING_AUTH_CONFIG);
  }
  return axios.post(url, data, authHeaders);
}

const EMPTY_FORM = {
  payout_type: "bankily",
  account_holder_name: "",
  phone_number: "",
};

const PROVIDER_LABELS = {
  bankily: "Bankily",
  sedad: "Sedad",
  masravi: "Masravi",
};

const maskPhone = (value = "") => {
  const normalized = String(value).trim();
  if (!normalized) return "Not set";
  if (normalized.length <= 4) return normalized;
  return `•••• ${normalized.slice(-4)}`;
};

const payoutSummary = (method) => {
  if (!method) return "Add payout details to receive withdrawals";
  if (method.display_name) return method.display_name;
  const label = PROVIDER_LABELS[method.payout_type] || method.payout_type;
  return `${label} · ${maskPhone(method.phone_number || method.wallet_id)}`;
};

const formFromMethod = (method, payoutType = "bankily") => ({
  payout_type: payoutTypeForMethod(method || { payout_type: payoutType }),
  account_holder_name: method?.account_holder_name || "",
  phone_number: method?.phone_number || "",
});

const isPayoutFormReady = (form) =>
  Boolean(["bankily", "sedad", "masravi"].includes(form.payout_type) && form.phone_number?.trim());

export default function DriverPayoutPanel({
  authHeaders = null,
  useAuthenticatedApi = false,
  viewMode = "full",
  onMessage,
  onWithdrawClick,
}) {
  const apiOptions = useMemo(
    () => ({ authHeaders, useAuthenticatedApi: useAuthenticatedApi || !authHeaders }),
    [authHeaders, useAuthenticatedApi]
  );
  const showWalletOverview = viewMode === "wallet";
  const showWithdrawFlow = viewMode === "withdraw" || viewMode === "full";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [minimumWithdrawal, setMinimumWithdrawal] = useState(500);
  const [earnings, setEarnings] = useState({ today: {}, week: {}, month: {} });
  const [form, setForm] = useState(EMPTY_FORM);
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: "", note: "", otp_code: "" });
  const [selectedWithdrawalMethod, setSelectedWithdrawalMethod] = useState("bankily");
  const [withdrawStep, setWithdrawStep] = useState("amount");
  const [panelError, setPanelError] = useState("");

  const defaultMethod = useMemo(
    () => payoutMethods.find((item) => item.is_default) || payoutMethods[0] || null,
    [payoutMethods]
  );

  const selectedMethodRecord = useMemo(
    () =>
      payoutMethods.find((item) => item.payout_type === form.payout_type) ||
      defaultMethod,
    [defaultMethod, form.payout_type, payoutMethods]
  );

  const payoutReady = isPayoutFormReady(form);
  const canRequestWithdrawal = payoutReady && Number(withdrawableBalance || 0) >= Number(minimumWithdrawal || 500);
  const hasPendingWithdrawal = withdrawals.some((item) => item.status === "pending");

  const loadPayoutData = useCallback(async () => {
    setLoading(true);
    setPanelError("");
    try {
      const [methodsResponse, withdrawalsResponse] = await Promise.all([
        payoutGet(`${API_URL}/payments/payout-methods/`, apiOptions),
        payoutGet(`${API_URL}/payments/withdrawals/`, apiOptions),
      ]);

      const methods = Array.isArray(methodsResponse.data) ? methodsResponse.data : [];
      const withdrawalPayload = withdrawalsResponse.data || {};
      const withdrawalList = Array.isArray(withdrawalPayload)
        ? withdrawalPayload
        : Array.isArray(withdrawalPayload.withdrawals)
          ? withdrawalPayload.withdrawals
          : [];

      setPayoutMethods(methods);
      setWithdrawals(withdrawalList);
      setLedger(Array.isArray(withdrawalPayload.ledger) ? withdrawalPayload.ledger : []);
      setWithdrawableBalance(Number(withdrawalPayload.available_balance || 0));
      setTotalEarned(Number(withdrawalPayload.total_earned || 0));
      setPendingBalance(Number(withdrawalPayload.pending_balance || 0));
      setMinimumWithdrawal(Number(withdrawalPayload.minimum_withdrawal || 500));
      setEarnings(withdrawalPayload.earnings || { today: {}, week: {}, month: {} });

      const preferredType = payoutTypeForMethod({ id: selectedWithdrawalMethod, payout_type: selectedWithdrawalMethod });
      const savedMethod =
        methods.find((item) => item.is_default && item.payout_type === preferredType) ||
        methods.find((item) => item.payout_type === preferredType) ||
        methods.find((item) => item.is_default) ||
        methods[0] ||
        null;

      if (savedMethod) {
        setForm(formFromMethod(savedMethod));
        if (savedMethod.payout_type === "bankily") setSelectedWithdrawalMethod("bankily");
        else if (payoutTypeForMethod(savedMethod) === "sedad") setSelectedWithdrawalMethod("sedad");
        else if (payoutTypeForMethod(savedMethod) === "masravi") setSelectedWithdrawalMethod("masravi");
      }
    } catch (error) {
      setPanelError(
        useAuthenticatedApi || !authHeaders
          ? "Unable to load wallet. Please try again."
          : error.response?.data?.error || "Could not load payout details."
      );
    } finally {
      setLoading(false);
    }
  }, [apiOptions, selectedWithdrawalMethod, authHeaders, useAuthenticatedApi]);

  useEffect(() => {
    loadPayoutData();
  }, [loadPayoutData]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleWithdrawalMethodSelect = (method) => {
    const payoutType = payoutTypeForMethod(method);
    setSelectedWithdrawalMethod(method.id);
    const saved = payoutMethods.find((item) => item.payout_type === payoutType) || null;
    setForm(formFromMethod(saved, payoutType));
  };

  const ensurePayoutMethod = async () => {
    const payoutType = form.payout_type || "bankily";
    const existing =
      payoutMethods.find((item) => item.is_default && item.payout_type === payoutType) ||
      payoutMethods.find((item) => item.payout_type === payoutType) ||
      null;
    if (existing) return existing;

    const payload = { ...form, payout_type: payoutType, is_default: true };
    if (!payload.phone_number?.trim()) {
      throw new Error("Add your mobile money phone number before requesting a withdrawal.");
    }

    const response = await payoutPost(
      `${API_URL}/payments/payout-methods/save/`,
      payload,
      apiOptions
    );
    await loadPayoutData();
    return response.data;
  };

  const savePayoutMethod = async (event) => {
    if (event) event.preventDefault();
    setSaving(true);
    setPanelError("");
    try {
      await payoutPost(
        `${API_URL}/payments/payout-methods/save/`,
        { ...form, is_default: true },
        apiOptions
      );
      onMessage?.("Payout method saved for withdrawals.");
      await loadPayoutData();
    } catch (error) {
      const payload = error.response?.data;
      setPanelError(
        payload?.error ||
          payload?.non_field_errors?.[0] ||
          Object.values(payload || {})
            .flat()
            .find(Boolean) ||
          error.message ||
          "Could not save payout method."
      );
    } finally {
      setSaving(false);
    }
  };

  const validateWithdrawAmount = () => {
    const amount = Number(withdrawalForm.amount || 0);
    if (!amount || amount <= 0) {
      setPanelError("Enter a withdrawal amount greater than zero.");
      return null;
    }
    if (amount > Number(withdrawableBalance || 0)) {
      setPanelError(`You can withdraw up to ${formatMoney(withdrawableBalance)} right now.`);
      return null;
    }
    if (amount < Number(minimumWithdrawal || 500)) {
      setPanelError(`Minimum withdrawal is ${formatMoney(minimumWithdrawal)}.`);
      return null;
    }
    if (hasPendingWithdrawal) {
      setPanelError("You already have a pending withdrawal. Wait for admin review.");
      return null;
    }
    setPanelError("");
    return amount;
  };

  const proceedToConfirm = (event) => {
    event.preventDefault();
    const amount = validateWithdrawAmount();
    if (!amount) return;
    setWithdrawStep("confirm");
  };

  const sendOtp = async () => {
    setSendingOtp(true);
    setPanelError("");
    try {
      await payoutPost(`${API_URL}/payments/withdrawals/send-otp/`, {}, apiOptions);
      setWithdrawStep("otp");
      onMessage?.("Verification code sent to your phone.");
    } catch (error) {
      setPanelError(error.response?.data?.error || "Could not send verification code.");
    } finally {
      setSendingOtp(false);
    }
  };

  const submitWithdrawal = async (event) => {
    event.preventDefault();
    const amount = validateWithdrawAmount();
    if (!amount) return;
    if (!withdrawalForm.otp_code?.trim()) {
      setPanelError("Enter the verification code sent to your phone.");
      return;
    }

    setWithdrawing(true);
    setPanelError("");
    try {
      const payoutMethod = await ensurePayoutMethod();
      await payoutPost(
        `${API_URL}/payments/withdrawals/request/`,
        {
          amount,
          note: withdrawalForm.note,
          payout_method: payoutMethod?.id || defaultMethod?.id,
          otp_code: withdrawalForm.otp_code.trim(),
        },
        apiOptions
      );
      setWithdrawalForm({ amount: "", note: "", otp_code: "" });
      setWithdrawStep("amount");
      onMessage?.("Withdrawal submitted. Status: Pending admin review.");
      await loadPayoutData();
    } catch (error) {
      setPanelError(error.response?.data?.error || error.message || "Could not submit withdrawal request.");
    } finally {
      setWithdrawing(false);
    }
  };

  const pendingTotal = withdrawals
    .filter((item) => ["pending", "approved"].includes(item.status))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (loading) {
    return (
      <section className="driver-payout-panel" aria-label="Wallet and withdrawals">
        <p className="driver-payout-loading">Loading wallet...</p>
      </section>
    );
  }

  const formatWithdrawalStatus = (status = "pending") =>
    WITHDRAWAL_STATUS_LABELS[status] || status.replace(/_/g, " ");

  return (
    <section className="driver-payout-panel" aria-label="Wallet and withdrawals">
      <div className="driver-payout-header">
        <h3>{showWalletOverview ? "Wallet" : "Wallet &amp; withdrawals"}</h3>
        <span>{payoutReady ? "Ready" : "Setup required"}</span>
      </div>

      {panelError && <div className="driver-payout-error">{panelError}</div>}

      <div className="driver-payout-summary driver-payout-summary--wallet">
        <article>
          <small>Available balance</small>
          <strong>{formatMoney(withdrawableBalance)}</strong>
        </article>
        <article>
          <small>Pending balance</small>
          <strong>{formatMoney(pendingBalance)}</strong>
        </article>
        {!showWalletOverview && (
          <article>
            <small>Lifetime earnings</small>
            <strong>{formatMoney(totalEarned)}</strong>
          </article>
        )}
        <article>
          <small>Today&apos;s earnings</small>
          <strong>{formatMoney(earnings.today?.total || 0)}</strong>
        </article>
        <article>
          <small>Weekly earnings</small>
          <strong>{formatMoney(earnings.week?.total || 0)}</strong>
        </article>
        <article>
          <small>Monthly earnings</small>
          <strong>{formatMoney(earnings.month?.total || 0)}</strong>
        </article>
      </div>

      {showWalletOverview && (
        <>
          <button
            type="button"
            className="driver-payout-withdraw-primary"
            onClick={onWithdrawClick}
          >
            WITHDRAW MONEY
          </button>
          {!payoutReady ? (
            <p className="driver-payout-help">
              Add a payout method on the withdraw screen before requesting money.
            </p>
          ) : null}
          {hasPendingWithdrawal ? (
            <p className="driver-payout-help">You have a withdrawal pending admin review.</p>
          ) : null}
        </>
      )}

      {showWithdrawFlow && (
        <>
      <PlatformWithdrawalAccounts
        apiClient={apiOptions.useAuthenticatedApi ? authenticatedApi : axios}
        authHeaders={apiOptions.useAuthenticatedApi ? NON_REDIRECTING_AUTH_CONFIG : authHeaders}
        selectedMethodId={selectedWithdrawalMethod}
        onSelectMethod={handleWithdrawalMethodSelect}
        title="Withdrawal provider"
        subtitle="Choose Bankily, Sedad, or Masravi. Enter your own mobile money number below."
      />

      <form className="driver-payout-form" onSubmit={savePayoutMethod}>
        <label>
          <span>Account holder name</span>
          <input
            value={form.account_holder_name}
            onChange={(event) => updateForm("account_holder_name", event.target.value)}
            placeholder="Full name on your mobile money account"
            autoComplete="name"
          />
        </label>
        <label>
          <span>{PROVIDER_LABELS[form.payout_type] || "Mobile money"} phone number</span>
          <input
            value={form.phone_number}
            onChange={(event) => updateForm("phone_number", event.target.value)}
            placeholder="Your mobile money number"
            inputMode="tel"
            autoComplete="tel"
            required
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : selectedMethodRecord ? "Update payout method" : "Save payout method"}
        </button>
      </form>

      {withdrawStep === "amount" && (
        <form className="driver-payout-withdraw" onSubmit={proceedToConfirm}>
          <h4>Withdraw money</h4>
          <p>
            Minimum {formatMoney(minimumWithdrawal)} · Available {formatMoney(withdrawableBalance)} ·{" "}
            {payoutSummary(selectedMethodRecord)}
          </p>
          <label>
            <span>Amount (MRU)</span>
            <input
              type="number"
              min={minimumWithdrawal || 500}
              step="1"
              max={withdrawableBalance || undefined}
              value={withdrawalForm.amount}
              onChange={(event) =>
                setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))
              }
              placeholder="0"
              disabled={!canRequestWithdrawal || hasPendingWithdrawal || withdrawing}
            />
          </label>
          <label>
            <span>Note (optional)</span>
            <input
              value={withdrawalForm.note}
              onChange={(event) =>
                setWithdrawalForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Any details for admin review"
              disabled={!canRequestWithdrawal || hasPendingWithdrawal || withdrawing}
            />
          </label>
          <button type="submit" disabled={!canRequestWithdrawal || hasPendingWithdrawal || withdrawing}>
            Continue
          </button>
          {!payoutReady ? (
            <p className="driver-payout-help">Save your payout details above before withdrawing.</p>
          ) : null}
          {hasPendingWithdrawal ? (
            <p className="driver-payout-help">You already have a pending withdrawal under review.</p>
          ) : null}
        </form>
      )}

      {withdrawStep === "confirm" && (
        <div className="driver-payout-withdraw driver-payout-withdraw--confirm">
          <h4>Confirm withdrawal</h4>
          <p>
            Withdraw <strong>{formatMoney(withdrawalForm.amount)}</strong> to{" "}
            <strong>{payoutSummary(selectedMethodRecord)}</strong>
          </p>
          <div className="driver-payout-actions">
            <button type="button" className="driver-payout-secondary" onClick={() => setWithdrawStep("amount")}>
              Back
            </button>
            <button type="button" onClick={sendOtp} disabled={sendingOtp}>
              {sendingOtp ? "Sending code..." : "Send OTP & confirm"}
            </button>
          </div>
        </div>
      )}

      {withdrawStep === "otp" && (
        <form className="driver-payout-withdraw" onSubmit={submitWithdrawal}>
          <h4>Enter verification code</h4>
          <p>We sent a 6-digit code to your registered phone number.</p>
          <label>
            <span>OTP code</span>
            <input
              value={withdrawalForm.otp_code}
              onChange={(event) =>
                setWithdrawalForm((current) => ({ ...current, otp_code: event.target.value }))
              }
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
            />
          </label>
          <div className="driver-payout-actions">
            <button type="button" className="driver-payout-secondary" onClick={() => setWithdrawStep("confirm")}>
              Back
            </button>
            <button type="submit" disabled={withdrawing}>
              {withdrawing ? "Submitting..." : "Confirm withdrawal"}
            </button>
          </div>
        </form>
      )}
        </>
      )}

      {!showWalletOverview && ledger.length > 0 && (
        <div className="driver-payout-ledger">
          <h4>Wallet ledger</h4>
          {ledger.slice(0, 8).map((item) => (
            <article key={item.id} className="driver-payout-ledger-row">
              <div>
                <strong>{item.label}</strong>
                <small>{item.reference || item.status || ""}</small>
              </div>
              <span className={item.is_credit ? "is-credit" : "is-debit"}>
                {item.is_credit ? "+" : "-"}
                {formatMoney(item.amount)}
              </span>
            </article>
          ))}
        </div>
      )}

      {withdrawals.length > 0 && (
        <div className="driver-payout-history">
          <h4>{showWalletOverview ? "Withdrawal history" : "Recent withdrawals"}</h4>
          {withdrawals.slice(0, showWalletOverview ? 10 : 5).map((item) => (
            <article key={item.id} className="driver-payout-history-row">
              <div>
                <strong>{formatMoney(item.amount)}</strong>
                <small>{item.payout_method_display || payoutSummary(defaultMethod)}</small>
              </div>
              <span className={`driver-payout-status ${item.status || "pending"}`}>
                {formatWithdrawalStatus(item.status || "pending")}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
