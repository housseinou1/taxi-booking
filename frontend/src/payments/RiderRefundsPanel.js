import React, { useEffect, useMemo, useState } from "react";
import { formatMoney } from "../marketConfig";
import { fetchRefundRequests } from "./paymentApi";

const REFUND_STEPS = [
  { key: "requested", label: "Requested" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
];

function getRefundStepIndex(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "completed" || normalized === "paid" || normalized === "refunded") return 2;
  if (normalized === "approved") return 1;
  if (normalized === "rejected") return -1;
  return 0;
}

function RefundTimeline({ status }) {
  const activeIndex = getRefundStepIndex(status);
  const rejected = String(status || "").toLowerCase() === "rejected";

  if (rejected) {
    return (
      <ol className="rider-refunds__timeline" aria-label="Refund status">
        <li className="is-rejected">Refund rejected</li>
      </ol>
    );
  }

  return (
    <ol className="rider-refunds__timeline" aria-label="Refund status">
      {REFUND_STEPS.map((step, index) => (
        <li key={step.key} className={index <= activeIndex ? "is-complete" : ""}>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export default function RiderRefundsPanel() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchRefundRequests()
      .then((data) => {
        if (!active) return;
        setRefunds(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || "Could not load refunds.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pendingRefunds = useMemo(
    () => refunds.filter((item) => !["completed", "rejected", "paid", "refunded"].includes(String(item.status).toLowerCase())),
    [refunds]
  );

  if (loading) {
    return <p role="status">Loading refunds...</p>;
  }

  return (
    <section className="rider-refunds" aria-label="Refund requests">
      <h2>Refunds</h2>
      {error ? <p role="alert">{error}</p> : null}
      {pendingRefunds.length > 0 && (
        <p className="rider-refunds__pending">{pendingRefunds.length} refund request(s) in progress</p>
      )}

      {refunds.length === 0 ? (
        <p>No refund requests yet.</p>
      ) : (
        <ul className="rider-refunds__list">
          {refunds.map((refund) => (
            <li key={refund.id} className="rider-refunds__item">
              <div className="rider-refunds__header">
                <strong>{formatMoney(Number(refund.amount || 0))}</strong>
                <span>{refund.status}</span>
              </div>
              <p>{refund.reason || "Refund request"}</p>
              {refund.note ? <small>{refund.note}</small> : null}
              <RefundTimeline status={refund.status} />
              <small>{new Date(refund.created_at).toLocaleString()}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
