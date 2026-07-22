import React, { useCallback, useEffect, useState } from "react";

import { formatMoney } from "../../marketConfig";
import {
  corporateAccountAction,
  exportCorporateInvoice,
  fetchCorporateDashboard,
  fetchCorporateDetail,
  generateCorporateInvoice,
  fetchCorporateInvoices,
  updateCorporateInvoice,
} from "./businessApi";
import "../beta/BetaDashboard.css";

function MetricCard({ label, value, sub }) {
  return (
    <div className="beta__card">
      <div className="beta__card-label">{label}</div>
      <div className="beta__card-value">{value ?? "—"}</div>
      {sub ? <div className="beta__card-sub">{sub}</div> : null}
    </div>
  );
}

export default function BusinessAccountsCenter() {
  const [data, setData] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const [dash, inv] = await Promise.all([fetchCorporateDashboard(), fetchCorporateInvoices()]);
      setData(dash.data);
      setInvoices(inv.data || []);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load business accounts");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAccount = async (account) => {
    setSelected(account);
    const response = await fetchCorporateDetail(account.account_type, account.id);
    setDetail(response.data);
  };

  const runAction = async (action) => {
    if (!selected) return;
    await corporateAccountAction(selected.account_type, selected.id, { action });
    setNotice(`Account ${action}d`);
    await load();
    await openAccount(selected);
  };

  const createInvoice = async () => {
    if (!selected) return;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const end = today.toISOString().slice(0, 10);
    await generateCorporateInvoice({
      account_type: selected.account_type,
      account_id: selected.id,
      period_start: start,
      period_end: end,
      invoice_frequency: "monthly",
    });
    setNotice("Invoice generated");
    await load();
    await openAccount(selected);
  };

  const markInvoicePaid = async (invoiceId) => {
    await updateCorporateInvoice(invoiceId, { status: "paid" });
    setNotice("Invoice marked paid");
    await load();
  };

  const downloadInvoice = async (invoiceId, format) => {
    const response = await exportCorporateInvoice(invoiceId, format);
    const blob = new Blob([response.data]);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `invoice-${invoiceId}.${format === "pdf" ? "pdf" : "csv"}`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const summary = data?.summary || {};
  const ceo = data?.ceo || {};
  const accounts = data?.accounts || [];

  return (
    <div className="beta">
      <a href="/admin" className="beta__back">
        ← Admin
      </a>
      <div className="beta__header">
        <div>
          <h1 className="beta__title">Yala Business Accounts</h1>
          <p className="beta__subtitle">Corporate companies, employees, billing, and CEO metrics</p>
        </div>
        <button type="button" className="beta__btn" onClick={load}>
          Refresh
        </button>
      </div>

      {error ? <div className="beta__error">{error}</div> : null}
      {notice ? <div className="beta__panel">{notice}</div> : null}

      <section className="beta__section">
        <h2 className="beta__section-title">CEO Dashboard</h2>
        <div className="beta__grid beta__grid--wide">
          <MetricCard label="Corporate revenue (MTD)" value={formatMoney(ceo.corporate_revenue_mtd)} />
          <MetricCard label="Monthly recurring revenue" value={formatMoney(ceo.monthly_recurring_revenue)} />
          <MetricCard label="Outstanding invoices" value={formatMoney(ceo.outstanding_invoices)} />
          <MetricCard label="Approved companies" value={ceo.approved_companies} />
          <MetricCard label="Pending approval" value={ceo.pending_companies} />
        </div>
      </section>

      <section className="beta__section">
        <h2 className="beta__section-title">Companies</h2>
        <div className="beta__panel">
          <table className="beta__table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Employees</th>
                <th>Balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={`${account.account_type}-${account.id}`}>
                  <td>{account.company_name}</td>
                  <td>{account.status || (account.is_active ? "approved" : "suspended")}</td>
                  <td>{account.billing_type}</td>
                  <td>{account.employees}</td>
                  <td>{formatMoney(account.balance)}</td>
                  <td>
                    <button type="button" className="beta__btn" onClick={() => openAccount(account)}>
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected && detail ? (
        <section className="beta__section">
          <h2 className="beta__section-title">{selected.company_name}</h2>
          <div className="beta__actions" style={{ marginBottom: 12 }}>
            <button type="button" className="beta__btn beta__btn--primary" onClick={() => runAction("approve")}>
              Approve
            </button>
            <button type="button" className="beta__btn" onClick={() => runAction("suspend")}>
              Suspend
            </button>
            <button type="button" className="beta__btn" onClick={createInvoice}>
              Generate invoice
            </button>
          </div>
          <div className="beta__panel">
            <h4>Employees</h4>
            <table className="beta__table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Cost center</th>
                  <th>Monthly limit</th>
                  <th>Spent</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {(detail.employees || []).map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.user_id}</td>
                    <td>{employee.role || "employee"}</td>
                    <td>{employee.cost_center || "—"}</td>
                    <td>{employee.monthly_limit}</td>
                    <td>{employee.monthly_spent}</td>
                    <td>{employee.is_active ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="beta__section">
        <h2 className="beta__section-title">Invoices</h2>
        <div className="beta__panel">
          <table className="beta__table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Company</th>
                <th>Period</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>{invoice.company_name}</td>
                  <td>
                    {invoice.period_start} → {invoice.period_end}
                  </td>
                  <td>{formatMoney(invoice.subtotal)}</td>
                  <td>{formatMoney(invoice.tax_amount)}</td>
                  <td>{formatMoney(invoice.amount)}</td>
                  <td>{invoice.status}</td>
                  <td>
                    <button type="button" className="beta__btn" onClick={() => markInvoicePaid(invoice.id)}>
                      Mark paid
                    </button>
                    <button type="button" className="beta__btn" onClick={() => downloadInvoice(invoice.id, "csv")}>
                      CSV
                    </button>
                    <button type="button" className="beta__btn" onClick={() => downloadInvoice(invoice.id, "pdf")}>
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
