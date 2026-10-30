import React, { useCallback, useEffect, useState } from "react";

import { AlertBanner, InlineError, StatusChip, formatTimestamp } from "../components/library";
import { fetchWithdrawalDetail } from "./withdrawalsApi";

/**
 * Read-only withdrawal review drawer (Phase 7).
 *
 * There are deliberately NO approve / reject / mark-paid controls: the finance
 * surface is frozen and this UI must not perform state transitions or wallet
 * mutations. The drawer shows what the platform already stored (request fields,
 * status timeline, wallet snapshot, recent wallet transactions) and states the
 * freeze explicitly so the absence of actions is not mistaken for a bug.
 *
 * `canReview` (finance.approve_withdrawal capability) gates the sensitive
 * requester/payout/wallet block; the backend enforces authorization regardless.
 */
function Field({ label, children }) {
  return (
    <div className="admin-drawer__field">
      <span className="admin-drawer__field-label">{label}</span>
      <span className="admin-drawer__field-value">{children ?? "N/A"}</span>
    </div>
  );
}

function naOr(value) {
  if (value === null || value === undefined) return "N/A";
  const text = String(value).trim();
  return text === "" ? "N/A" : text;
}

function statusTone(status) {
  // Amber for pending, matching the withdrawal queue table.
  if (status === "pending") return "warning";
  if (status === "approved" || status === "paid") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

export default function WithdrawalDetailsDrawer({
  withdrawal,
  loading,
  error,
  canReview,
  onClose,
  onRetry,
}) {
  const withdrawalId = withdrawal?.id;
  const [detail, setDetail] = useState({ loading: false, error: "", data: null });

  const loadDetail = useCallback(async () => {
    if (!withdrawalId) return;
    setDetail({ loading: true, error: "", data: null });
    try {
      const data = await fetchWithdrawalDetail(withdrawalId);
      setDetail({ loading: false, error: "", data });
    } catch (err) {
      setDetail({
        loading: false,
        error: err?.response?.data?.detail || "Could not load withdrawal detail.",
        data: null,
      });
    }
  }, [withdrawalId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const row = detail.data || withdrawal;

  if (!withdrawal && !loading && !error) return null;

  return (
    <div className="admin-drawer__overlay" role="presentation" onClick={onClose}>
      <div
        className="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={row ? `Withdrawal ${row.id} review` : "Withdrawal review"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-drawer__head">
          <div>
            <h2 className="admin-drawer__title">
              {row ? `Withdrawal #${row.id}` : "Withdrawal review"}
            </h2>
            {row?.status ? (
              <StatusChip label={row.status} tone={statusTone(row.status)} />
            ) : null}
          </div>
          <button type="button" className="admin-lib-btn admin-lib-btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="admin-drawer__body">
          <AlertBanner tone="info">
            Read-only review. Approval, rejection and mark-paid actions are frozen and
            intentionally unavailable here — no wallet balance, payout state or transfer can
            be changed from this screen.
          </AlertBanner>

          {loading ? <p className="admin-drawer__state">Loading withdrawal…</p> : null}
          {error ? (
            <div>
              <InlineError message={error} />
              {onRetry ? (
                <button type="button" className="admin-lib-btn" onClick={onRetry}>
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {detail.loading ? <p className="admin-drawer__state">Loading review detail…</p> : null}
          {detail.error ? (
            <div>
              <InlineError message={detail.error} />
              <button type="button" className="admin-lib-btn" onClick={loadDetail}>
                Retry
              </button>
            </div>
          ) : null}

          {row && !loading && !error ? (
            <>
              <section className="admin-drawer__section">
                <h3>Request</h3>
                <Field label="Amount">
                  {naOr(row.amount)} {naOr(row.currency || "MRU")}
                </Field>
                <Field label="Status">{naOr(row.status)}</Field>
                <Field label="Requested">{formatTimestamp(row.created_at)}</Field>
                <Field label="Approved">{formatTimestamp(row.approved_at)}</Field>
                <Field label="Paid">{formatTimestamp(row.paid_at)}</Field>
                <Field label="Reference">{naOr(row.reference)}</Field>
                <Field label="Payment reference">{naOr(row.payment_reference)}</Field>
                <Field label="Requester note">{naOr(row.note)}</Field>
                <Field label="Admin note">{naOr(row.admin_note)}</Field>
              </section>

              <section className="admin-drawer__section">
                <h3>Status timeline</h3>
                {(row.timeline || []).length === 0 ? (
                  <p className="withdrawals-detail__empty">No timeline entries recorded.</p>
                ) : (
                  <ul className="withdrawals-detail__timeline">
                    {row.timeline.map((entry) => (
                      <li key={`${entry.label}-${entry.at}`}>
                        <strong>{entry.label}</strong>
                        <span className="withdrawals-cell-hint">
                          {formatTimestamp(entry.at)}
                          {entry.actor ? ` · ${entry.actor}` : ""}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>


              {canReview ? (
                <section className="admin-drawer__section">
                  <h3>Requester &amp; payout destination</h3>
                  <Field label="Name">{naOr(row.requester?.name)}</Field>
                  <Field label="Email">{naOr(row.requester?.email)}</Field>
                  <Field label="Phone">{naOr(row.requester?.phone_number)}</Field>
                  <Field label="Account">{row.requester?.is_active ? "Active" : "Inactive"}</Field>
                  <Field label="Courier">{row.requester?.is_courier ? "Yes" : "No"}</Field>
                  <Field label="Payout destination">
                    {naOr(row.payout_method_label || row.payout_method?.label)}
                  </Field>

                  <h4 className="withdrawals-detail__subheading">Wallet snapshot (stored values)</h4>
                  <Field label="Wallet balance">{naOr(row.wallet?.balance)}</Field>
                  <Field label="Pending balance">{naOr(row.wallet?.pending_balance)}</Field>
                  <Field label="Open withdrawal requests">
                    {naOr(row.wallet?.open_withdrawal_amount)}
                  </Field>
                  <p className="withdrawals-cell-hint">
                    Stored values only — this screen does not compute an available balance or
                    apply any commission.
                  </p>

                  <h4 className="withdrawals-detail__subheading">Recent wallet transactions</h4>
                  {(row.wallet_transactions || []).length === 0 ? (
                    <p className="withdrawals-detail__empty">No wallet transactions recorded.</p>
                  ) : (
                    <div className="withdrawals-detail__table-wrap">
                      <table className="withdrawals-detail__table">
                        <thead>
                          <tr>
                            <th scope="col">Type</th>
                            <th scope="col">Amount</th>
                            <th scope="col">Direction</th>
                            <th scope="col">Balance after</th>
                            <th scope="col">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.wallet_transactions.map((tx) => (
                            <tr key={tx.id}>
                              <td>{naOr(tx.transaction_type)}</td>
                              <td>{naOr(tx.amount)}</td>
                              <td>{tx.is_credit ? "Credit" : "Debit"}</td>
                              <td>{naOr(tx.balance_after)}</td>
                              <td>{formatTimestamp(tx.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ) : (
                <section className="admin-drawer__section">
                  <h3>Requester &amp; payout destination</h3>
                  <p className="withdrawals-detail__empty">
                    Restricted — the finance approval capability is required to view requester
                    contact details, the payout destination and the wallet snapshot.
                  </p>
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

