import React, { useEffect, useState } from "react";
import { API_URL } from "../../apiConfig";
import authenticatedApi from "../../auth/authenticatedApi";
import { formatMoney } from "../../marketConfig";
import PaymentMethodSelector from "../../payments/components/PaymentMethodSelector";
import {
  RIDE_PAYMENT_METHODS,
  selectionFromMethod,
  toRidePaymentMethod,
} from "../../payments/paymentMethods";
import { submitRidePayment } from "../../payments/ridePaymentService";
import { readStoredPaymentMethod, storePaymentMethod } from "../utils/paymentMethods";
import "./PostRidePayRate.css";


const COMPLIMENT_OPTIONS = [
  "Great conversation",
  "Expert navigation",
  "Clean car",
  "Safe driving",
  "Friendly driver",
];

const TIP_OPTIONS = [0, 10, 15, 20];

function getDriverName(ride) {
  return (
    ride?.driver_name ||
    [ride?.driver_first_name, ride?.driver_last_name].filter(Boolean).join(" ").trim() ||
    "your driver"
  );
}

function getDriverPhoto(ride) {
  return (
    ride?.driver_photo_url ||
    ride?.driver_picture ||
    ride?.driver_photo ||
    ride?.driver?.profile_picture ||
    ""
  );
}

export default function PostRidePayRate({ ride, onDone }) {
  const [payment, setPayment] = useState(null);
  const [tipPercentage, setTipPercentage] = useState(15);
  // The checkout holds the full payment selection (category + provider) so an
  // incomplete Mobile Money choice is representable and blocks submission.
  // `selectedMethod` is derived in the legacy spelling the ride Payment.method
  // column declares (masrvi / seddad), defaulting to card like the other surfaces.
  const [paymentSelection, setPaymentSelection] = useState(() => {
    const stored = selectionFromMethod(readStoredPaymentMethod());
    return stored.category ? stored : selectionFromMethod("card");
  });
  const selectedMethod = paymentSelection.method
    ? toRidePaymentMethod(paymentSelection.method)
    : "";
  const [rating, setRating] = useState(5);
  const [compliment, setCompliment] = useState("");
  const [review, setReview] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(Boolean(ride?.rating));

  const fare = Number(ride?.fare || 0);
  const tipAmount = Math.round((fare * tipPercentage) / 100);
  const totalAmount = fare + tipAmount;
  const paymentStatus = payment?.status || ride?.payment_status || "";
  const isPaid = paymentStatus === "paid" || paymentStatus === "authorized";

  const driverName = getDriverName(ride);
  const driverPhoto = getDriverPhoto(ride);
  const vehicleLabel =
    [ride?.vehicle_make, ride?.vehicle_model].filter(Boolean).join(" ") ||
    ride?.vehicle ||
    "Yala ride";
  // `destination` may arrive as a display string or as a { label, position }
  // location object. Rendering the object directly throws
  // "Objects are not valid as a React child" and blanks the pay-and-rate screen.
  const destinationLocation = ride?.destination;
  const destination =
    (typeof destinationLocation === "string"
      ? destinationLocation
      : destinationLocation?.label) ||
    ride?.destination_address ||
    "Your destination";

  useEffect(() => {
    const loadPayment = async () => {
      try {
        const response = await authenticatedApi.get(`${API_URL}/payments/my-payments/`);
        const payments = Array.isArray(response.data) ? response.data : [];
        const current = payments.find((item) => Number(item.ride_id) === Number(ride.id));
        if (current) setPayment(current);
      } catch (error) {
        console.log("Post-ride payment lookup:", error.response?.data || error);
      }
    };
    loadPayment();
  }, [ride?.id]);

  const makePayment = async () => {
    const result = await submitRidePayment({
      rideId: ride.id,
      method: selectedMethod,
      tipPercentage,
    });
    storePaymentMethod(selectedMethod);
    setPayment(result.payment);
    setNotice(result.message || "Payment request submitted.");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setNotice("");

    try {
      if (!isPaid) {
        if (!selectedMethod) {
          // Incomplete selection (Mobile Money chosen but no provider yet): never
          // submit a payment without a concrete provider.
          setNotice("Choose a payment method before paying.");
          setSubmitting(false);
          return;
        }
        try {
          await makePayment();
        } catch (error) {
          throw error;
        }
      }

      if (!ratingSubmitted && rating) {
        await authenticatedApi.post(
          `${API_URL}/rides/rate/${ride.id}/`,
          {
            rating,
            review: [compliment, review].filter(Boolean).join(". "),
          }
        );
        setRatingSubmitted(true);
      }

      if (typeof onDone === "function") {
        onDone();
        return;
      }
      window.location.href = "/rider-dashboard";
    } catch (error) {
      setNotice(
        error.response?.data?.detail ||
          error.response?.data?.error ||
          "Could not finish your trip review."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipHome = () => {
    if (typeof onDone === "function") {
      onDone();
      return;
    }
    window.location.href = "/rider-dashboard";
  };

  return (
    <div className="post-ride">
      <section className="post-ride__hero">
        <p className="post-ride__eyebrow">Trip complete</p>
        <h2>How was your trip?</h2>
        <p className="post-ride__destination">{destination}</p>
      </section>

      <section className="post-ride__driver-card">
        {driverPhoto ? (
          <img src={driverPhoto} alt={driverName} className="post-ride__avatar" />
        ) : (
          <div className="post-ride__avatar post-ride__avatar--placeholder" aria-hidden="true">
            {driverName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <strong>{driverName}</strong>
          <span>{vehicleLabel}</span>
        </div>
      </section>

      <section className="post-ride__rating" aria-label="Rate your driver">
        <div className="post-ride__stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={rating >= star ? "active" : ""}
              onClick={() => setRating(star)}
              aria-label={`${star} stars`}
            >
              ★
            </button>
          ))}
        </div>
        <p className="post-ride__rating-label">
          {rating >= 5 ? "Excellent" : rating >= 4 ? "Great" : rating >= 3 ? "Good" : rating >= 2 ? "Fair" : "Poor"}
        </p>
      </section>

      {!ratingSubmitted && (
        <section className="post-ride__compliments">
          {COMPLIMENT_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              className={compliment === item ? "active" : ""}
              onClick={() => setCompliment((current) => (current === item ? "" : item))}
            >
              {item}
            </button>
          ))}
        </section>
      )}

      <section className="post-ride__fare-card">
        <div className="post-ride__fare-row">
          <span>Ride fare</span>
          <strong>{formatMoney(fare)}</strong>
        </div>
        <div className="post-ride__fare-row">
          <span>Tip ({tipPercentage}%)</span>
          <strong>{formatMoney(tipAmount)}</strong>
        </div>
        <div className="post-ride__fare-total">
          <span>Total</span>
          <strong>{formatMoney(totalAmount)}</strong>
        </div>
      </section>

      {!isPaid && (
        <>
          <section className="post-ride__tips">
            <p>Add a tip</p>
            <div className="post-ride__tip-grid">
              {TIP_OPTIONS.map((percent) => (
                <button
                  key={percent}
                  type="button"
                  className={tipPercentage === percent ? "active" : ""}
                  onClick={() => setTipPercentage(percent)}
                >
                  <strong>{percent === 0 ? "No tip" : `${percent}%`}</strong>
                  <span>{formatMoney(Math.round((fare * percent) / 100))}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="post-ride__methods">
            <PaymentMethodSelector
              idPrefix="rider-post-ride-payment"
              value={paymentSelection}
              onChange={setPaymentSelection}
              availableMethods={RIDE_PAYMENT_METHODS}
              amount={totalAmount}
              currency="MRU"
              disabled={submitting}
              showAmount={false}
            />
          </section>
        </>
      )}

      {isPaid && (
        <div className="post-ride__paid-badge" role="status">
          ✓ Payment recorded
        </div>
      )}

      {notice && <div className="post-ride__notice">{notice}</div>}

      {!ratingSubmitted && (
        <textarea
          className="post-ride__review"
          value={review}
          onChange={(event) => setReview(event.target.value)}
          placeholder="Add an optional comment..."
          rows={3}
        />
      )}

      {ratingSubmitted ? (
        <button type="button" className="post-ride__primary" onClick={handleSkipHome}>
          Back to home
        </button>
      ) : (
        <button
          type="button"
          className="post-ride__primary"
          disabled={submitting || !rating || (!isPaid && !selectedMethod)}
          onClick={handleSubmit}
        >
          {submitting ? "Submitting..." : isPaid ? "Submit rating" : `Pay ${formatMoney(totalAmount)} & rate`}
        </button>
      )}

      {!ratingSubmitted && (
        <button type="button" className="post-ride__secondary" onClick={handleSkipHome}>
          Skip for now
        </button>
      )}
    </div>
  );
}
