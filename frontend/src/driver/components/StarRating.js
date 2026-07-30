import React from "react";
import "./StarRating.css";

/**
 * StarRating - read-only, accessible star display.
 *
 * @param {number} rating - 0-5 rating value
 * @param {"small"|"medium"|"large"} [size="medium"] - visual size
 */
export default function StarRating({ rating, size = "medium" }) {
  const clamped = Math.min(5, Math.max(0, Number(rating) || 0));
  const rounded = Math.round(clamped * 2) / 2;
  const stars = [];

  for (let i = 1; i <= 5; i++) {
    let fill = "empty";
    if (i <= Math.floor(rounded)) {
      fill = "full";
    } else if (i - 0.5 === rounded) {
      fill = "half";
    }

    stars.push(
      <span
        key={i}
        className={`star star--${fill} star--${size}`}
        aria-hidden="true"
      >
        ★
      </span>
    );
  }

  return (
    <span
      className="star-rating"
      aria-label={`${clamped.toFixed(1)} out of 5 stars`}
      role="img"
    >
      {stars}
    </span>
  );
}
