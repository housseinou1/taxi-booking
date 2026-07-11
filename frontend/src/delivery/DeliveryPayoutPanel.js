import React, { useCallback, useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import { formatMoney } from "../marketConfig";
import PlatformWithdrawalAccounts, {
  payoutTypeForMethod,
} from "../components/PlatformWithdrawalAccounts";
import "./delivery-uber.css";

const EMPTY_FORM = {
  payout_type: "bank_account",
  account_holder_name: "",
  bank_name: "",
  account_reference: "",
  phone_number: "",
};

function maskAccountReference(value = "") {
  const normalized = String(value).trim();
  if (!normalized) return "Not set";
  if (normalized.length <= 4) return normalized;
  return `**** ${normalized.slice(-4)}`;
}

function payoutSummary(method) {
  if (!method) return "Add bank details to receive delivery withdrawals";
  if (method.display_name) return method.display_name;
  if (method.payout_type === "bank_account") {
    return `${method.bank_name || "Bank"} - ${maskAccountReference(method.account_reference)}`;
  }
  return "Payout method on file";
}

function isPayoutFormReady(form) {
  if (form.payout_type === "bank_account") {
    return Boolean(form.bank_name?.trim() && form.account_reference?.trim());
  }
  if (["bankily", "seddad", "masrvi"].includes(form.payout_type)) {
    return Boolean(form.phone_number?.trim());
  }
  return false;
}

export default function DeliveryPayoutPanel({ onMessage }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: "", note: "" });
  const [selectedWithdrawalMethod, setSelectedWithdrawalMethod] = useState("bank_transfer");
  const [panelError, setPanelError] = useState("");

  const defaultMethod = useMemo(
    () => payoutMethods.find((item) => item.is_default) || payoutMethods[0] || null,
    [payoutMethods]
  );
  const canRequestWithdrawal = isPayoutFormReady(form) && Number(withdrawableBalance || 0) > 0;

  const loadPayoutData = useCallback(async () => {
    setLoading(true);
    setPanelError("");
    try {
      const [methodsResponse, withdrawalsResponse] = await Promise.all([
        authenticatedApi.get(`${API_URL}/payments/payout-methods/`),
        authenticatedApi.get(`${API_URL}/payments/withdrawals/`),
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
      setWithdrawableBalance(Number(withdrawalPayload.available_balance || 0));

      const bankMethod =
        methods.find((item) => item.is_default && item.payout_type === "bank_account") ||
        methods.find((item) => item.payout_type === "bank_account") ||
        null;

      if (bankMethod) {
        setForm({
          payout_type: "bank_account",
          account_holder_name: bankMethod.account_holder_name || "",
          bank_name: bankMethod.bank_name || "",
          account_reference: bankMethod.account_reference || "",
        });
      }
    } catch (error) {
      setPanelError(error.response?.data?.error || "Could not load delivery payout details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayoutData();
  }, [loadPayoutData]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleWithdrawalMethodSelect = (method) => {
    setSelectedWithdrawalMethod(method.id);
    setForm((current) => ({
      ...current,
      payout_type: payoutTypeForMethod(method),
    }));
  };

  const ensurePayoutMethod = async () => {
    const payoutType = form.payout_type || "bank_account";
    const existing =
      payoutMethods.find((item) => item.is_default && item.payout_type === payoutType) ||
      payoutMethods.find((item) => item.payout_type === payoutType) ||
      null;
    if (existing) return existing;

    const payload = {
      ...form,
      payout_type: payoutType,
      is_default: true,
    };
    if (payoutType === "bank_account") {
      if (!payload.bank_name || !payload.account_reference) {
        throw new Error("Add your bank account details before requesting a delivery withdrawal.");
      }
    } else if (["bankily", "seddad"].includes(payoutType) && !payload.phone_number) {
      throw new Error("Add your mobile money phone number before requesting a delivery withdrawal.");
    }

    const response = await authenticatedApi.post(`${API_URL}/payments/payout-methods/save/`, payload);
    await loadPayoutData();
    return response.data;
  };

  const savePayoutMethod = async (event) => {
    if (event) event.preventDefault();
    setSaving(true);
    setPanelError("");
    try {
      await authenticatedApi.post(`${API_URL}/payments/payout-methods/save/`, {
        ...form,
        is_default: true,
      });
      onMessage?.("Delivery payout method saved.");
      await loadPayoutData();
    } catch (error) {
      const payload = error.response?.data;
      const message =
        payload?.error ||
        payload?.non_field_errors?.[0] ||
        Object.values(payload || {}).flat().find(Boolean) ||
        error.message ||
        "Could not save delivery payout method.";
      setPanelError(message);
    } finally {
      setSaving(false);
    }
  };

  const requestWithdrawal = async (event) => {
    event.preventDefault();
    setWithdrawing(true);
    setPanelError("");
    try {
      const payoutMethod = await ensurePayoutMethod();
      if (!payoutMethod?.id && !defaultMethod) {
        setPanelError("Add your payout details before requesting a delivery withdrawal.");
        return;
      }
      const amount = Number(withdrawalForm.amount || 0);
      if (!amount || amount <= 0) {
        setPanelError("Enter a withdrawal amount greater than zero.");
        return;
      }
      if (amount > Number(withdrawableBalance || 0)) {
        setPanelError(`You can withdraw up to ${formatMoney(withdrawableBalance)} right now.`);
        return;
      }
      await authenticatedApi.post(
        `${API_URL}/payments/withdrawals/request/`,
        {
          amount,
          note: withdrawalForm.note,
          payout_method: payoutMethod?.id || defaultMethod?.id,
        }
      );
      setWithdrawalForm({ amount: "", note: "" });
      onMessage?.("Delivery withdrawal request submitted for admin approval.");
      await loadPayoutData();
    } catch (error) {
      setPanelError(error.response?.data?.error || "Could not submit delivery withdrawal request.");
    } finally {
      setWithdrawing(false);
    }
  };

  const pendingTotal = withdrawals
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (loading) {
    return <p className="delivery-uber__empty">Loading delivery wallet...</p>;
  }

  return (
    <section className="delivery-uber__earnings">
      {panelError ? <div className="delivery-uber__toast is-error">{panelError}</div> : null}

      <div className="delivery-uber__earnings-grid">
        <article className="delivery-uber__earnings-card is-highlight">
          <small>Available to withdraw</small>
          <strong>{formatMoney(withdrawableBalance)}</strong>
          <span>Delivery wallet balance</span>
        </article>
        <article className="delivery-uber__earnings-card">
          <small>Pending withdrawals</small>
          <strong>{formatMoney(pendingTotal)}</strong>
          <span>Awaiting admin review</span>
        </article>
      </div>

      <PlatformWithdrawalAccounts
        selectedMethodId={selectedWithdrawalMethod}
        onSelectMethod={handleWithdrawalMethodSelect}
        title="Delivery withdrawal method"
        subtitle="Choose Bank Transfer, Bankily, or Sedad. Yala destination account numbers are managed by admin."
      />

      <div className="delivery-uber__summary-card">
        <h3>Your delivery payout details</h3>
        <p>{payoutSummary(defaultMethod)}</p>
        <form className="delivery-uber__form-grid" onSubmit={savePayoutMethod}>
          <label className="delivery-uber-field">
            Account holder name
            <input
              value={form.account_holder_name}
              onChange={(event) => updateForm("account_holder_name", event.target.value)}
              placeholder="Full name on bank account"
              autoComplete="name"
            />
          </label>
          {form.payout_type === "bank_account" ? (
            <>
              <label className="delivery-uber-field">
                Bank name
                <input
                  value={form.bank_name}
                  onChange={(event) => updateForm("bank_name", event.target.value)}
                  placeholder="Bank name"
                  autoComplete="organization"
                  required
                />
              </label>
              <label className="delivery-uber-field">
                Your account number / RIB
                <input
                  value={form.account_reference}
                  onChange={(event) => updateForm("account_reference", event.target.value)}
                  placeholder="Bank account or RIB"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </label>
            </>
          ) : (
            <label className="delivery-uber-field">
              {form.payout_type === "bankily" ? "Bankily" : "Sedad"} phone number
              <input
                value={form.phone_number}
                onChange={(event) => updateForm("phone_number", event.target.value)}
                placeholder="Your mobile money number"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>
          )}
          <button type="submit" className="delivery-uber__primary-btn" disabled={saving}>
            {saving ? "Saving..." : defaultMethod ? "Update payout method" : "Save payout method"}
          </button>
        </form>
      </div>

      <div className="delivery-uber__summary-card">
        <h3>Request delivery withdrawal</h3>
        <form className="delivery-uber__form-grid" onSubmit={requestWithdrawal}>
          <label className="delivery-uber-field">
            Amount
            <input
              type="number"
              min="1"
              step="1"
              max={withdrawableBalance || undefined}
              value={withdrawalForm.amount}
              onChange={(event) =>
                setWithdrawalForm((current) => ({ ...current, amount: event.target.value }))
              }
              placeholder="0"
              disabled={!canRequestWithdrawal}
            />
          </label>
          <label className="delivery-uber-field">
            Note
            <input
              value={withdrawalForm.note}
              onChange={(event) =>
                setWithdrawalForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="Optional note for admin"
              disabled={!canRequestWithdrawal}
            />
          </label>
          <button
            type="submit"
            className="delivery-uber__primary-btn"
            disabled={withdrawing || !canRequestWithdrawal}
          >
            {withdrawing ? "Submitting..." : "Request withdrawal"}
          </button>
        </form>
      </div>

      {withdrawals.length > 0 ? (
        <div className="delivery-uber__history-list">
          <h3 className="delivery-uber__section-title">Recent delivery withdrawals</h3>
          {withdrawals.slice(0, 5).map((item) => (
            <article key={item.id} className="delivery-uber__history-item">
              <div>
                <strong>{formatMoney(item.amount)}</strong>
                <p>{item.payout_method_display || payoutSummary(defaultMethod)}</p>
              </div>
              <div className="delivery-uber__history-meta">
                <span>{(item.status || "pending").replace(/_/g, " ")}</span>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
