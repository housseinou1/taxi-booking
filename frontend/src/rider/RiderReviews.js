import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMoney } from "../marketConfig";
import { getRideHistory } from "./services/apiService";

function RiderReviews() {
  const { t } = useTranslation();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadReviews = async () => {
      try {
        setLoading(true);
        setNotice("");

        const data = await getRideHistory();

        if (mounted) {
          setRides(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (mounted) {
          setNotice(error.message || t("riderReviews.errors.load"));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadReviews();

    return () => {
      mounted = false;
    };
  }, [t]);

  const completedRides = useMemo(
    () => rides.filter((ride) => ride.status === "completed"),
    [rides]
  );
  const ratedRides = completedRides.filter((ride) => Number(ride.rating || 0) > 0);
  const unratedRides = completedRides.filter((ride) => !Number(ride.rating || 0));
  const averageRating = ratedRides.length
    ? (
        ratedRides.reduce((sum, ride) => sum + Number(ride.rating || 0), 0) /
        ratedRides.length
      ).toFixed(1)
    : t("riderReviews.new");

  return (
    <main className="reviews-page">
      <RiderReviewsStyles />

      <header className="reviews-topbar">
        <button type="button" onClick={() => (window.location.href = "/rider-dashboard")}>
          {t("riderReviews.back")}
        </button>
        <strong>{t("riderReviews.topbar")}</strong>
        <button type="button" onClick={() => (window.location.href = "/history")}>
          {t("riderReviews.trips")}
        </button>
      </header>

      <section className="reviews-hero">
        <span>{t("riderReviews.eyebrow")}</span>
        <h1>{t("riderReviews.title")}</h1>
        <p>{t("riderReviews.subtitle")}</p>
      </section>

      <section className="reviews-scoreboard">
        <div className="reviews-score-main">
          <span>{t("riderReviews.averageRating")}</span>
          <strong>{averageRating}</strong>
          <small>{t("riderReviews.ratedTrips", { count: ratedRides.length })}</small>
        </div>
        <div>
          <span>{t("riderReviews.completed")}</span>
          <strong>{completedRides.length}</strong>
        </div>
        <div>
          <span>{t("riderReviews.needRating")}</span>
          <strong>{unratedRides.length}</strong>
        </div>
      </section>

      {notice && <div className="reviews-notice">{notice}</div>}

      <section className="reviews-grid">
        <div className="reviews-panel">
          <div className="reviews-panel-head">
            <span>{t("riderReviews.recentReviews")}</span>
            <strong>{ratedRides.length}</strong>
          </div>
          {loading ? (
            <div className="reviews-empty">{t("riderReviews.loadingReviews")}</div>
          ) : ratedRides.length === 0 ? (
            <div className="reviews-empty">{t("riderReviews.noRatedTrips")}</div>
          ) : (
            ratedRides.slice(0, 8).map((ride) => <ReviewCard key={ride.id} ride={ride} />)
          )}
        </div>

        <div className="reviews-panel">
          <div className="reviews-panel-head">
            <span>{t("riderReviews.needsYourRating")}</span>
            <strong>{unratedRides.length}</strong>
          </div>
          {loading ? (
            <div className="reviews-empty">{t("riderReviews.checkingTrips")}</div>
          ) : unratedRides.length === 0 ? (
            <div className="reviews-empty">{t("riderReviews.allRated")}</div>
          ) : (
            unratedRides.slice(0, 6).map((ride) => (
              <article key={ride.id} className="unrated-card">
                <div>
                  <strong>{t("riderReviews.rideNumber", { id: ride.id })}</strong>
                  <span>{t("riderReviews.route", { pickup: ride.pickup || t("riderReviews.pickup"), destination: ride.destination || t("riderReviews.destination") })}</span>
                  <small>{formatMoney(ride.fare || 0)}</small>
                </div>
                <button type="button" onClick={() => (window.location.href = "/rider-payments")}>
                  {t("riderReviews.rate")}
                </button>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function ReviewCard({ ride }) {
  const { t } = useTranslation();
  const driver =
    ride.driver_name ||
    [ride.driver_first_name, ride.driver_last_name].filter(Boolean).join(" ") ||
    t("riderReviews.yalaDriver");
  const date = formatReviewDate(ride.completed_at || ride.payment_date || ride.created_at, t("riderReviews.recent"));

  return (
    <article className="review-card">
      <div className="review-card-head">
        <div>
          <strong>{driver}</strong>
          <span>{t("riderReviews.rideDate", { id: ride.id, date })}</span>
        </div>
        <b>{Number(ride.rating || 0).toFixed(0)}/5</b>
      </div>
      <div className="review-stars" aria-label={t("riderReviews.starRating", { rating: ride.rating })}>
        {"★".repeat(Number(ride.rating || 0))}
        {"☆".repeat(Math.max(0, 5 - Number(ride.rating || 0)))}
      </div>
      <p>{ride.review || t("riderReviews.noWrittenReview")}</p>
      <small>{t("riderReviews.route", { pickup: ride.pickup || t("riderReviews.pickup"), destination: ride.destination || t("riderReviews.destination") })} · {formatMoney(ride.fare || 0)}</small>
    </article>
  );
}

function formatReviewDate(value, fallback) {
  if (!value) return fallback;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch (error) {
    return fallback;
  }
}

function RiderReviewsStyles() {
  return (
    <style>{`
      .reviews-page {
        min-height: 100vh;
        padding: 14px;
        box-sizing: border-box;
        background:
          radial-gradient(circle at 90% 0%, rgba(243, 189, 52, 0.28), transparent 30%),
          linear-gradient(180deg, #08111f 0%, #101827 38%, #f7f8fb 38%, #edf2f7 100%);
        color: #0f172a;
      }

      .reviews-topbar,
      .reviews-hero,
      .reviews-scoreboard,
      .reviews-grid,
      .reviews-notice {
        max-width: 980px;
        margin-left: auto;
        margin-right: auto;
      }

      .reviews-topbar {
        display: grid;
        grid-template-columns: 72px 1fr 72px;
        gap: 10px;
        align-items: center;
        color: #fff;
        margin-bottom: 16px;
      }

      .reviews-topbar strong {
        text-align: center;
        font-size: 18px;
      }

      .reviews-topbar button,
      .unrated-card button {
        min-height: 40px;
        border: 0;
        border-radius: 999px;
        font-weight: 900;
        cursor: pointer;
      }

      .reviews-topbar button {
        background: rgba(255,255,255,0.1);
        color: #fff;
      }

      .reviews-hero {
        color: #fff;
        padding: 20px 0 22px;
      }

      .reviews-hero span,
      .reviews-scoreboard span,
      .reviews-panel-head span {
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
        color: rgba(255,255,255,0.66);
      }

      .reviews-hero h1 {
        margin: 8px 0;
        font-size: clamp(30px, 8vw, 48px);
        line-height: 1;
        letter-spacing: 0;
      }

      .reviews-hero p {
        max-width: 560px;
        margin: 0;
        color: rgba(255,255,255,0.72);
        font-weight: 650;
        line-height: 1.5;
      }

      .reviews-scoreboard {
        display: grid;
        grid-template-columns: 1.4fr repeat(2, minmax(0, 0.8fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .reviews-scoreboard > div,
      .reviews-panel,
      .reviews-notice {
        border: 1px solid rgba(15,23,42,0.08);
        border-radius: 8px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 18px 40px rgba(15,23,42,0.08);
      }

      .reviews-scoreboard > div {
        padding: 16px;
      }

      .reviews-scoreboard span,
      .reviews-panel-head span {
        color: #64748b;
      }

      .reviews-scoreboard strong {
        display: block;
        margin-top: 5px;
        font-size: 26px;
      }

      .reviews-score-main strong {
        font-size: 44px;
        color: #00a651;
      }

      .reviews-score-main small {
        color: #64748b;
        font-weight: 800;
      }

      .reviews-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(280px, 0.8fr);
        gap: 12px;
      }

      .reviews-panel {
        padding: 14px;
        display: grid;
        gap: 10px;
        align-content: start;
      }

      .reviews-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .reviews-panel-head strong {
        border-radius: 999px;
        padding: 7px 10px;
        background: #dcfce7;
        color: #166534;
      }

      .review-card,
      .unrated-card {
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px;
        background: #fff;
      }

      .review-card-head,
      .unrated-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .review-card-head span,
      .review-card small,
      .unrated-card span,
      .unrated-card small {
        display: block;
        color: #64748b;
        font-weight: 750;
      }

      .review-card-head b {
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        padding: 8px 10px;
      }

      .review-stars {
        margin-top: 10px;
        color: #f3bd34;
        font-size: 22px;
        letter-spacing: 0;
      }

      .review-card p {
        margin: 8px 0;
        color: #334155;
        line-height: 1.45;
      }

      .unrated-card button {
        padding: 0 14px;
        background: #00a651;
        color: #fff;
      }

      .reviews-empty,
      .reviews-notice {
        padding: 22px;
        text-align: center;
        color: #475569;
        font-weight: 850;
      }

      .reviews-notice {
        margin-bottom: 12px;
        color: #991b1b;
      }

      @media (max-width: 760px) {
        .reviews-scoreboard,
        .reviews-grid {
          grid-template-columns: 1fr;
        }

        .review-card-head,
        .unrated-card {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `}</style>
  );
}

export default RiderReviews;
