import React from "react";

import { formatWalletAmount, toNumber } from "../wallet/walletUtils";

export default function DriverEarningsWalletPanel({ wallet, onOpenWallet }) {
  if (!wallet || typeof wallet !== "object") return null;

  const currentBalance = toNumber(wallet.wallet_balance);
  const available = toNumber(wallet.available_balance);
  const pending = toNumber(wallet.pending_balance ?? wallet.pending_withdrawals);
  const withdrawals = Array.isArray(wallet.withdrawals) ? wallet.withdrawals : [];
  const lastPayout =
    withdrawals.find((item) =>
      ["paid", "completed"].includes(String(item.status || "").toLowerCase()),
    ) || null;
  const upcoming =
    withdrawals.find((item) =>
      ["pending", "approved"].includes(String(item.status || "").toLowerCase()),
    ) || null;

  return (
    <section className="earnings-hub__section" aria-label="Wallet summary">
      <div className="earnings-hub__section-head">
        <h3 className="earnings-hub__section-title">Wallet</h3>
        {typeof onOpenWallet === "function" ? (
          <button type="button" className="earnings-hub__link-btn" onClick={onOpenWallet}>
            View wallet
          </button>
        ) : null}
      </div>
      <div className="earnings-hub__grid">
        <div className="earnings-hub__stat">
          <strong>{formatWalletAmount(currentBalance)}</strong>
          <span>Current balance</span>
        </div>
        <div className="earnings-hub__stat">
          <strong>{formatWalletAmount(available)}</strong>
          <span>Available</span>
        </div>
        <div className="earnings-hub__stat">
          <strong>{formatWalletAmount(pending)}</strong>
          <span>Pending</span>
        </div>
      </div>
      {lastPayout || upcoming ? (
        <div className="earnings-hub__wallet-meta">
          {lastPayout ? (
            <span>
              Last payout: {formatWalletAmount(lastPayout.amount)} · {lastPayout.status}
            </span>
          ) : null}
          {upcoming ? (
            <span>
              Upcoming payout: {formatWalletAmount(upcoming.amount)} · {upcoming.status}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
