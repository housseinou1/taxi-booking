import React, { useRef, useState } from "react";

function StarRow({ label, value, onChange }) {
  return (
    <div className="delivery-track__rating-row">
      <span>{label}</span>
      <div className="delivery-track__stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={star <= value ? "is-on" : ""}
            onClick={() => onChange(star)}
            aria-label={`${star} stars for ${label}`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DeliveryRatingScreen({
  delivery,
  onSubmit,
  onReportIssue,
  busy = false,
}) {
  const [courierRating, setCourierRating] = useState(5);
  const [merchantRating, setMerchantRating] = useState(5);
  const [experienceRating, setExperienceRating] = useState(5);
  const [review, setReview] = useState("");
  const [complaintPhoto, setComplaintPhoto] = useState(null);
  const fileRef = useRef(null);

  const hasMerchant = Boolean(delivery.merchant_order?.id || delivery.merchant_name);

  return (
    <div className="delivery-track__rating">
      <div className="delivery-track__rating-hero">
        <h2>Rate your delivery</h2>
        <p>Your feedback helps us improve Yala Delivery.</p>
      </div>

      <section className="delivery-track__rating-card">
        <StarRow label="Courier" value={courierRating} onChange={setCourierRating} />
        {hasMerchant ? (
          <StarRow label="Merchant / store" value={merchantRating} onChange={setMerchantRating} />
        ) : null}
        <StarRow label="Delivery experience" value={experienceRating} onChange={setExperienceRating} />
      </section>

      <section className="delivery-track__rating-card">
        <label className="delivery-track__field">
          <span>Write a review (optional)</span>
          <textarea
            rows={3}
            value={review}
            onChange={(event) => setReview(event.target.value)}
            placeholder="Tell us how the delivery went..."
          />
        </label>
      </section>

      <section className="delivery-track__rating-card">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => setComplaintPhoto(event.target.files?.[0] || null)}
        />
        <button type="button" className="delivery-track__secondary-btn" onClick={() => fileRef.current?.click()}>
          {complaintPhoto ? `Photo: ${complaintPhoto.name}` : "Upload complaint photo"}
        </button>
        <button type="button" className="delivery-track__link-btn" onClick={onReportIssue}>
          Report an issue
        </button>
      </section>

      <button
        type="button"
        className="delivery-track__primary-btn"
        disabled={busy}
        onClick={() =>
          onSubmit({
            courierRating,
            merchantRating: hasMerchant ? merchantRating : null,
            experienceRating,
            review,
            complaintPhoto,
          })
        }
      >
        {busy ? "Submitting..." : "Submit rating"}
      </button>
    </div>
  );
}
