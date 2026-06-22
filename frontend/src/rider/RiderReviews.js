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
    [rides],
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
    <div className="rider-secondary-page reviews-page">
      <p className="rider-secondary-lead">{t("riderReviews.subtitle")}</p>

      <section className="rider-secondary-stats reviews-scoreboard">
        <div className="rider-secondary-stat-card reviews-score-main">
          <span>{t("riderReviews.averageRating")}</span>
          <strong>{averageRating}</strong>
          <small>{t("riderReviews.ratedTrips", { count: ratedRides.length })}</small>
        </div>
        <div className="rider-secondary-stat-card">
          <span>{t("riderReviews.completed")}</span>
          <strong>{completedRides.length}</strong>
        </div>
        <div className="rider-secondary-stat-card">
          <span>{t("riderReviews.needRating")}</span>
          <strong>{unratedRides.length}</strong>
        </div>
      </section>

      {notice && <div className="rider-secondary-alert">{notice}</div>}

      <section className="reviews-grid">
        <div className="rider-secondary-panel">
          <div className="rider-secondary-panel-head">
            <span>{t("riderReviews.recentReviews")}</span>
            <strong>{ratedRides.length}</strong>
          </div>
          {loading ? (
            <div className="rider-secondary-empty">{t("riderReviews.loadingReviews")}</div>
          ) : ratedRides.length === 0 ? (
            <div className="rider-secondary-empty">{t("riderReviews.noRatedTrips")}</div>
          ) : (
            ratedRides.slice(0, 8).map((ride) => <ReviewCard key={ride.id} ride={ride} />)
          )}
        </div>

        <div className="rider-secondary-panel">
          <div className="rider-secondary-panel-head">
            <span>{t("riderReviews.needsYourRating")}</span>
            <strong>{unratedRides.length}</strong>
          </div>
          {loading ? (
            <div className="rider-secondary-empty">{t("riderReviews.checkingTrips")}</div>
          ) : unratedRides.length === 0 ? (
            <div className="rider-secondary-empty">{t("riderReviews.allRated")}</div>
          ) : (
            unratedRides.slice(0, 6).map((ride) => (
              <article key={ride.id} className="rider-secondary-row unrated-card">
                <div className="rider-secondary-row-body">
                  <strong>{t("riderReviews.rideNumber", { id: ride.id })}</strong>
                  <span>
                    {t("riderReviews.route", {
                      pickup: ride.pickup || t("riderReviews.pickup"),
                      destination: ride.destination || t("riderReviews.destination"),
                    })}
                  </span>
                  <small>{formatMoney(ride.fare || 0)}</small>
                </div>
                <button
                  type="button"
                  className="rider-secondary-primary-btn"
                  onClick={() => (window.location.href = "/rider-payments")}
                >
                  {t("riderReviews.rate")}
                </button>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
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
      <small>
        {t("riderReviews.route", {
          pickup: ride.pickup || t("riderReviews.pickup"),
          destination: ride.destination || t("riderReviews.destination"),
        })}{" "}
        · {formatMoney(ride.fare || 0)}
      </small>
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

export default RiderReviews;
