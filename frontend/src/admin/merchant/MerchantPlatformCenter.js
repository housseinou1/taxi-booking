import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  approveMerchantSettlement,
  fetchMerchantCeoDashboard,
  fetchMerchantFinanceDashboard,
  fetchMerchantPlatformDashboard,
  generateMerchantSettlement,
  merchantPlatformAction,
  updateMerchantCommission,
} from "./merchantPlatformApi";
import "../beta/BetaDashboard.css";
import "./MerchantPlatformCenter.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "admin", label: "Merchant Admin" },
  { id: "finance", label: "Finance & Settlements" },
  { id: "ceo", label: "CEO Dashboard" },
];

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

export default function MerchantPlatformCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [financeData, setFinanceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchMerchantPlatformDashboard();
      setData(dashboard);
      if (tab === "ceo") setCeoData(await fetchMerchantCeoDashboard());
      if (tab === "finance") setFinanceData(await fetchMerchantFinanceDashboard());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load merchant platform");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const merchants = data?.merchants || [];

  const handleAction = async (merchantId, action) => {
    await merchantPlatformAction(merchantId, { action });
    await load();
  };

  const handleCommission = async (merchantId) => {
    const value = window.prompt("Merchant commission rate (0.0 - 1.0, e.g. 0.90):", "0.90");
    if (!value) return;
    await updateMerchantCommission(merchantId, Number(value));
    await load();
  };

  const handleSettlement = async (merchantId) => {
    await generateMerchantSettlement(merchantId);
    setFinanceData(await fetchMerchantFinanceDashboard());
    await load();
  };

  const handleApproveSettlement = async (settlementId) => {
    await approveMerchantSettlement(settlementId);
    setFinanceData(await fetchMerchantFinanceDashboard());
    await load();
  };

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <p className="beta__eyebrow">Phase 31 · Production</p>
          <h1>Yala Merchant Platform</h1>
          <p className="beta__subtitle">Merchant onboarding, menu operations, orders, analytics, settlements, and CEO metrics.</p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading merchant platform…</p> : null}

      <div className="merchant-platform-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`merchant-platform-tab ${tab === item.id ? "merchant-platform-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "admin") && summary ? (
        <div className="beta__grid">
          <MetricCard label="Total merchants" value={summary.total_merchants} />
          <MetricCard label="Approved" value={summary.approved} />
          <MetricCard label="Pending" value={summary.pending} />
          <MetricCard label="Suspended" value={summary.suspended} />
          <MetricCard label="Gross revenue" value={formatMoney(summary.gross_revenue)} />
          <MetricCard label="Pending settlements" value={summary.pending_settlements} />
        </div>
      ) : null}

      {tab === "admin" ? (
        <section className="merchant-platform-panel">
          <h3>Merchant management</h3>
          {merchants.map((merchant) => (
            <div key={merchant.id} className="merchant-platform-row">
              <div>
                <strong>{merchant.business_name}</strong>
                <div>{merchant.merchant_type} · {merchant.status} · {merchant.city}</div>
                <small>{merchant.total_orders} orders · {formatMoney(merchant.revenue)} revenue</small>
              </div>
              <div className="merchant-platform-actions">
                {merchant.status === "pending" ? (
                  <button type="button" onClick={() => handleAction(merchant.id, "approve")}>Approve</button>
                ) : null}
                {merchant.status === "approved" ? (
                  <button type="button" onClick={() => handleAction(merchant.id, "suspend")}>Suspend</button>
                ) : null}
                {merchant.status === "suspended" ? (
                  <button type="button" onClick={() => handleAction(merchant.id, "reactivate")}>Reactivate</button>
                ) : null}
                <button type="button" onClick={() => handleCommission(merchant.id)}>Commission</button>
                <button type="button" onClick={() => handleSettlement(merchant.id)}>Generate settlement</button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "finance" && financeData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Default merchant rate" value={`${((financeData.default_commission?.merchant_rate || 0) * 100).toFixed(0)}%`} />
            <MetricCard label="Platform rate" value={`${((financeData.default_commission?.platform_rate || 0) * 100).toFixed(0)}%`} />
            <MetricCard label="Pending settlements" value={financeData.pending_settlements?.length || 0} />
            <MetricCard label="Pending payouts" value={financeData.pending_payouts?.length || 0} />
          </div>
          <section className="merchant-platform-panel">
            <h3>Pending settlements</h3>
            {(financeData.pending_settlements || []).map((row) => (
              <div key={row.id} className="merchant-platform-row">
                <div>
                  <strong>{row.merchant_name}</strong>
                  <div>{row.invoice_reference} · {row.period_start} → {row.period_end}</div>
                  <small>Net {formatMoney(row.net_payout)} · Commission {formatMoney(row.commission_amount)}</small>
                </div>
                <button type="button" onClick={() => handleApproveSettlement(row.id)}>Approve & pay</button>
              </div>
            ))}
          </section>
        </>
      ) : null}

      {tab === "ceo" && ceoData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Total merchants" value={ceoData.total_merchants} />
            <MetricCard label="Approved" value={ceoData.approved_merchants} />
            <MetricCard label="Commission revenue (30d)" value={formatMoney(ceoData.commission_revenue_30d)} />
          </div>
          <section className="merchant-platform-panel">
            <h3>Top restaurants</h3>
            {(ceoData.top_restaurants || []).map((row) => (
              <p key={row.id}>{row.name} — {row.revenue} MRU · {row.orders} orders</p>
            ))}
            <h3>Top pharmacies</h3>
            {(ceoData.top_pharmacies || []).map((row) => (
              <p key={row.id}>{row.name} — {row.revenue} MRU</p>
            ))}
            <h3>Top grocery stores</h3>
            {(ceoData.top_grocery_stores || []).map((row) => (
              <p key={row.id}>{row.name} — {row.revenue} MRU</p>
            ))}
          </section>
        </>
      ) : null}
    </div>
  );
}
