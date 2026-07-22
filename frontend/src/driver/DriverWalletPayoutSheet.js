import React, { useEffect, useState } from "react";

import { savePayoutMethod } from "./wallet/driverWalletApi";
import {
  findSavedMethod,
  maskAccount,
  maskPayoutMethod,
  PAYOUT_METHODS,
} from "./wallet/walletUtils";
import "./DriverWallet.css";

const EMPTY_FORM = {
  account_holder_name: "",
  phone_number: "",
  bank_name: "",
  account_reference: "",
};

export default function DriverWalletPayoutSheet({ payoutMethods, onClose, onSaved }) {
  const [selectedMethodId, setSelectedMethodId] = useState("bankily");
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedConfig = PAYOUT_METHODS.find((item) => item.id === selectedMethodId);
  const savedMethod = findSavedMethod(payoutMethods, selectedMethodId);

  useEffect(() => {
    if (!savedMethod) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      account_holder_name: savedMethod.account_holder_name || "",
      phone_number: savedMethod.phone_number || savedMethod.wallet_id || "",
      bank_name: savedMethod.bank_name || "",
      account_reference: savedMethod.account_reference || "",
    });
  }, [savedMethod]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedConfig?.supported) {
      setError("This payout method is not available yet.");
      return;
    }
    if (selectedMethodId === "bank_account") {
      if (!form.bank_name.trim() || !form.account_reference.trim()) {
        setError("Bank name and account number are required.");
        return;
      }
    } else if (!form.phone_number.trim()) {
      setError("Phone number is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await savePayoutMethod({
        payout_type: selectedConfig.backendType,
        account_holder_name: form.account_holder_name.trim(),
        phone_number: form.phone_number.trim(),
        bank_name: form.bank_name.trim(),
        account_reference: form.account_reference.trim(),
        is_default: true,
      });
      onSaved?.();
    } catch (saveError) {
      setError(saveError.response?.data?.error || "Could not save payout method.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button type="button" className="dw-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <section className="dw-sheet" role="dialog" aria-modal="true" aria-label="Manage payout method">
        <div className="dw-sheet__handle" />
        <h2 className="dw-sheet__title">Manage payout method</h2>

        <div className="dw-method-list">
          {PAYOUT_METHODS.filter((method) => method.supported).map((method) => {
            const saved = findSavedMethod(payoutMethods, method.id);
            return (
              <button
                key={method.id}
                type="button"
                className={`dw-method-card${selectedMethodId === method.id ? " is-selected" : ""}`}
                onClick={() => setSelectedMethodId(method.id)}
              >
                <span className="dw-method-card__icon">{method.icon}</span>
                <span>
                  <p className="dw-method-card__title">{method.label}</p>
                  <p className="dw-method-card__subtitle">
                    {saved ? maskPayoutMethod(saved) : "Not configured"}
                  </p>
                </span>
                {saved ? <span className="dw-method-card__badge">Verified · Edit</span> : null}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSave}>
          <label className="dw-input-label" htmlFor="sheet-holder">
            Account holder name
            <input
              id="sheet-holder"
              className="dw-input"
              value={form.account_holder_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, account_holder_name: event.target.value }))
              }
            />
          </label>
          {selectedMethodId === "bank_account" ? (
            <>
              <label className="dw-input-label" htmlFor="sheet-bank">
                Bank name
                <input
                  id="sheet-bank"
                  className="dw-input"
                  value={form.bank_name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, bank_name: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="dw-input-label" htmlFor="sheet-account">
                Account number / RIB
                <input
                  id="sheet-account"
                  className="dw-input"
                  value={form.account_reference}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, account_reference: event.target.value }))
                  }
                  required
                />
              </label>
            </>
          ) : (
            <label className="dw-input-label" htmlFor="sheet-phone">
              {selectedConfig?.label} phone number
              <input
                id="sheet-phone"
                className="dw-input"
                value={form.phone_number}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone_number: event.target.value }))
                }
                inputMode="tel"
                required
              />
            </label>
          )}
          {savedMethod ? (
            <p className="driver-payout-help">Saved account: {maskPayoutMethod(savedMethod)}</p>
          ) : null}
          {error ? <div className="dw-error" style={{ marginTop: 12 }}>{error}</div> : null}
          <button type="submit" className="dw-btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save payout method"}
          </button>
        </form>
      </section>
    </>
  );
}
