import React, { useEffect, useState } from "react";

import { fetchAdminPaymentDashboard } from "../payments/paymentApi";
import "../delivery/delivery-uber.css";

export default function AdminPaymentDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAdminPaymentDashboard()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="delivery-uber__toast is-error">{error}</div>;
  if (!data) return <p>Loading payment dashboard...</p>;

  const cards = [
    ["Total revenue (Yala)", `${data.total_revenue} MRU`],
    ["Gross volume", `${data.gross_volume} MRU`],
    ["Pending payouts", data.pending_payouts],
    ["Completed payouts", data.completed_payouts],
    ["Refund requests", data.refund_requests],
    ["Failed payments", data.failed_payments],
    ["Cash orders", data.cash_orders],
    ["Wallet transactions", data.wallet_transactions],
  ];

  return (
    <div style={{ padding: 16 }}>
      <h2>Payment Dashboard</h2>
      <div className="delivery-uber__category-grid delivery-uber__category-grid--home">
        {cards.map(([label, value]) => (
          <article key={label} className="delivery-uber__category-card">
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </div>
  );
}
