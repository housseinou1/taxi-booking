import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_URL } from "../apiConfig";
import { useDriverContext } from "./context/DriverContext";

// ─── Yala Branding Colors ───────────────────────────────────────────────────
const COLORS = {
  primaryGreen: "#00A651",
  goldAccent: "#D4AF37",
  darkNavy: "#0B1220",
  white: "#FFFFFF",
  lightGray: "rgba(255, 255, 255, 0.6)",
  cardBg: "rgba(255, 255, 255, 0.06)",
  cardBorder: "rgba(255, 255, 255, 0.1)",
  textMuted: "rgba(255, 255, 255, 0.5)",
  starYellow: "#FBBF24",
};

// ─── Constants ──────────────────────────────────────────────────────────────
const REVIEWS_PER_PAGE = 20;
const COMPLIMENT_CATEGORIES = [
  { key: "professionalism", label: "Professionalism", icon: "👔" },
  { key: "clean_vehicle", label: "Clean Vehicle", icon: "✨" },
  { key: "safe_driving", label: "Safe Driving", icon: "🛡️" },
  { key: "friendliness", label: "Friendliness", icon: "😊" },
  { key: "punctuality", label: "Punctuality", icon: "⏰" },
];

// ─── Rating Stars Component ─────────────────────────────────────────────────
function RatingStars({ rating, size = 20 }) {
  const stars = [];
  const roundedRating = Math.round(rating * 2) / 2; // round to nearest 0.5

  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(roundedRating)) {
      stars.push(
        <span key={i} style={{ fontSize: `${size}px`, color: COLORS.starYellow }}>★</span>
      );
    } else if (i - 0.5 === roundedRating) {
      stars.push(
        <span key={i} style={{ fontSize: `${size}px`, color: COLORS.starYellow, opacity: 0.6 }}>★</span>
      );
    } else {
      stars.push(
        <span key={i} style={{ fontSize: `${size}px`, color: COLORS.textMuted }}>★</span>
      );
    }
  }

  return <div style={styles.starsContainer} aria-label={`${rating} out of 5 stars`}>{stars}</div>;
}

// ─── Line Chart Component (30-day rating history) ───────────────────────────
function RatingHistoryChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div style={styles.emptyChart}>
        <span style={styles.emptyChartIcon}>📊</span>
        <p style={styles.emptyChartText}>No rating history available</p>
      </div>
    );
  }

  const CHART_WIDTH = 100; // percentage
  const CHART_HEIGHT = 120;
  const PADDING_TOP = 10;
  const PADDING_BOTTOM = 10;
  const MIN_RATING = 1;
  const MAX_RATING = 5;

  const usableHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // Calculate SVG points for the line
  const points = data.map((item, index) => {
    const x = data.length === 1
      ? 50
      : (index / (data.length - 1)) * 100;
    const rating = Number(item.rating || item.value || 0);
    const clampedRating = Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
    const y = PADDING_TOP + usableHeight - ((clampedRating - MIN_RATING) / (MAX_RATING - MIN_RATING)) * usableHeight;
    return { x, y, rating: clampedRating, date: item.date || item.created_at || "" };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill path
  const areaPath = points.length > 0
    ? `M ${points[0].x},${CHART_HEIGHT} ` +
      points.map((p) => `L ${p.x},${p.y}`).join(" ") +
      ` L ${points[points.length - 1].x},${CHART_HEIGHT} Z`
    : "";

  return (
    <div style={styles.chartContainer} role="img" aria-label="30-day rating history line chart">
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        style={styles.chartSvg}
      >
        {/* Grid lines */}
        {[1, 2, 3, 4, 5].map((val) => {
          const y = PADDING_TOP + usableHeight - ((val - MIN_RATING) / (MAX_RATING - MIN_RATING)) * usableHeight;
          return (
            <line
              key={val}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="0.3"
            />
          );
        })}

        {/* Area fill */}
        {areaPath && (
          <path
            d={areaPath}
            fill="url(#ratingGradient)"
            opacity="0.3"
          />
        )}

        {/* Line */}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={COLORS.primaryGreen}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.5"
            fill={COLORS.primaryGreen}
            stroke={COLORS.darkNavy}
            strokeWidth="0.5"
          />
        ))}

        {/* Gradient definition */}
        <defs>
          <linearGradient id="ratingGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.primaryGreen} stopOpacity="0.4" />
            <stop offset="100%" stopColor={COLORS.primaryGreen} stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* Y-axis labels */}
      <div style={styles.chartYAxis}>
        <span style={styles.chartYLabel}>5.0</span>
        <span style={styles.chartYLabel}>3.0</span>
        <span style={styles.chartYLabel}>1.0</span>
      </div>

      {/* X-axis label */}
      <div style={styles.chartXAxis}>
        <span style={styles.chartXLabel}>30 days ago</span>
        <span style={styles.chartXLabel}>Today</span>
      </div>
    </div>
  );
}

// ─── Review Card Component ──────────────────────────────────────────────────
function ReviewCard({ review }) {
  const rating = Number(review.rating || 0);
  const text = review.text || review.review_text || review.comment || "";
  const date = review.date || review.ride_date || review.created_at || "";

  const formattedDate = date
    ? new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div style={styles.reviewCard}>
      <div style={styles.reviewHeader}>
        <RatingStars rating={rating} size={14} />
        <span style={styles.reviewDate}>{formattedDate}</span>
      </div>
      {text && (
        <p style={styles.reviewText}>{text.slice(0, 500)}</p>
      )}
      {!text && (
        <p style={styles.reviewNoText}>No written review</p>
      )}
    </div>
  );
}

// ─── Compliment Category Card ───────────────────────────────────────────────
function ComplimentCard({ icon, label, count }) {
  return (
    <div style={styles.complimentCard}>
      <span style={styles.complimentIcon}>{icon}</span>
      <div style={styles.complimentInfo}>
        <span style={styles.complimentLabel}>{label}</span>
        <span style={styles.complimentCount}>{count}</span>
      </div>
    </div>
  );
}

// ─── Main Feedback Center Component ─────────────────────────────────────────
export default function DriverFeedback() {
  const token = localStorage.getItem("access");
  const { state } = useDriverContext();

  const [feedbackData, setFeedbackData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [error, setError] = useState(null);

  const authHeaders = useMemo(
    () => ({ headers: { Authorization: `Bearer ${token}` } }),
    [token]
  );

  // ─── Fetch Feedback Summary (average rating + compliment counts) ────────
  const fetchFeedbackSummary = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/feedback/`,
        authHeaders
      );
      setFeedbackData(response.data);
    } catch (err) {
      console.error("Feedback summary fetch error:", err);
      throw err;
    }
  }, [authHeaders, token]);

  // ─── Fetch Rating History (30-day line chart data) ──────────────────────
  const fetchHistory = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/feedback/history/`,
        authHeaders
      );
      setHistoryData(response.data.data || response.data || []);
    } catch (err) {
      console.error("Rating history fetch error:", err);
      setHistoryData([]);
    }
  }, [authHeaders, token]);

  // ─── Fetch Paginated Reviews ────────────────────────────────────────────
  const fetchReviews = useCallback(async (page = 1) => {
    if (!token) return;
    setReviewsLoading(true);

    try {
      const response = await axios.get(
        `${API_URL}/drivers/me/feedback/reviews/?page=${page}`,
        authHeaders
      );

      const data = response.data;
      const reviewsList = data.results || data.reviews || data || [];
      setReviews(reviewsList);
      setCurrentPage(page);

      // Calculate total pages
      if (data.count !== undefined) {
        setTotalPages(Math.ceil(data.count / REVIEWS_PER_PAGE));
      } else if (data.total_pages !== undefined) {
        setTotalPages(data.total_pages);
      } else if (data.next === null && page === 1) {
        setTotalPages(1);
      }
    } catch (err) {
      console.error("Reviews fetch error:", err);
      setReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }, [authHeaders, token]);

  // ─── Initial Load ───────────────────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        await Promise.all([
          fetchFeedbackSummary(),
          fetchHistory(),
          fetchReviews(1),
        ]);
      } catch (err) {
        setError("Failed to load feedback data. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // ─── Pagination Handlers ────────────────────────────────────────────────
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      fetchReviews(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      fetchReviews(currentPage - 1);
    }
  };

  // ─── Derived Values ─────────────────────────────────────────────────────
  const averageRating = feedbackData?.average_rating ?? null;
  const hasRatings = averageRating !== null && averageRating > 0;
  const formattedRating = hasRatings ? Number(averageRating).toFixed(1) : null;

  const complimentCounts = feedbackData?.compliment_counts || feedbackData?.compliments || {};

  // ─── Loading State ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={styles.loadingText}>Loading feedback...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ────────────────────────────────────────────────────────
  if (error && !feedbackData) {
    return (
      <div style={styles.container}>
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={styles.retryButton}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Feedback Center</h1>
      </div>

      {/* Average Rating Section */}
      <div style={styles.ratingCard}>
        {hasRatings ? (
          <>
            <span style={styles.ratingLabel}>Your Average Rating</span>
            <h2 style={styles.ratingValue}>{formattedRating}</h2>
            <RatingStars rating={Number(formattedRating)} size={24} />
          </>
        ) : (
          <div style={styles.emptyRatingState}>
            <span style={styles.emptyRatingIcon}>⭐</span>
            <p style={styles.emptyRatingText}>No ratings yet</p>
            <p style={styles.emptyRatingSubtext}>
              Complete rides to start receiving ratings from riders
            </p>
          </div>
        )}
      </div>

      {/* 30-Day Rating History */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Rating History (30 Days)</h3>
        <RatingHistoryChart data={historyData} />
      </div>

      {/* Compliment Categories */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Compliments</h3>
        <div style={styles.complimentsGrid}>
          {COMPLIMENT_CATEGORIES.map((category) => (
            <ComplimentCard
              key={category.key}
              icon={category.icon}
              label={category.label}
              count={complimentCounts[category.key] || 0}
            />
          ))}
        </div>
      </div>

      {/* Reviews Section */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Rider Reviews</h3>

        {reviewsLoading ? (
          <div style={styles.reviewsLoadingContainer}>
            <div style={styles.spinnerSmall} />
          </div>
        ) : reviews.length === 0 ? (
          <div style={styles.emptyReviews}>
            <span style={styles.emptyReviewsIcon}>💬</span>
            <p style={styles.emptyReviewsText}>No reviews yet</p>
          </div>
        ) : (
          <>
            <div style={styles.reviewsList}>
              {reviews.map((review, index) => (
                <ReviewCard key={review.id || index} review={review} />
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={styles.pagination}>
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  style={{
                    ...styles.paginationButton,
                    opacity: currentPage <= 1 ? 0.4 : 1,
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  ← Previous
                </button>
                <span style={styles.paginationInfo}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  style={{
                    ...styles.paginationButton,
                    opacity: currentPage >= totalPages ? 0.4 : 1,
                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Back to Dashboard */}
      <button
        type="button"
        onClick={() => { window.location.href = "/driver"; }}
        style={styles.backButton}
      >
        ← Back to Dashboard
      </button>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: COLORS.darkNavy,
    color: COLORS.white,
    padding: "20px",
    fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    maxWidth: "428px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "800",
    margin: 0,
    color: COLORS.white,
  },

  // ─── Rating Card ────────────────────────────────────────────────────────
  ratingCard: {
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "16px",
    textAlign: "center",
  },
  ratingLabel: {
    fontSize: "14px",
    color: COLORS.lightGray,
    display: "block",
    marginBottom: "8px",
  },
  ratingValue: {
    fontSize: "48px",
    fontWeight: "800",
    color: COLORS.goldAccent,
    margin: "0 0 8px 0",
  },
  starsContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "2px",
  },

  // ─── Empty Rating State ─────────────────────────────────────────────────
  emptyRatingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    padding: "16px 0",
  },
  emptyRatingIcon: {
    fontSize: "40px",
  },
  emptyRatingText: {
    fontSize: "18px",
    fontWeight: "600",
    color: COLORS.white,
    margin: 0,
  },
  emptyRatingSubtext: {
    fontSize: "13px",
    color: COLORS.lightGray,
    margin: 0,
    textAlign: "center",
  },

  // ─── Section Card ───────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: COLORS.cardBg,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
  },
  sectionTitle: {
    fontSize: "17px",
    fontWeight: "700",
    marginTop: 0,
    marginBottom: "16px",
    color: COLORS.white,
  },

  // ─── Chart ──────────────────────────────────────────────────────────────
  chartContainer: {
    position: "relative",
    width: "100%",
    paddingLeft: "30px",
  },
  chartSvg: {
    width: "100%",
    height: "120px",
    display: "block",
  },
  chartYAxis: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "120px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    paddingTop: "6px",
    paddingBottom: "6px",
  },
  chartYLabel: {
    fontSize: "9px",
    color: COLORS.textMuted,
  },
  chartXAxis: {
    display: "flex",
    justifyContent: "space-between",
    paddingLeft: "30px",
    marginTop: "6px",
  },
  chartXLabel: {
    fontSize: "9px",
    color: COLORS.textMuted,
  },
  emptyChart: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "120px",
    gap: "8px",
  },
  emptyChartIcon: {
    fontSize: "28px",
    opacity: 0.5,
  },
  emptyChartText: {
    fontSize: "13px",
    color: COLORS.textMuted,
    margin: 0,
  },

  // ─── Compliments ────────────────────────────────────────────────────────
  complimentsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  complimentCard: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: "12px",
    border: `1px solid ${COLORS.cardBorder}`,
  },
  complimentIcon: {
    fontSize: "24px",
    width: "36px",
    textAlign: "center",
  },
  complimentInfo: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
  },
  complimentLabel: {
    fontSize: "14px",
    color: COLORS.white,
    fontWeight: "600",
  },
  complimentCount: {
    fontSize: "16px",
    fontWeight: "700",
    color: COLORS.primaryGreen,
  },

  // ─── Reviews ────────────────────────────────────────────────────────────
  reviewsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  reviewCard: {
    padding: "14px",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: "12px",
    border: `1px solid ${COLORS.cardBorder}`,
  },
  reviewHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "8px",
  },
  reviewDate: {
    fontSize: "12px",
    color: COLORS.textMuted,
  },
  reviewText: {
    fontSize: "13px",
    color: COLORS.lightGray,
    margin: 0,
    lineHeight: "1.5",
    wordBreak: "break-word",
  },
  reviewNoText: {
    fontSize: "13px",
    color: COLORS.textMuted,
    margin: 0,
    fontStyle: "italic",
  },
  reviewsLoadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100px",
  },
  emptyReviews: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100px",
    gap: "8px",
  },
  emptyReviewsIcon: {
    fontSize: "28px",
    opacity: 0.5,
  },
  emptyReviewsText: {
    fontSize: "13px",
    color: COLORS.textMuted,
    margin: 0,
  },

  // ─── Pagination ─────────────────────────────────────────────────────────
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "16px",
    paddingTop: "16px",
    borderTop: `1px solid ${COLORS.cardBorder}`,
  },
  paginationButton: {
    padding: "8px 14px",
    backgroundColor: "transparent",
    color: COLORS.lightGray,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  paginationInfo: {
    fontSize: "12px",
    color: COLORS.textMuted,
  },

  // ─── Loading & Error ────────────────────────────────────────────────────
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "16px",
  },
  loadingText: {
    color: COLORS.lightGray,
    fontSize: "14px",
  },
  spinner: {
    width: "32px",
    height: "32px",
    border: `3px solid ${COLORS.cardBorder}`,
    borderTopColor: COLORS.primaryGreen,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  spinnerSmall: {
    width: "20px",
    height: "20px",
    border: `2px solid ${COLORS.cardBorder}`,
    borderTopColor: COLORS.primaryGreen,
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    gap: "16px",
  },
  errorText: {
    color: "#EF4444",
    fontSize: "14px",
    textAlign: "center",
  },
  retryButton: {
    padding: "10px 24px",
    backgroundColor: COLORS.primaryGreen,
    color: COLORS.white,
    border: "none",
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },

  // ─── Back Button ────────────────────────────────────────────────────────
  backButton: {
    width: "100%",
    padding: "14px",
    backgroundColor: "transparent",
    color: COLORS.lightGray,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: "999px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    textAlign: "center",
    marginTop: "8px",
  },
};
