import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { navigateInApp } from "../navigation/inAppNavigation";
import { StatusChip } from "../design-system/components";
import { DriverLoadingState, DriverErrorState } from "./ui/DriverAppStates";
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

function StatusPill({ status }) {
  const normalized = String(status || "pending").toLowerCase();
  const label = WITHDRAWAL_STATUS_LABELS[normalized] || status;
  const intent =
    normalized === "paid"
      ? "success"
      : normalized === "approved"
        ? "info"
        : normalized === "pending"
          ? "warning"
          : normalized === "rejected"
            ? "danger"
            : "neutral";
  return <StatusChip intent={intent}>{label}</StatusChip>;
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

  const display = useMemo(() => {
    const pick = (primary, fallback) =>
      primary !== undefined && primary !== null ? primary : fallback;
    const fmt = (value) =>
      value === undefined || value === null ? "—" : formatWalletAmount(toNumber(value));

    return {
      available: fmt(wallet?.available_balance),
      pending: fmt(pick(wallet?.pending_balance, wallet?.pending_withdrawals)),
      today: fmt(pick(wallet?.today_earnings, wallet?.earnings?.today?.total)),
      week: fmt(pick(wallet?.week_earnings, wallet?.earnings?.week?.total)),
      month: fmt(pick(wallet?.month_earnings, wallet?.earnings?.month?.total)),
      lifetime: fmt(pick(wallet?.lifetime_earnings, wallet?.total_earned)),
    };
  }, [wallet]);

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
        <DriverLoadingState title="Loading wallet..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dw">
        <div className="dw__content">
          <DriverErrorState
            title=""
            message={error}
            actionLabel="Try again"
            onAction={loadWallet}
          />
        </div>
      </div>
    );
  }

  return (
    <main className="dw">
      <h1 className="dw-page-title">Wallet</h1>

      <section className="dw-hero" aria-label="Wallet balance">
        <span className="dw-hero__label">Available to withdraw</span>
        <strong className="dw-hero__amount">{display.available}</strong>

        <div className="dw-hero__actions">
          <button
            type="button"
            className="dw-btn-primary"
            aria-label="Cash out"
            onClick={() => navigateInApp("/driver/wallet/withdraw")}
          >
            Cash out
          </button>
          <button
            type="button"
            className="dw-btn-secondary"
            aria-label="Manage payout method"
            onClick={() => setShowPayoutSheet(true)}
          >
            Manage payout method
          </button>
        </div>
      </section>

      <section className="dw-summary" aria-label="Wallet summary">
        {display.pending !== "—" && (
          <article className="dw-summary-card">
            <span className="dw-summary-card__label">Pending</span>
            <strong className="dw-summary-card__amount">{display.pending}</strong>
          </article>
        )}
        {display.today !== "—" && (
          <article className="dw-summary-card">
            <span className="dw-summary-card__label">Today</span>
            <strong className="dw-summary-card__amount">{display.today}</strong>
          </article>
        )}
        {display.week !== "—" && (
          <article className="dw-summary-card">
            <span className="dw-summary-card__label">This week</span>
            <strong className="dw-summary-card__amount">{display.week}</strong>
          </article>
        )}
        {display.month !== "—" && (
          <article className="dw-summary-card">
            <span className="dw-summary-card__label">This month</span>
            <strong className="dw-summary-card__amount">{display.month}</strong>
          </article>
        )}
        {display.lifetime !== "—" && (
          <article className="dw-summary-card">
            <span className="dw-summary-card__label">Lifetime</span>
            <strong className="dw-summary-card__amount">{display.lifetime}</strong>
          </article>
        )}
      </section>

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
                <div className="dw-activity-row__main">
                  <p className="dw-activity-row__title">{entry.label}</p>
                  <p className="dw-activity-row__meta">
                    {formatLedgerStatus(entry)}
                    {entry.created_at ? ` · ${formatDateTime(entry.created_at)}` : ""}
                  </p>
                </div>
                <span
                  className={
                    entry.is_credit
                      ? "dw-activity-row__amount is-credit"
                      : "dw-activity-row__amount is-debit"
                  }
                  aria-label={entry.is_credit ? "Credit" : "Debit"}
                >
                  {entry.is_credit ? "+ " : "- "}
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
                <div className="dw-history-row__main">
                  <p className="dw-history-row__title">
                    {formatWalletAmount(item.amount)}
                  </p>
                  <p className="dw-history-row__meta">
                    {item.payout_method_display || "Payout method"}
                    {item.created_at ? ` · ${formatDateTime(item.created_at)}` : ""}
                    {withdrawalReference(item)
                      ? ` · ${withdrawalReference(item)}`
                      : ""}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </article>
            ))
          )}
        </div>
      </section>

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
    </main>
  );
}
