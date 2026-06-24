import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";
import "./DriverPayoutPanel.css";

const EMPTY_FORM = {
  payout_type: "bank_account",
  account_holder_name: "",
  bank_name: "",
  account_reference: "",
};

const maskAccountReference = (value = "") => {
  const normalized = String(value).trim();
  if (!normalized) return "Not set";
  if (normalized.length <= 4) return normalized;
  return `•••• ${normalized.slice(-4)}`;
};

const payoutSummary = (method) => {
  if (!method) return "Add bank details to receive withdrawals";
  if (method.display_name) return method.display_name;
  if (method.payout_type === "bank_account") {
    return `${method.bank_name || "Bank"} · ${maskAccountReference(method.account_reference)}`;
  }
  return "Payout method on file";
};

export default function DriverPayoutPanel({ authHeaders, onMessage }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: "", note: "" });
  const [panelError, setPanelError] = useState("");

  const defaultMethod = useMemo(
    () => payoutMethods.find((item) => item.is_default) || payoutMethods[0] || null,
    [payoutMethods]
  );

  const loadPayoutData = useCallback(async () => {
    setLoading(true);
    setPanelError("");
    try {
      const [methodsResponse, withdrawalsResponse] = await Promise.all([
        axios.get(`${API_URL}/payments/payout-methods/`, authHeaders),
        axios.get(`${API_URL}/payments/withdrawals/`, authHeaders),
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
      setPanelError(error.response?.data?.error || "Could not load payout details.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadPayoutData();
  }, [loadPayoutData]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const saveBankAccount = async (event) => {
    event.preventDefault();
    setSaving(true);
    setPanelError("");
    try {
      await axios.post(`${API_URL}/payments/payout-methods/save/`, form, authHeaders);
      onMessage?.("Bank account saved for withdrawals.");
      await loadPayoutData();
    } catch (error) {
      const payload = error.response?.data;
      const message =
        payload?.error ||
        payload?.non_field_errors?.[0] ||
        Object.values(payload || {})
          .flat()
          .find(Boolean) ||
        "Could not save bank account.";
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
      if (!defaultMethod) {
        setPanelError("Add your bank account before requesting a withdrawal.");
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

      await axios.post(
        `${API_URL}/payments/withdrawals/request/`,
        {
          amount,
          note: withdrawalForm.note,
          payout_method: defaultMethod.id,
        },
        authHeaders
      );
      setWithdrawalForm({ amount: "", note: "" });
      onMessage?.("Withdrawal request submitted for admin approval.");
      await loadPayoutData();
    } catch (error) {
      setPanelError(error.response?.data?.error || "Could not submit withdrawal request.");
    } finally {
      setWithdrawing(false);
    }
  };

  const pendingTotal = withdrawals
    .filter((item) => item.status === "pending")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  if (loading) {
    return (
      <section className="driver-payout-panel" aria-label="Bank account for withdrawals">
        <p className="driver-payout-loading">Loading payout details...</p>
      </section>
    );
  }

  return (
    <section className="driver-payout-panel" aria-label="Bank account for withdrawals">
      <div className="driver-payout-header">
        <h3>Bank account for withdrawals</h3>
        <span>{defaultMethod ? "On file" : "Required"}</span>
      </div>

      {panelError && <div className="driver-payout-error">{panelError}</div>}

      <div className="driver-payout-summary">
        <article>
          <small>Available to withdraw</small>
          <strong>{formatMoney(withdrawableBalance)}</strong>
        </article>
        <article>
          <small>Pending withdrawals</small>
          <strong>{formatMoney(pendingTotal)}</strong>
        </article>
        <article>
          <small>Current payout method</small>
          <strong>{payoutSummary(defaultMethod)}</strong>
        </article>
      </div>

      <form className="driver-payout-form" onSubmit={saveBankAccount}>
        <label>
          <span>Account holder name</span>
          <input
            value={form.account_holder_name}
            onChange={(event) => updateForm("account_holder_name", event.target.value)}
            placeholder="Full name on the bank account"
            autoComplete="name"
          />
        </label>
        <label>
          <span>Bank name</span>
          <input
            value={form.bank_name}
            onChange={(event) => updateForm("bank_name", event.target.value)}
            placeholder="e.g. Banque Populaire Mauritanienne"
            autoComplete="organization"
            required
          />
        </label>
        <label>
          <span>Account number / RIB</span>
          <input
            value={form.account_reference}
            onChange={(event) => updateForm("account_reference", event.target.value)}
            placeholder="Bank account or RIB reference"
            inputMode="numeric"
            autoComplete="off"
            required
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : defaultMethod ? "Update bank account" : "Save bank account"}
        </button>
      </form>

      <form className="driver-payout-withdraw" onSubmit={requestWithdrawal}>
        <h4>Request withdrawal</h4>
        <p>Withdrawals are reviewed by Yala admin before payout.</p>
        <label>
          <span>Amount ({formatMoney(0).split(" ")[1] || "MRU"})</span>
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
            disabled={!defaultMethod || Number(withdrawableBalance || 0) <= 0}
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
            disabled={!defaultMethod || Number(withdrawableBalance || 0) <= 0}
          />
        </label>
        <button
          type="submit"
          disabled={withdrawing || !defaultMethod || Number(withdrawableBalance || 0) <= 0}
        >
          {withdrawing ? "Submitting..." : "Request withdrawal"}
        </button>
      </form>

      {withdrawals.length > 0 && (
        <div className="driver-payout-history">
          <h4>Recent withdrawals</h4>
          {withdrawals.slice(0, 5).map((item) => (
            <article key={item.id} className="driver-payout-history-row">
              <div>
                <strong>{formatMoney(item.amount)}</strong>
                <small>{item.payout_method_display || payoutSummary(defaultMethod)}</small>
              </div>
              <span className={`driver-payout-status ${item.status || "pending"}`}>
                {(item.status || "pending").replace(/_/g, " ")}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
