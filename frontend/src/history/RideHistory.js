import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_URL } from "../apiConfig";
import { formatMoney } from "../marketConfig";

const statusKeys = {
  requested: "requested",
  driver_arriving: "driverArriving",
  driver_arrived: "driverArrived",
  in_progress: "inProgress",
  completed: "completed",
  cancelled: "cancelled",
};

function RideHistory() {
  const { t } = useTranslation();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;

    const fetchRideHistory = async () => {
      try {
        setLoading(true);
        setNotice("");

        const response = await fetch(`${API_URL}/rides/history/`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access")}`,
          },
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || data.error || t("riderHistory.errors.load"));
        }

        if (mounted) {
          setRides(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error.message || t("riderHistory.errors.load"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchRideHistory();

    return () => {
      mounted = false;
    };
  }, [t]);

  const filteredRides = useMemo(() => {
    if (filter === "all") return rides;
    return rides.filter((ride) => ride.status === filter);
  }, [filter, rides]);

  const completed = rides.filter((ride) => ride.status === "completed");
  const totalSpent = completed.reduce((sum, ride) => sum + Number(ride.fare || 0), 0);
  const averageRating = (() => {
    const ratings = completed.map((ride) => Number(ride.rating || 0)).filter(Boolean);
    if (!ratings.length) return t("riderHistory.new");
    return (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(1);
  })();

  return (
    <main className="yala-history-page">
      <RideHistoryStyles />

      <header className="history-topbar">
        <button type="button" onClick={() => (window.location.href = "/rider-dashboard")}>
          {t("riderHistory.back")}
        </button>
        <strong>{t("riderHistory.topbar")}</strong>
        <button type="button" onClick={() => (window.location.href = "/rider-payments")}>
          {t("riderHistory.pay")}
        </button>
      </header>

      <section className="history-hero">
        <span>{t("riderHistory.eyebrow")}</span>
        <h1>{t("riderHistory.title")}</h1>
        <p>{t("riderHistory.subtitle")}</p>
      </section>

      <section className="history-stats" aria-label={t("riderHistory.summary")}>
        <div>
          <span>{t("riderHistory.totalRides")}</span>
          <strong>{rides.length}</strong>
        </div>
        <div>
          <span>{t("riderHistory.spent")}</span>
          <strong>{formatMoney(totalSpent)}</strong>
        </div>
        <div>
          <span>{t("riderHistory.rating")}</span>
          <strong>{averageRating}</strong>
        </div>
      </section>

      <nav className="history-filters" aria-label={t("riderHistory.filterTrips")}>
        {[
          ["all", t("riderHistory.filters.all")],
          ["completed", t("riderHistory.filters.completed")],
          ["in_progress", t("riderHistory.filters.active")],
          ["cancelled", t("riderHistory.filters.cancelled")],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice && <div className="history-notice">{notice}</div>}

      <section className="history-list">
        {loading ? (
          <div className="history-empty">{t("riderHistory.loading")}</div>
        ) : filteredRides.length === 0 ? (
          <div className="history-empty">{t("riderHistory.empty")}</div>
        ) : (
          filteredRides.map((ride) => <RideHistoryCard key={ride.id} ride={ride} />)
        )}
      </section>
    </main>
  );
}

function RideHistoryCard({ ride }) {
  const { t } = useTranslation();
  const statusKey = statusKeys[ride.status];
  const status = statusKey ? t(`riderHistory.status.${statusKey}`) : String(ride.status || t("riderHistory.ride"));
  const pickup = ride.pickup || ride.pickup_address || t("riderHistory.pickup");
  const destination = ride.destination || ride.destination_address || t("riderHistory.destination");
  const driver =
    ride.driver_name ||
    [ride.driver_first_name, ride.driver_last_name].filter(Boolean).join(" ") ||
    t("riderHistory.driverPending");
  const vehicle = [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(" ") || ride.vehicle || t("riderHistory.vehiclePending");
  const plate = ride.vehicle_plate || ride.plate_number || ride.plate || t("riderHistory.na");
  const date = formatRideDate(ride.completed_at || ride.created_at || ride.payment_date, t("riderHistory.recent"));

  return (
    <article className="history-card">
      <div className="history-card-head">
        <div>
          <span>{date}</span>
          <h2>{t("riderHistory.rideNumber", { id: ride.id })}</h2>
        </div>
        <b className={`status-${ride.status || "default"}`}>{status}</b>
      </div>

      <div className="history-route">
        <span />
        <div>
          <strong>{pickup}</strong>
          <small>{t("riderHistory.pickup")}</small>
        </div>
        <span />
        <div>
          <strong>{destination}</strong>
          <small>{t("riderHistory.destination")}</small>
        </div>
      </div>

      <div className="history-meta">
        <div>
          <span>{t("riderHistory.fare")}</span>
          <strong>{formatMoney(ride.fare || 0)}</strong>
        </div>
        <div>
          <span>{t("riderHistory.payment")}</span>
          <strong>{ride.payment_status || t("riderHistory.pending")}</strong>
        </div>
        <div>
          <span>{t("riderHistory.rating")}</span>
          <strong>{ride.rating ? `${ride.rating}/5` : t("riderHistory.notRated")}</strong>
        </div>
      </div>

      <div className="history-driver">
        <div>
          <strong>{driver}</strong>
          <span>{t("riderHistory.vehiclePlate", { vehicle, plate })}</span>
        </div>
        {ride.status === "completed" && (
          <button type="button" onClick={() => (window.location.href = "/rider-payments")}>
            {t("riderHistory.receipt")}
          </button>
        )}
      </div>
    </article>
  );
}

function formatRideDate(value, fallback) {
  if (!value) return fallback;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch (error) {
    return fallback;
  }
}

function RideHistoryStyles() {
  return (
    <style>{`
      .yala-history-page {
        min-height: 100vh;
        background:
          radial-gradient(circle at 12% 0%, rgba(0, 166, 81, 0.28), transparent 28%),
          linear-gradient(180deg, #08111f 0%, #0b1220 42%, #f7f8fb 42%, #eef2f7 100%);
        color: #0f172a;
        padding: 14px;
        box-sizing: border-box;
      }

      .history-topbar {
        max-width: 920px;
        margin: 0 auto 16px;
        display: grid;
        grid-template-columns: 72px 1fr 72px;
        align-items: center;
        gap: 10px;
        color: #fff;
      }

      .history-topbar strong {
        text-align: center;
        font-size: 18px;
      }

      .history-topbar button,
      .history-filters button,
      .history-driver button {
        border: 0;
        border-radius: 999px;
        min-height: 40px;
        font-weight: 900;
        cursor: pointer;
      }

      .history-topbar button {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }

      .history-hero,
      .history-stats,
      .history-filters,
      .history-list,
      .history-notice {
        max-width: 920px;
        margin-left: auto;
        margin-right: auto;
      }

      .history-hero {
        color: #fff;
        padding: 20px 2px 22px;
      }

      .history-hero span,
      .history-card-head span,
      .history-meta span {
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        color: rgba(255,255,255,0.66);
      }

      .history-hero h1 {
        margin: 8px 0 8px;
        font-size: clamp(30px, 8vw, 48px);
        line-height: 1;
        letter-spacing: 0;
      }

      .history-hero p {
        margin: 0;
        max-width: 560px;
        color: rgba(255,255,255,0.72);
        line-height: 1.5;
        font-weight: 650;
      }

      .history-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .history-stats div,
      .history-card,
      .history-empty,
      .history-notice {
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 8px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
      }

      .history-stats div {
        padding: 14px;
      }

      .history-stats span {
        display: block;
        color: #64748b;
        font-weight: 800;
        font-size: 12px;
      }

      .history-stats strong {
        display: block;
        margin-top: 4px;
        font-size: 20px;
      }

      .history-filters {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }

      .history-filters button {
        background: #fff;
        color: #0f172a;
        border: 1px solid #dbe3ef;
      }

      .history-filters button.active {
        background: #00a651;
        color: #fff;
        border-color: #00a651;
      }

      .history-list {
        display: grid;
        gap: 12px;
      }

      .history-card {
        padding: 14px;
      }

      .history-card-head,
      .history-driver {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
      }

      .history-card-head h2 {
        margin: 3px 0 0;
        font-size: 20px;
      }

      .history-card-head b {
        border-radius: 999px;
        padding: 8px 10px;
        background: #e2e8f0;
        color: #0f172a;
        white-space: nowrap;
        font-size: 12px;
      }

      .history-card-head .status-completed {
        background: #dcfce7;
        color: #166534;
      }

      .history-card-head .status-cancelled {
        background: #fee2e2;
        color: #991b1b;
      }

      .history-card-head .status-in_progress,
      .history-card-head .status-driver_arriving,
      .history-card-head .status-driver_arrived {
        background: #fef3c7;
        color: #92400e;
      }

      .history-route {
        display: grid;
        grid-template-columns: 14px 1fr;
        gap: 8px 10px;
        margin: 16px 0;
      }

      .history-route > span {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #00a651;
        margin-top: 5px;
      }

      .history-route > span:nth-of-type(2) {
        border-radius: 3px;
        background: #f3bd34;
      }

      .history-route strong,
      .history-driver strong {
        display: block;
      }

      .history-route small,
      .history-driver span {
        color: #64748b;
        font-weight: 700;
      }

      .history-meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-bottom: 12px;
      }

      .history-meta div {
        border-radius: 8px;
        padding: 10px;
        background: #f8fafc;
      }

      .history-meta span {
        color: #64748b;
      }

      .history-meta strong {
        display: block;
        margin-top: 3px;
        font-size: 14px;
      }

      .history-driver {
        border-top: 1px solid #e5e7eb;
        padding-top: 12px;
      }

      .history-driver button {
        padding: 0 14px;
        background: #08111f;
        color: #fff;
      }

      .history-empty,
      .history-notice {
        padding: 22px;
        text-align: center;
        font-weight: 850;
        color: #475569;
      }

      .history-notice {
        margin-bottom: 12px;
        color: #991b1b;
      }

      @media (max-width: 640px) {
        .yala-history-page {
          padding: 10px;
        }

        .history-stats,
        .history-meta {
          grid-template-columns: 1fr;
        }

        .history-filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .history-card-head,
        .history-driver {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `}</style>
  );
}

export default RideHistory;
