import React from "react";

export default function CourierTopSummary({
  todayEarnings = null,
  rating = "5.0",
  acceptanceRate = 100,
  statusOnline = false,
}) {
  const earned = todayEarnings?.amount ?? "0";
  const deliveries = todayEarnings?.count ?? 0;
  const ratingLabel = Number(rating || 5).toFixed(1);
  const arLabel = `${Math.round(Number(acceptanceRate ?? 100))}%`;

  return (
    <section
      className={`cce-top-summary${statusOnline ? " is-online" : ""}`}
      aria-label="Today's delivery earnings"
    >
      <div className="cce-top-summary__item cce-top-summary__item--accent">
        <span className="cce-top-summary__value">
          {earned}
          <small> MRU</small>
        </span>
        <span className="cce-top-summary__label">Today</span>
      </div>
      <div className="cce-top-summary__item">
        <span className="cce-top-summary__value">{deliveries}</span>
        <span className="cce-top-summary__label">Completed</span>
      </div>
      <div className="cce-top-summary__item cce-top-summary__item--rating">
        <span className="cce-top-summary__value">★ {ratingLabel}</span>
        <span className="cce-top-summary__label">Rating</span>
      </div>
      <div className="cce-top-summary__item cce-top-summary__item--ar">
        <span className="cce-top-summary__value">{arLabel}</span>
        <span className="cce-top-summary__label">Accept</span>
      </div>
    </section>
  );
}
