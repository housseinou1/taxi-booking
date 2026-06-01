import React, { useState, useCallback } from "react";
import axios from "axios";
import { API_URL } from "../../apiConfig";
import { formatMoney } from "../../marketConfig";

const MAX_REVIEW_LENGTH = 500;

export default function ShareRideComplete({ rideId, fare, savings }) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const charsRemaining = MAX_REVIEW_LENGTH - review.length;

  const handleSubmit = useCallback(async () => {
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("access");
      await axios.post(
        `${API_URL}/api/rides/share/${rideId}/rate/`,
        {
          rating,
          review: review.trim() || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSubmitted(true);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Failed to submit rating. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [rideId, rating, review]);

  const handleReviewChange = (e) => {
    const value = e.target.value;
    if (value.length <= MAX_REVIEW_LENGTH) {
      setReview(value);
    }
  };

  if (submitted) {
    return (
      <div style={styles.container}>
        <div style={styles.content}>
          <div style={styles.thankYouIcon}>🎉</div>
          <h2 style={styles.thankYouTitle}>Thank you!</h2>
          <p style={styles.thankYouText}>
            Your feedback helps improve Yala Share for everyone.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.checkIcon}>✓</div>
        <h1 style={styles.title}>Ride Complete!</h1>
      </div>

      {/* Savings summary */}
      {savings > 0 && (
        <div style={styles.savingsCard}>
          <p style={styles.savingsLabel}>You saved</p>
          <p style={styles.savingsAmount}>{formatMoney(savings)}</p>
          <p style={styles.savingsSubtext}>by choosing Yala Share</p>
        </div>
      )}

      {/* Fare paid */}
      <div style={styles.fareCard}>
        <div style={styles.fareRow}>
          <span style={styles.fareLabel}>Fare paid</span>
          <span style={styles.fareValue}>{formatMoney(fare)}</span>
        </div>
      </div>

      {/* Rating */}
      <div style={styles.ratingSection}>
        <p style={styles.ratingPrompt}>How was your ride?</p>
        <div style={styles.starsContainer} role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              style={{
                ...styles.starButton,
                color:
                  star <= (hoverRating || rating)
                    ? "#D4AF37"
                    : "rgba(255,255,255,0.2)",
                transform:
                  star <= (hoverRating || rating) ? "scale(1.1)" : "scale(1)",
              }}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
              aria-pressed={star === rating}
              role="radio"
            >
              ★
            </button>
          ))}
        </div>
      </div>

      {/* Review textarea */}
      <div style={styles.reviewSection}>
        <textarea
          value={review}
          onChange={handleReviewChange}
          placeholder="Share your experience (optional)..."
          style={styles.textarea}
          maxLength={MAX_REVIEW_LENGTH}
          aria-label="Review text"
          rows={4}
        />
        <div style={styles.charCounter}>
          <span
            style={{
              color:
                charsRemaining < 50
                  ? "#EF4444"
                  : "rgba(255,255,255,0.4)",
            }}
          >
            {charsRemaining} characters remaining
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={loading || rating === 0}
        style={{
          ...styles.submitButton,
          opacity: loading || rating === 0 ? 0.5 : 1,
        }}
        aria-label="Submit rating"
      >
        {loading ? "Submitting..." : "Submit Rating"}
      </button>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#0B1220",
    color: "#FFFFFF",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: "24px 20px",
    maxWidth: "428px",
    margin: "0 auto",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    textAlign: "center",
  },
  header: {
    textAlign: "center",
    marginBottom: "28px",
  },
  checkIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    backgroundColor: "rgba(0,166,81,0.15)",
    color: "#00A651",
    fontSize: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  title: {
    fontSize: "26px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  savingsCard: {
    backgroundColor: "rgba(212,175,55,0.08)",
    border: "1px solid rgba(212,175,55,0.3)",
    borderRadius: "20px",
    padding: "20px",
    textAlign: "center",
    marginBottom: "16px",
  },
  savingsLabel: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.6)",
    marginBottom: "4px",
  },
  savingsAmount: {
    fontSize: "32px",
    fontWeight: 700,
    color: "#D4AF37",
    marginBottom: "4px",
  },
  savingsSubtext: {
    fontSize: "13px",
    color: "#D4AF37",
  },
  fareCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "20px",
    padding: "16px 20px",
    marginBottom: "24px",
  },
  fareRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fareLabel: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
  },
  fareValue: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#FFFFFF",
  },
  ratingSection: {
    textAlign: "center",
    marginBottom: "24px",
  },
  ratingPrompt: {
    fontSize: "16px",
    fontWeight: 500,
    color: "#FFFFFF",
    marginBottom: "16px",
  },
  starsContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "8px",
  },
  starButton: {
    background: "none",
    border: "none",
    fontSize: "40px",
    cursor: "pointer",
    padding: "4px",
    transition: "all 300ms ease",
  },
  reviewSection: {
    marginBottom: "16px",
  },
  textarea: {
    width: "100%",
    padding: "16px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#FFFFFF",
    fontSize: "14px",
    resize: "none",
    outline: "none",
    boxSizing: "border-box",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    transition: "border-color 300ms ease",
  },
  charCounter: {
    textAlign: "right",
    marginTop: "6px",
    fontSize: "12px",
  },
  errorBanner: {
    backgroundColor: "rgba(239,68,68,0.15)",
    border: "1px solid #EF4444",
    borderRadius: "12px",
    padding: "12px 16px",
    color: "#EF4444",
    fontSize: "14px",
    marginBottom: "16px",
    textAlign: "center",
  },
  submitButton: {
    width: "100%",
    padding: "18px",
    borderRadius: "16px",
    border: "none",
    backgroundColor: "#00A651",
    color: "#FFFFFF",
    fontSize: "17px",
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 300ms ease",
  },
  thankYouIcon: {
    fontSize: "64px",
    marginBottom: "20px",
  },
  thankYouTitle: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#00A651",
    marginBottom: "8px",
  },
  thankYouText: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.6)",
  },
};
