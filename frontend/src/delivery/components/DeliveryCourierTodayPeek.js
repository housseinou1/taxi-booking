import React from "react";

export default function DeliveryCourierTodayPeek({
  todayEarnings,
  onlineTimeLabel,
  statusOnline,
  sheetState,
  onExpand,
}) {
  const handleActivate = () => {
    if (sheetState === "collapsed") {
      onExpand?.("half");
    }
  };

  return (
    <section
      className={`cce-today-peek ${sheetState === "collapsed" ? "is-collapsed" : ""}`}
      aria-label="Today's summary"
    >
      <button
        type="button"
        className="cce-today-peek__header"
        onClick={handleActivate}
        aria-expanded={sheetState !== "collapsed"}
      >
        <div className="cce-today-peek__header-left">
          <span className="cce-today-peek__chevron" aria-hidden>
            {sheetState === "collapsed" ? "▴" : "▾"}
          </span>
          <span>Today</span>
          <span className={`cce-today-peek__status ${statusOnline ? "is-online" : ""}`}>
            {statusOnline ? "Online" : "Offline"}
          </span>
        </div>
        <div className="cce-today-peek__header-right">
          <span className="cce-today-peek__rating">★ 5.0</span>
          <span className="cce-today-peek__ar">AR 100%</span>
        </div>
      </button>

      <div className="cce-today-peek__stats">
        <div className="cce-today-peek__stat">
          <span className="cce-today-peek__stat-value">{todayEarnings?.count || 0}</span>
          <span className="cce-today-peek__stat-label">Deliveries</span>
        </div>
        <div className="cce-today-peek__stat">
          <span className="cce-today-peek__stat-value">
            {todayEarnings?.amount || "0"}
            <span className="cce-currency"> MRU</span>
          </span>
          <span className="cce-today-peek__stat-label">Earned</span>
        </div>
        <div className="cce-today-peek__stat">
          <span className="cce-today-peek__stat-value">{onlineTimeLabel || "0h 0m"}</span>
          <span className="cce-today-peek__stat-label">Online</span>
        </div>
      </div>

      {sheetState === "collapsed" ? (
        <p className="cce-today-peek__hint">Swipe up for requests and activity</p>
      ) : null}
    </section>
  );
}
