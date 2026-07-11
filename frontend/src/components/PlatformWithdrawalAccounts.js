import React, { useEffect, useMemo, useState } from "react";

import { API_URL } from "../apiConfig";
import authenticatedApi from "../auth/authenticatedApi";
import "./PlatformWithdrawalAccounts.css";

const METHOD_ORDER = ["bankily", "sedad", "masravi"];

export default function PlatformWithdrawalAccounts({
  apiClient = authenticatedApi,
  authHeaders = null,
  selectedMethodId,
  onSelectMethod,
  title = "Withdrawal method",
  subtitle = "Choose how you want to receive your payout. Enter your own account details below.",
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = authHeaders
          ? await apiClient.get(`${API_URL}/payments/withdrawal-accounts/`, authHeaders)
          : await apiClient.get(`${API_URL}/payments/withdrawal-accounts/`);
        if (!active) return;
        setAccounts(response.data || null);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError.response?.data?.detail ||
            loadError.response?.data?.error ||
            "Could not load withdrawal accounts."
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiClient, authHeaders]);

  const methods = useMemo(() => {
    const list = Array.isArray(accounts?.methods) ? accounts.methods : [];
    return [...list].sort(
      (left, right) => METHOD_ORDER.indexOf(left.id) - METHOD_ORDER.indexOf(right.id)
    );
  }, [accounts]);

  const activeMethod =
    methods.find((method) => method.id === selectedMethodId) || methods[0] || null;

  useEffect(() => {
    if (!activeMethod || !onSelectMethod) return;
    if (selectedMethodId !== activeMethod.id) {
      onSelectMethod(activeMethod);
    }
  }, [activeMethod, onSelectMethod, selectedMethodId]);

  if (loading) {
    return <p className="platform-withdrawal-accounts__loading">Loading withdrawal accounts...</p>;
  }

  if (error) {
    return <div className="platform-withdrawal-accounts__error">{error}</div>;
  }

  if (!methods.length) {
    return <div className="platform-withdrawal-accounts__error">Withdrawal accounts are not configured yet.</div>;
  }

  return (
    <section className="platform-withdrawal-accounts" aria-label={title}>
      <div className="platform-withdrawal-accounts__header">
        <h4>{title}</h4>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>

      <div className="platform-withdrawal-accounts__choices" role="radiogroup" aria-label={title}>
        {methods.map((method) => {
          const selected = activeMethod?.id === method.id;
          return (
            <button
              key={method.id}
              type="button"
              className={`platform-withdrawal-accounts__choice${selected ? " is-selected" : ""}`}
              onClick={() => onSelectMethod?.(method)}
              aria-pressed={selected}
            >
              <span>{method.label}</span>
            </button>
          );
        })}
      </div>

      {activeMethod ? (
        <div className="platform-withdrawal-accounts__destination">
          <small>Yala {activeMethod.label} settlement reference</small>
          <strong>{activeMethod.destination || "Not configured"}</strong>
        </div>
      ) : null}
    </section>
  );
}

export const payoutTypeForMethod = (method) => {
  const value = method?.payout_type || method?.id || "bankily";
  if (value === "seddad") return "sedad";
  if (value === "masrvi") return "masravi";
  return value;
};
