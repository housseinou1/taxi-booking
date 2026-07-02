import React, { useMemo } from "react";

import CourierSubpageShell from "./CourierSubpageShell";
import DeliveryPayoutPanel from "./DeliveryPayoutPanel";
import "./delivery-courier-flow.css";

export default function DeliveryCourierBankPage() {
  const token = localStorage.getItem("access");
  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  return (
    <CourierSubpageShell title="Wallet" activeNav="wallet">
      <div className="delivery-uber-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Wallet & payouts</h2>
        <p style={{ margin: 0, color: "#6b7280" }}>
          View your balance and withdraw delivery earnings to your bank.
        </p>
      </div>
      <div className="delivery-uber-payout-panel">
        <DeliveryPayoutPanel authHeaders={authHeaders} />
      </div>
    </CourierSubpageShell>
  );
}
