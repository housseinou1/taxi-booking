import React, { useState } from "react";
import { API_URL } from "../apiConfig";

function RateRide({ ride, onRated }) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);

  const submitRating = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/rides/rate/${ride.id}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("access")}`,
        },
        body: JSON.stringify({
          rating: rating,
          review: review,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Could not submit rating");
        return;
      }

      alert("Rating submitted ✅");

      if (onRated) {
        onRated();
      }
    } catch (error) {
      console.error(error);
      alert("Server error submitting rating");
    } finally {
      setLoading(false);
    }
  };

  if (ride.rating) {
    return (
      <div style={ratedBoxStyle}>
        <h3>⭐ Your Rating</h3>
        <p>{"⭐".repeat(Number(ride.rating))}</p>
        {ride.review && <p>{ride.review}</p>}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h3>⭐ Rate Your Driver</h3>

      <select
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        style={inputStyle}
      >
        <option value={5}>5 Stars</option>
        <option value={4}>4 Stars</option>
        <option value={3}>3 Stars</option>
        <option value={2}>2 Stars</option>
        <option value={1}>1 Star</option>
      </select>

      <textarea
        placeholder="Write your review..."
        value={review}
        onChange={(e) => setReview(e.target.value)}
        style={textareaStyle}
      />

      <button
        onClick={submitRating}
        disabled={loading}
        style={buttonStyle}
      >
        {loading ? "Submitting..." : "Submit Rating"}
      </button>
    </div>
  );
}

const cardStyle = {
  background: "#fff7ed",
  padding: "18px",
  borderRadius: "14px",
  marginTop: "15px",
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  marginBottom: "12px",
};

const textareaStyle = {
  width: "100%",
  minHeight: "90px",
  padding: "12px",
  borderRadius: "10px",
  border: "1px solid #ddd",
  marginBottom: "12px",
};

const buttonStyle = {
  display: "block",
  width: "100%",
  background: "#f59e0b",
  color: "white",
  border: "none",
  padding: "14px",
  borderRadius: "10px",
  fontWeight: "bold",
  cursor: "pointer",
};

const ratedBoxStyle = {
  background: "#ecfdf5",
  color: "#064e3b",
  padding: "14px",
  borderRadius: "12px",
  marginTop: "15px",
};

export default RateRide;
