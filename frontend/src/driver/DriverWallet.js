import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navigateInApp } from "../navigation/inAppNavigation";
import { fetchPayoutMethods, fetchWalletData } from "./wallet/driverWalletApi";
import {
  formatDateTime,
  formatLedgerStatus,
  formatWalletAmount,
  toNumber,
  WITHDRAWAL_STATUS_LABELS,
  withdrawalReference,
} from "./wallet/walletUtils";
import DriverWalletCashOut from "./DriverWalletCashOut";
import DriverWalletPayoutSheet from "./DriverWalletPayoutSheet";
import "./DriverWallet.css";

function WalletSkeleton() {
  return (
    <div className="dw__content">
      <div className="dw-skeleton dw-skeleton--hero" />
      <div className="dw-skeleton dw-skeleton--row" />
      <div className="dw-skeleton dw-skeleton--row" />
      <div className="dw-skeleton dw-skeleton--row" />
    </div>
  );
}

function StatusPill({ status }) {
  const normalized = String(status || "pending").toLowerCase();
  const label = WITHDRAWAL_STATUS_LABELS[normalized] || status;
  return <span className={`dw-status-pill dw-status-pill--${normalized}`}>{label}</span>;
}

export default function DriverWallet({ withdrawMode = false, showHistoryOnLoad = false }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [wallet, setWallet] = useState(null);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [showPayoutSheet, setShowPayoutSheet] = useState(false);
  const historyRef = useRef(null);

  const loadWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [walletData, methods] = await Promise.all([
        fetchWalletData(),
        fetchPayoutMethods(),
      ]);
      setWallet(walletData);
      setPayoutMethods(methods);
    } catch {
      setError("Unable to load wallet. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    if (window.sessionStorage.getItem("yala_wallet_refresh") !== "1") return;
    window.sessionStorage.removeItem("yala_wallet_refresh");
    loadWallet();
  }, [loadWallet]);

  useEffect(() => {
    const shouldShowHistory =
      showHistoryOnLoad ||
      window.sessionStorage.getItem("yala_wallet_show_history") === "1";
    if (!shouldShowHistory || loading || !historyRef.current) return;
    window.sessionStorage.removeItem("yala_wallet_show_history");
    historyRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loading, showHistoryOnLoad]);

  const summary = useMemo(
    () => ({
      available: toNumber(wallet?.available_balance),
      pending: toNumber(wallet?.pending_balance ?? wallet?.pending_withdrawals),
      today: toNumber(wallet?.today_earnings ?? wallet?.earnings?.today?.total),
      week: toNumber(wallet?.week_earnings ?? wallet?.earnings?.week?.total),
      month: toNumber(wallet?.month_earnings ?? wallet?.earnings?.month?.total),
      lifetime: toNumber(wallet?.lifetime_earnings ?? wallet?.total_earned),
      minimum: toNumber(wallet?.minimum_withdrawal) || 500,
    }),
    [wallet]
  );

  const ledger = useMemo(
    () => (Array.isArray(wallet?.ledger) ? wallet.ledger.slice(0, 8) : []),
    [wallet]
  );

  const withdrawals = useMemo(
    () => (Array.isArray(wallet?.withdrawals) ? wallet.withdrawals : []),
    [wallet]
  );

  if (withdrawMode) {
    return <DriverWalletCashOut />;
  }

  if (loading) {
    return (
      <div className="dw">
        <WalletSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dw">
        <div className="dw__content">
          <div className="dw-error">{error}</div>
          <button type="button" className="dw-btn-secondary" onClick={loadWallet}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dw">
      <div className="dw__content">
        <section className="dw-balance-card" aria-label="Wallet balance">
          <span className="dw-balance-card__label">Available to withdraw</span>
          <strong className="dw-balance-card__amount">
            {formatWalletAmount(summary.available)}
          </strong>
          <div className="dw-balance-card__meta">
            <div className="dw-balance-card__meta-item">
              <small>Pending</small>
              <strong>{formatWalletAmount(summary.pending)}</strong>
            </div>
            <div className="dw-balance-card__meta-item">
              <small>Today</small>
              <strong>{formatWalletAmount(summary.today)}</strong>
            </div>
            <div className="dw-balance-card__meta-item">
              <small>This week</small>
              <strong>{formatWalletAmount(summary.week)}</strong>
            </div>
            <div className="dw-balance-card__meta-item">
              <small>This month</small>
              <strong>{formatWalletAmount(summary.month)}</strong>
            </div>
            <div className="dw-balance-card__meta-item">
              <small>Lifetime</small>
              <strong>{formatWalletAmount(summary.lifetime)}</strong>
            </div>
          </div>
        </section>

        <button
          type="button"
          className="dw-btn-primary"
          onClick={() => navigateInApp("/driver/wallet/withdraw")}
        >
          CASH OUT
        </button>

        <button
          type="button"
          className="dw-btn-secondary"
          onClick={() => setShowPayoutSheet(true)}
        >
          Manage payout method
        </button>

        <section className="dw-section" aria-label="Recent activity">
          <div className="dw-section__header">
            <h2>Recent activity</h2>
          </div>
          <div className="dw-card">
            {ledger.length === 0 ? (
              <div className="dw-empty">No wallet activity yet.</div>
            ) : (
              ledger.map((entry) => (
                <article key={entry.id} className="dw-activity-row">
                  <div>
                    <p className="dw-activity-row__title">{entry.label}</p>
                    <p className="dw-activity-row__meta">
                      {formatDateTime(entry.created_at)} · {formatLedgerStatus(entry)}
                    </p>
                  </div>
                  <span
                    className={
                      entry.is_credit
                        ? "dw-activity-row__amount is-credit"
                        : "dw-activity-row__amount is-debit"
                    }
                  >
                    {entry.is_credit ? "+" : "-"}
                    {formatWalletAmount(entry.amount)}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="dw-section" aria-label="Withdrawal history" ref={historyRef}>
          <div className="dw-section__header">
            <h2>Withdrawal history</h2>
          </div>
          <div className="dw-card">
            {withdrawals.length === 0 ? (
              <div className="dw-empty">No withdrawals yet.</div>
            ) : (
              withdrawals.map((item) => (
                <article key={item.id} className="dw-history-row">
                  <div>
                    <p className="dw-history-row__title">
                      {formatWalletAmount(item.amount)}
                    </p>
                    <p className="dw-history-row__meta">
                      {item.payout_method_display || "Payout method"} ·{" "}
                      {formatDateTime(item.created_at)} · {withdrawalReference(item)}
                    </p>
                  </div>
                  <StatusPill status={item.status} />
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {showPayoutSheet ? (
        <DriverWalletPayoutSheet
          payoutMethods={payoutMethods}
          onClose={() => setShowPayoutSheet(false)}
          onSaved={async () => {
            setShowPayoutSheet(false);
            await loadWallet();
          }}
        />
      ) : null}
    </div>
  );
}
