import React, { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../marketConfig";
import { getPaymentMethodLabel } from "../rider/utils/paymentMethods";
import { fetchMyPayments } from "./paymentApi";
import {
  TRANSACTION_FILTERS,
  filterTransactionsByDate,
  groupPaymentsByStatus,
} from "./transactionFilters";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
];

export default function RiderPaymentHistory({ compact = false }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("month");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchMyPayments()
      .then((data) => {
        if (!active) return;
        setPayments(Array.isArray(data) ? data : []);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Could not load payment history.");
        setPayments([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => groupPaymentsByStatus(payments), [payments]);

  const filteredPayments = useMemo(() => {
    const byDate = filterTransactionsByDate(payments, dateFilter, "created_at", customRange);
    if (statusFilter === "all") return byDate;
    return grouped[statusFilter]?.filter((item) => byDate.some((entry) => entry.id === item.id)) || [];
  }, [payments, dateFilter, statusFilter, grouped, customRange]);

  if (loading) {
    return <p role="status">Loading payment history...</p>;
  }

  return (
    <section className="rider-payment-history" aria-label="Payment history">
      {!compact && <h2>Payment history</h2>}
      {error ? <p className="rider-payment-history__error" role="alert">{error}</p> : null}

      <div className="rider-payment-history__filters" role="group" aria-label="Filter payments">
        <label>
          <span className="sr-only">Date range</span>
          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            {TRANSACTION_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>{filter.label}</option>
            ))}
          </select>
        </label>
        {dateFilter === "custom" ? (
          <>
            <label>
              <span className="sr-only">From date</span>
              <input
                type="date"
                value={customRange.from}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, from: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="sr-only">To date</span>
              <input
                type="date"
                value={customRange.to}
                onChange={(event) =>
                  setCustomRange((current) => ({ ...current, to: event.target.value }))
                }
              />
            </label>
          </>
        ) : null}
        <label>
          <span className="sr-only">Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>{filter.label}</option>
            ))}
          </select>
        </label>
      </div>

      {filteredPayments.length === 0 ? (
        <p>No payments match your filters.</p>
      ) : (
        <ul className="rider-payment-history__list">
          {filteredPayments.map((payment) => (
            <li key={payment.id} className="rider-payment-history__item">
              <div>
                <strong>Ride #{payment.ride_id}</strong>
                <span>{getPaymentMethodLabel(payment.method)}</span>
              </div>
              <div>
                <strong>{formatMoney(Number(payment.amount || 0))}</strong>
                <span className={`rider-payment-history__status is-${payment.status}`}>
                  {payment.status}
                </span>
              </div>
              <small>{new Date(payment.created_at).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
