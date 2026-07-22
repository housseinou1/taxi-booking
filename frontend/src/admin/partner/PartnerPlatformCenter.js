import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  approvePartnerSettlement,
  assignPartnerTerritory,
  fetchPartnerCeoDashboard,
  fetchPartnerDetail,
  fetchPartnerFinanceDashboard,
  fetchPartnerPlatformDashboard,
  generatePartnerSettlement,
  partnerPlatformAction,
  registerPartner,
} from "./partnerPlatformApi";
import "../beta/BetaDashboard.css";
import "./PartnerPlatformCenter.css";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "partners", label: "Partner Management" },
  { id: "territories", label: "Territories" },
  { id: "finance", label: "Finance & Settlements" },
  { id: "performance", label: "Performance" },
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

const EMPTY_FORM = {
  partner_name: "",
  company: "",
  contact_person: "",
  phone: "",
  email: "",
  city_id: "",
  territory_label: "",
  revenue_share: "0.70",
};

export default function PartnerPlatformCenter() {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState(null);
  const [ceoData, setCeoData] = useState(null);
  const [financeData, setFinanceData] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [registerForm, setRegisterForm] = useState(EMPTY_FORM);
  const [territoryForm, setTerritoryForm] = useState({ partner_id: "", city_id: "", zone_name: "Primary", allow_overlap: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const dashboard = await fetchPartnerPlatformDashboard();
      setData(dashboard);
      if (tab === "ceo") setCeoData(await fetchPartnerCeoDashboard());
      if (tab === "finance") setFinanceData(await fetchPartnerFinanceDashboard());
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load partner platform");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = data?.summary || {};
  const partners = data?.partners || [];

  const handleAction = async (partnerId, action) => {
    await partnerPlatformAction(partnerId, { action });
    await load();
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    try {
      await registerPartner({
        ...registerForm,
        city_id: registerForm.city_id ? Number(registerForm.city_id) : null,
        revenue_share: Number(registerForm.revenue_share),
      });
      setRegisterForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Registration failed");
    }
  };

  const handleTerritory = async (event) => {
    event.preventDefault();
    if (!territoryForm.partner_id || !territoryForm.city_id) return;
    try {
      await assignPartnerTerritory(Number(territoryForm.partner_id), {
        city_id: Number(territoryForm.city_id),
        zone_name: territoryForm.zone_name,
        allow_overlap: territoryForm.allow_overlap,
      });
      setTerritoryForm({ partner_id: "", city_id: "", zone_name: "Primary", allow_overlap: false });
      await load();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Territory assignment failed");
    }
  };

  const handleSettlement = async (partnerId, periodType) => {
    await generatePartnerSettlement(partnerId, periodType);
    setFinanceData(await fetchPartnerFinanceDashboard());
    await load();
  };

  const handleApproveSettlement = async (settlementId) => {
    await approvePartnerSettlement(settlementId);
    setFinanceData(await fetchPartnerFinanceDashboard());
    await load();
  };

  const loadPartnerDetail = async (partnerId) => {
    setSelectedPartner(await fetchPartnerDetail(partnerId));
  };

  return (
    <div className="beta">
      <header className="beta__header">
        <div>
          <p className="beta__eyebrow">Phase 32 · Production</p>
          <h1>Partner & Franchise Platform</h1>
          <p className="beta__subtitle">
            Register local operators, assign territories, track performance, and manage revenue-share settlements.
          </p>
        </div>
      </header>

      {error ? <p className="beta__error">{error}</p> : null}
      {loading && !data ? <p>Loading partner platform…</p> : null}

      <div className="partner-platform-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`partner-platform-tab ${tab === item.id ? "partner-platform-tab--active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "partners") && summary ? (
        <div className="beta__grid">
          <MetricCard label="Total partners" value={summary.total_partners} />
          <MetricCard label="Approved" value={summary.approved} />
          <MetricCard label="Pending" value={summary.pending} />
          <MetricCard label="Suspended" value={summary.suspended} />
          <MetricCard label="Active territories" value={summary.active_territories} />
          <MetricCard label="Pending settlements" value={summary.pending_settlements} />
        </div>
      ) : null}

      {tab === "partners" ? (
        <>
          <section className="partner-platform-panel">
            <h3>Register partner</h3>
            <form className="partner-platform-form" onSubmit={handleRegister}>
              <label>Partner name<input required value={registerForm.partner_name} onChange={(e) => setRegisterForm({ ...registerForm, partner_name: e.target.value })} /></label>
              <label>Company<input value={registerForm.company} onChange={(e) => setRegisterForm({ ...registerForm, company: e.target.value })} /></label>
              <label>Contact person<input required value={registerForm.contact_person} onChange={(e) => setRegisterForm({ ...registerForm, contact_person: e.target.value })} /></label>
              <label>Phone<input required value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} /></label>
              <label>Email<input required type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} /></label>
              <label>City ID<input value={registerForm.city_id} onChange={(e) => setRegisterForm({ ...registerForm, city_id: e.target.value })} /></label>
              <label>Territory<input value={registerForm.territory_label} onChange={(e) => setRegisterForm({ ...registerForm, territory_label: e.target.value })} /></label>
              <label>Revenue share (0–1)<input type="number" step="0.01" min="0" max="1" value={registerForm.revenue_share} onChange={(e) => setRegisterForm({ ...registerForm, revenue_share: e.target.value })} /></label>
              <button type="submit" className="delivery-uber__primary-btn">Register partner</button>
            </form>
          </section>
          <section className="partner-platform-panel">
            <h3>Partner roster</h3>
            {partners.map((partner) => (
              <div key={partner.id} className="partner-platform-row">
                <div>
                  <strong>{partner.partner_name}</strong>
                  <div>{partner.company || "—"} · {partner.contract_status} · {partner.city_name || "No city"}</div>
                  <small>Share {(partner.revenue_share * 100).toFixed(0)}% · {partner.territory_count} territories</small>
                </div>
                <div className="partner-platform-actions">
                  {partner.contract_status === "pending" ? (
                    <button type="button" onClick={() => handleAction(partner.id, "approve")}>Approve</button>
                  ) : null}
                  {partner.contract_status === "approved" ? (
                    <button type="button" onClick={() => handleAction(partner.id, "suspend")}>Suspend</button>
                  ) : null}
                  {partner.contract_status === "suspended" ? (
                    <button type="button" onClick={() => handleAction(partner.id, "reactivate")}>Reactivate</button>
                  ) : null}
                  {partner.contract_status !== "terminated" ? (
                    <button type="button" onClick={() => handleAction(partner.id, "terminate")}>Terminate</button>
                  ) : null}
                  <button type="button" onClick={() => loadPartnerDetail(partner.id)}>Dashboard</button>
                  <button type="button" onClick={() => handleSettlement(partner.id, "weekly")}>Weekly stmt</button>
                  <button type="button" onClick={() => handleSettlement(partner.id, "monthly")}>Monthly stmt</button>
                </div>
              </div>
            ))}
          </section>
        </>
      ) : null}

      {tab === "territories" ? (
        <section className="partner-platform-panel">
          <h3>Assign territory</h3>
          <form className="partner-platform-form" onSubmit={handleTerritory}>
            <label>Partner ID<input required value={territoryForm.partner_id} onChange={(e) => setTerritoryForm({ ...territoryForm, partner_id: e.target.value })} /></label>
            <label>City ID<input required value={territoryForm.city_id} onChange={(e) => setTerritoryForm({ ...territoryForm, city_id: e.target.value })} /></label>
            <label>Zone name<input value={territoryForm.zone_name} onChange={(e) => setTerritoryForm({ ...territoryForm, zone_name: e.target.value })} /></label>
            <label>
              <input type="checkbox" checked={territoryForm.allow_overlap} onChange={(e) => setTerritoryForm({ ...territoryForm, allow_overlap: e.target.checked })} />
              Allow overlap with other partners
            </label>
            <button type="submit" className="delivery-uber__primary-btn">Assign territory</button>
          </form>
        </section>
      ) : null}

      {tab === "finance" && financeData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Pending settlements" value={financeData.pending_settlements?.length || 0} />
            <MetricCard label="Paid (recent)" value={financeData.settlement_history?.length || 0} />
          </div>
          <section className="partner-platform-panel">
            <h3>Pending settlements</h3>
            {(financeData.pending_settlements || []).map((row) => (
              <div key={row.id} className="partner-platform-row">
                <div>
                  <strong>{row.partner_name}</strong>
                  <div>{row.invoice_reference} · {row.period_type} · {row.period_start} → {row.period_end}</div>
                  <small>Net {formatMoney(row.partner_payout)} · Platform {formatMoney(row.platform_commission)}</small>
                </div>
                <button type="button" onClick={() => handleApproveSettlement(row.id)}>Approve & pay</button>
              </div>
            ))}
          </section>
          <section className="partner-platform-panel">
            <h3>Settlement history</h3>
            {(financeData.settlement_history || []).map((row) => (
              <p key={row.id}>{row.partner_name} — {formatMoney(row.partner_payout)} ({row.status})</p>
            ))}
          </section>
        </>
      ) : null}

      {tab === "performance" && selectedPartner ? (
        <section className="partner-platform-panel">
          <h3>{selectedPartner.partner?.partner_name} — Performance</h3>
          <div className="beta__grid">
            <MetricCard label="Ride completion" value={selectedPartner.performance?.ride_completion_rate != null ? `${selectedPartner.performance.ride_completion_rate}%` : "—"} />
            <MetricCard label="Delivery completion" value={selectedPartner.performance?.delivery_completion_rate != null ? `${selectedPartner.performance.delivery_completion_rate}%` : "—"} />
            <MetricCard label="Acceptance rate" value={selectedPartner.performance?.acceptance_rate != null ? `${selectedPartner.performance.acceptance_rate}%` : "—"} />
            <MetricCard label="Customer rating" value={selectedPartner.performance?.customer_rating ?? "—"} />
            <MetricCard label="Support response (hrs)" value={selectedPartner.performance?.support_response_hours ?? "—"} />
          </div>
        </section>
      ) : null}

      {tab === "performance" && !selectedPartner ? (
        <section className="partner-platform-panel">
          <p>Select a partner from Partner Management and click Dashboard to view KPIs.</p>
        </section>
      ) : null}

      {tab === "ceo" && ceoData ? (
        <>
          <div className="beta__grid">
            <MetricCard label="Total partners" value={ceoData.total_partners} />
            <MetricCard label="Approved" value={ceoData.approved_partners} />
          </div>
          <section className="partner-platform-panel">
            <h3>Revenue by partner (30d)</h3>
            {(ceoData.revenue_by_partner || []).map((row) => (
              <p key={row.partner_id}>{row.name} — {formatMoney(row.revenue)} · commission {formatMoney(row.commission)}</p>
            ))}
            <h3>Revenue by city</h3>
            {(ceoData.revenue_by_city || []).map((row) => (
              <p key={row.city}>{row.city} — {formatMoney(row.revenue)} · {row.partner_count} partners</p>
            ))}
            <h3>Fastest-growing territories</h3>
            {(ceoData.fastest_growing_territories || []).map((row) => (
              <p key={row.territory}>{row.territory} ({row.partner}) — {row.growth_pct != null ? `${row.growth_pct}%` : "—"}</p>
            ))}
            <h3>Underperforming territories</h3>
            {(ceoData.underperforming_territories || []).map((row) => (
              <p key={row.territory}>{row.territory} — {row.growth_pct}%</p>
            ))}
            <h3>Expansion opportunities</h3>
            {(ceoData.expansion_opportunities || []).map((row) => (
              <p key={row.city}>{row.city} — {row.note}</p>
            ))}
          </section>
        </>
      ) : null}

      {selectedPartner && tab !== "performance" ? (
        <section className="partner-platform-panel">
          <h3>{selectedPartner.partner?.partner_name} snapshot</h3>
          <div className="beta__grid">
            <MetricCard label="Active drivers" value={selectedPartner.metrics?.active_drivers} />
            <MetricCard label="Active couriers" value={selectedPartner.metrics?.active_couriers} />
            <MetricCard label="Active merchants" value={selectedPartner.metrics?.active_merchants} />
            <MetricCard label="Daily revenue" value={formatMoney(selectedPartner.metrics?.daily_revenue)} />
            <MetricCard label="Weekly revenue" value={formatMoney(selectedPartner.metrics?.weekly_revenue)} />
            <MetricCard label="Commission earned" value={formatMoney(selectedPartner.metrics?.commission_earned)} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
