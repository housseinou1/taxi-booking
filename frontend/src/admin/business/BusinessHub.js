import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  exportComplianceReport,
  exportFinanceCenter,
  fetchBusinessHub,
  updateCrmProfile,
} from "./businessApi";
import "../launch/LaunchHub.css";
import "./BusinessHub.css";

const TABS = [
  { id: "finance", label: "Finance" },
  { id: "crm", label: "CRM" },
  { id: "marketing", label: "Marketing" },
  { id: "incentives", label: "Incentives" },
  { id: "partners", label: "Partners" },
  { id: "corporate", label: "Corporate" },
  { id: "compliance", label: "Compliance" },
  { id: "bi", label: "BI" },
];

function MetricCard({ label, value }) {
  return (
    <div className="launch__card">
      <div className="launch__card-label">{label}</div>
      <div className="launch__card-value">{value}</div>
    </div>
  );
}

function downloadBlob(response, filename) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default function BusinessHub() {
  const [tab, setTab] = useState("finance");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [crmSearch, setCrmSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const response = await fetchBusinessHub();
      setData(response.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load business hub");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const handleExportFinance = async (format) => {
    const response = await exportFinanceCenter(format);
    downloadBlob(response, `finance-center.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`);
  };

  const handleExportCompliance = async (format) => {
    const response = await exportComplianceReport(format);
    downloadBlob(response, `compliance-report.${format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv"}`);
  };

  const handleToggleVip = async (profile) => {
    await updateCrmProfile(profile.id, { is_vip: !profile.is_vip, vip_tier: profile.is_vip ? "" : "gold" });
    await load();
  };

  if (loading && !data) {
    return <div className="launch"><p className="launch__subtitle">Loading business operations…</p></div>;
  }

  const finance = data?.finance || {};
  const crm = data?.crm || {};
  const marketing = data?.marketing || {};
  const incentives = data?.incentives || {};
  const partners = data?.partners || {};
  const corporate = data?.corporate || {};
  const compliance = data?.compliance || {};
  const bi = data?.bi || {};

  const filteredProfiles = (crm.profiles || []).filter(
    (p) => !crmSearch || p.email?.includes(crmSearch) || p.name?.toLowerCase().includes(crmSearch.toLowerCase())
  );

  return (
    <div className="launch biz">
      <header className="launch__header">
        <div>
          <h1 className="launch__title">Business Operations</h1>
          <p className="launch__subtitle">Finance · CRM · Marketing · Partners · Corporate · Compliance · BI</p>
        </div>
        <button type="button" className="launch__btn" onClick={() => { window.location.href = "/admin"; }}>
          ← Admin
        </button>
      </header>

      {error && <div className="launch__error">{error}</div>}

      <nav className="launch__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`launch__tab ${tab === t.id ? "launch__tab--active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "finance" && (
        <section>
          <div className="biz__actions">
            <button type="button" className="launch__btn" onClick={() => handleExportFinance("csv")}>Export CSV</button>
            <button type="button" className="launch__btn" onClick={() => handleExportFinance("xlsx")}>Export Excel</button>
            <button type="button" className="launch__btn" onClick={() => handleExportFinance("pdf")}>Export PDF</button>
          </div>
          <div className="launch__grid">
            <MetricCard label="Daily Revenue" value={formatMoney(finance.daily_revenue)} />
            <MetricCard label="Outstanding Withdrawals" value={formatMoney(finance.outstanding_withdrawals?.amount)} />
            <MetricCard label="Pending Refunds" value={formatMoney(finance.pending_refunds?.amount)} />
            <MetricCard label="Wallet Balance" value={formatMoney(finance.cash_flow?.wallet_balance)} />
            <MetricCard label="Commission" value={formatMoney(finance.commission)} />
            <MetricCard label="Tax Estimate (18%)" value={formatMoney(finance.taxes_estimate)} />
            <MetricCard label="Monthly Net P/L" value={formatMoney(finance.monthly_profit_loss?.net_profit)} />
            <MetricCard label="Cash In Today" value={formatMoney(finance.cash_flow?.cash_in_today)} />
          </div>
        </section>
      )}

      {tab === "crm" && (
        <section>
          <div className="biz__toolbar">
            <input
              className="biz__search"
              placeholder="Search customers, drivers, couriers…"
              value={crmSearch}
              onChange={(e) => setCrmSearch(e.target.value)}
            />
          </div>
          <div className="launch__grid">
            <MetricCard label="Customers" value={crm.summary?.total_customers ?? 0} />
            <MetricCard label="Drivers" value={crm.summary?.total_drivers ?? 0} />
            <MetricCard label="Couriers" value={crm.summary?.total_couriers ?? 0} />
            <MetricCard label="VIP" value={crm.summary?.vip_count ?? 0} />
            <MetricCard label="Blacklisted" value={crm.summary?.blacklisted_count ?? 0} />
            <MetricCard label="Open Tickets" value={crm.summary?.open_support_tickets ?? 0} />
          </div>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Rating</th>
                  <th>VIP</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name || "—"}</td>
                    <td>{p.email}</td>
                    <td>{p.profile_type}</td>
                    <td>{p.rating ?? "—"}</td>
                    <td>{p.is_vip ? `⭐ ${p.vip_tier || "VIP"}` : "—"}</td>
                    <td>{p.is_blacklisted ? "Blacklisted" : p.is_active ? "Active" : "Blocked"}</td>
                    <td>
                      <button type="button" className="launch__btn launch__btn--sm" onClick={() => handleToggleVip(p)}>
                        {p.is_vip ? "Remove VIP" : "Mark VIP"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "marketing" && (
        <section>
          <div className="launch__grid">
            <MetricCard label="Promo Codes" value={marketing.promo_codes?.total ?? 0} />
            <MetricCard label="Active Promos" value={marketing.promo_codes?.active ?? 0} />
            <MetricCard label="Promo Usages" value={marketing.promo_codes?.total_usages ?? 0} />
            <MetricCard label="Rider Referrals" value={marketing.referrals?.rider_codes ?? 0} />
            <MetricCard label="Driver Referrals" value={marketing.referrals?.driver_referrals ?? 0} />
            <MetricCard label="Flagged Referrals" value={marketing.referrals?.flagged_pending ?? 0} />
          </div>
          <h3 className="biz__section-title">Campaigns</h3>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead>
                <tr><th>Name</th><th>Channel</th><th>Audience</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(marketing.campaigns || []).map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td>{c.channel}</td><td>{c.audience}</td><td>{c.status}</td></tr>
                ))}
                {!marketing.campaigns?.length && <tr><td colSpan={4}>No campaigns yet</td></tr>}
              </tbody>
            </table>
          </div>
          <h3 className="biz__section-title">Promo Codes</h3>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead>
                <tr><th>Code</th><th>Type</th><th>Value</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(marketing.recent_promos || []).map((p) => (
                  <tr key={p.id}><td>{p.code}</td><td>{p.discount_type}</td><td>{p.discount_value}</td><td>{p.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "incentives" && (
        <section>
          <div className="launch__grid">
            <MetricCard label="Active Programs" value={incentives.summary?.active_programs ?? 0} />
            <MetricCard label="In Progress" value={incentives.summary?.participants ?? 0} />
            <MetricCard label="Completed (Month)" value={incentives.summary?.completed_this_month ?? 0} />
            <MetricCard label="Bonuses Paid (Month)" value={formatMoney(incentives.summary?.bonuses_paid_month)} />
          </div>
          <h3 className="biz__section-title">Leaderboard</h3>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead><tr><th>Driver</th><th>Total Bonus</th><th>Completions</th></tr></thead>
              <tbody>
                {(incentives.leaderboard || []).map((row) => (
                  <tr key={row.driver_id}><td>{row.name}</td><td>{formatMoney(row.total_bonus)}</td><td>{row.completions}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "partners" && (
        <section>
          <div className="launch__grid">
            <MetricCard label="Total Partners" value={partners.summary?.total_partners ?? 0} />
            <MetricCard label="Approved" value={partners.summary?.approved ?? 0} />
            <MetricCard label="Pending" value={partners.summary?.pending ?? 0} />
          </div>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead><tr><th>Business</th><th>Type</th><th>Status</th><th>Orders</th><th>Revenue</th><th>Pending Payouts</th></tr></thead>
              <tbody>
                {(partners.partners || []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td><td>{p.type}</td><td>{p.status}</td>
                    <td>{p.total_orders}</td><td>{formatMoney(p.revenue)}</td><td>{formatMoney(p.payouts_pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "corporate" && (
        <section>
          <div className="launch__grid">
            <MetricCard label="Ride Corporate" value={corporate.summary?.ride_corporate_accounts ?? 0} />
            <MetricCard label="Delivery Business" value={corporate.summary?.delivery_business_accounts ?? 0} />
            <MetricCard label="Employees" value={corporate.summary?.total_employees ?? 0} />
            <MetricCard label="Pending Invoices" value={corporate.summary?.pending_invoices ?? 0} />
          </div>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead><tr><th>Company</th><th>Type</th><th>Billing</th><th>Balance</th><th>Employees</th><th>Active</th></tr></thead>
              <tbody>
                {(corporate.accounts || []).map((a) => (
                  <tr key={`${a.account_type}-${a.id}`}>
                    <td>{a.company_name}</td><td>{a.account_type}</td><td>{a.billing_type}</td>
                    <td>{formatMoney(a.balance)}</td><td>{a.employees}</td><td>{a.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "compliance" && (
        <section>
          <div className="biz__actions">
            <button type="button" className="launch__btn" onClick={() => handleExportCompliance("csv")}>Export CSV</button>
            <button type="button" className="launch__btn" onClick={() => handleExportCompliance("xlsx")}>Export Excel</button>
            <button type="button" className="launch__btn" onClick={() => handleExportCompliance("pdf")}>Export PDF</button>
          </div>
          <div className="launch__grid">
            <MetricCard label="Expired Docs" value={compliance.summary?.expired_documents ?? 0} />
            <MetricCard label="Expiring (30d)" value={compliance.summary?.expiring_within_30d ?? 0} />
            <MetricCard label="Insurance Expired" value={compliance.summary?.insurance_expired ?? 0} />
            <MetricCard label="License Expired" value={compliance.summary?.license_expired ?? 0} />
            <MetricCard label="Maintenance Due" value={compliance.summary?.maintenance_due ?? 0} />
          </div>
        </section>
      )}

      {tab === "bi" && (
        <section>
          <div className="launch__grid">
            <MetricCard label="Revenue (7d)" value={formatMoney(bi.growth_trends?.revenue_this_week)} />
            <MetricCard label="Growth %" value={bi.growth_trends?.growth_percent != null ? `${bi.growth_trends.growth_percent}%` : "—"} />
            <MetricCard label="Open Tickets" value={bi.ceo_report?.support?.open_tickets ?? 0} />
            <MetricCard label="Security Alerts" value={bi.ceo_report?.security_alerts ?? 0} />
          </div>
          <h3 className="biz__section-title">City Comparison (7d)</h3>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead><tr><th>City</th><th>Revenue</th></tr></thead>
              <tbody>
                {(bi.city_comparison || []).map((c) => (
                  <tr key={c.city_id}><td>{c.city_name}</td><td>{formatMoney(c.revenue_7d)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="biz__section-title">Driver Productivity (7d)</h3>
          <div className="launch__table-wrap">
            <table className="launch__table">
              <thead><tr><th>Driver ID</th><th>Trips</th><th>Earnings</th></tr></thead>
              <tbody>
                {(bi.driver_productivity || []).slice(0, 10).map((d) => (
                  <tr key={d.driver_id}><td>{d.driver_id}</td><td>{d.trips}</td><td>{formatMoney(d.earnings)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
