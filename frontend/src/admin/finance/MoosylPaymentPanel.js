import React, { useCallback, useEffect, useState } from "react";

import { fetchMoosylOverview } from "./moosylApi";

/**
 * Admin Finance Dashboard panel for the Moosyl aggregator (read-only).
 *
 * Shows the environment, whether settlement is enabled, the 1% fee, the webhook URL and
 * the webhook audit trail, so finance can see whether payments are actually being
 * confirmed by Moosyl rather than inferred from an app redirect.
 *
 * It is deliberately explicit about the money flow, because it is the fact most likely
 * to be misread: Moosyl pays out to YALA's own IBAN and does NOT pay drivers.
 */
export default function MoosylPaymentPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchMoosylOverview()
      .then((response) => {
        if (active) {
          setData(response?.data ?? response);
          setError("");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err?.message || "Could not load Moosyl status.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  if (loading) {
    return <div data-testid="moosyl-panel">Loading Moosyl status…</div>;
  }

  if (error) {
    return (
      <div data-testid="moosyl-panel">
        <p role="alert">{error}</p>
        <button type="button" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const events = data?.events || {};
  const recent = Array.isArray(data?.recent_events) ? data.recent_events : [];

  return (
    <section data-testid="moosyl-panel">
      <h2>Moosyl payments</h2>

      <dl>
        <dt>Environment</dt>
        <dd data-testid="moosyl-environment">{data?.environment || "unknown"}</dd>

        <dt>Provider mode</dt>
        <dd data-testid="moosyl-mode">{data?.mode || "unknown"}</dd>

        <dt>Settlement enabled</dt>
        <dd data-testid="moosyl-settlement">
          {data?.settlement_enabled ? "Yes" : "No — events are recorded only"}
        </dd>

        <dt>Processing fee</dt>
        <dd>{data?.fee_percent ? `${data.fee_percent}%` : "—"}</dd>

        <dt>Payments settle to</dt>
        <dd>{data?.settles_to || "—"}</dd>

        <dt>Driver payouts via Moosyl</dt>
        <dd>
          {data?.driver_payout_via_moosyl
            ? "Yes"
            : "No — drivers are paid through YALA's own withdrawal flow"}
        </dd>

        <dt>Refunds via Moosyl API</dt>
        <dd>{data?.refunds_via_api ? "Yes" : "No — not available from Moosyl"}</dd>

        <dt>Webhook endpoint</dt>
        <dd data-testid="moosyl-webhook-url">{data?.webhook_url || "—"}</dd>

        <dt>Bank apps</dt>
        <dd>{(data?.bank_apps || []).join(", ") || "—"}</dd>
      </dl>

      <h3>Webhook results</h3>
      <ul data-testid="moosyl-outcomes">
        {["settled", "duplicate", "ignored", "rejected", "error"].map((key) => (
          <li key={key}>
            {key}: {events[key] || 0}
          </li>
        ))}
      </ul>

      <h3>Recent events</h3>
      {recent.length === 0 ? (
        <p>No Moosyl webhooks received yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Transaction</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((event, index) => (
              <tr key={`${event.transaction_id}-${index}`}>
                <td>{event.event_type}</td>
                <td>{event.transaction_id}</td>
                <td>{event.status}</td>
                <td>{event.amount}</td>
                <td>{event.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
