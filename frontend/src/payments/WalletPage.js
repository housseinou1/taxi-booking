import React, { useCallback, useEffect, useState } from "react";

import {
  PAYMENT_METHODS,
  fetchWallet,
  fetchWalletHistory,
  topUpWallet,
} from "./paymentApi";
import "../delivery/delivery-uber.css";

function sumTransactions(history, predicate) {
  return history
    .filter(predicate)
    .reduce((total, tx) => total + Number(tx.amount || 0), 0);
}

export default function WalletPage({ onBack }) {
  const [wallet, setWallet] = useState(null);
  const [history, setHistory] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bankily");
  const [providerToken, setProviderToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [walletData, txHistory] = await Promise.all([
        fetchWallet(),
        fetchWalletHistory(),
      ]);
      setWallet(walletData);
      setHistory(txHistory);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleTopUp = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await topUpWallet(Number(amount), method, providerToken);
      setAmount("");
      setProviderToken("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const credits = sumTransactions(history, (tx) => tx.is_credit);
  const promoCredits = sumTransactions(
    history,
    (tx) => tx.is_credit && String(tx.transaction_type || "").includes("promo")
  );
  const pendingRefunds = sumTransactions(
    history,
    (tx) =>
      tx.is_credit &&
      String(tx.transaction_type || "").includes("refund") &&
      String(tx.status || "").toLowerCase() === "pending"
  );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: 16 }}>
      {onBack ? (
        <button type="button" className="delivery-uber__link-btn" onClick={onBack}>← Back</button>
      ) : null}
      <h2>Yala Wallet</h2>
      {error ? <div className="delivery-uber__toast is-error">{error}</div> : null}
      <div className="delivery-uber__earnings-card is-highlight" style={{ marginBottom: 16 }}>
        <small>Available balance</small>
        <strong>{wallet?.balance || "0"} MRU</strong>
      </div>
      <div className="delivery-uber__panel" style={{ marginBottom: 16 }}>
        <h3>Wallet summary</h3>
        <div className="delivery-uber__list-item">
          <strong>Credits</strong>
          <div>{credits.toFixed(2)} MRU</div>
        </div>
        <div className="delivery-uber__list-item">
          <strong>Promo credits</strong>
          <div>{promoCredits.toFixed(2)} MRU</div>
        </div>
        <div className="delivery-uber__list-item">
          <strong>Pending refunds</strong>
          <div>{pendingRefunds.toFixed(2)} MRU</div>
        </div>
        <div className="delivery-uber__list-item">
          <strong>Pending balance</strong>
          <div>{wallet?.pending_balance || "0"} MRU</div>
        </div>
      </div>

      <form className="delivery-uber__form delivery-uber__panel" onSubmit={handleTopUp}>
        <h3>Add money</h3>
        <label>
          Amount (MRU)
          <input type="number" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.filter((m) => m.value !== "cash" && m.value !== "promo_credit").map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <label>
          Provider token (no card numbers stored)
          <input
            placeholder="tok_xxxx"
            value={providerToken}
            onChange={(e) => setProviderToken(e.target.value)}
          />
        </label>
        <button type="submit" className="delivery-uber__primary-btn" disabled={busy}>
          {busy ? "Processing..." : "Top up wallet"}
        </button>
      </form>

      <div className="delivery-uber__panel" style={{ marginTop: 16 }}>
        <h3>Transaction history</h3>
        {history.length === 0 ? <p>No transactions yet.</p> : history.map((tx) => (
          <div key={tx.id} className="delivery-uber__list-item">
            <strong>{tx.transaction_type}</strong>
            <div>{tx.is_credit ? "+" : "-"}{tx.amount} MRU</div>
            <small>{tx.note || tx.reference}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
