import React, { useState, useCallback, useRef } from 'react';
import PromoCodeInput from './PromoCodeInput';
import { isProfileComplete } from '../utils/profileCheck';
import './BookingConfirmation.css';

/**
 * Ride type display labels.
 */
const RIDE_TYPE_LABELS = {
  regular: 'Regular',
  comfort: 'Comfort',
  xl: 'XL',
  share: 'Share',
};

/**
 * BookingConfirmation component — displays booking summary and handles ride submission.
 *
 * Props:
 * - pickup: { label, position } — pickup location
 * - destination: { label, position } — destination location
 * - stops: Location[] — intermediate stops (0-3)
 * - rideType: 'regular' | 'comfort' | 'xl' | 'share'
 * - fare: number — estimated fare in MRU
 * - discountedFare: optional discounted fare
 * - promoCode: optional applied promo code string
 * - onConfirm: () => void — called after successful ride request
 * - onPromoApply: (code: string) => void — called when promo code is submitted
 * - loading: boolean — whether ride request is in progress
 * - error: optional error string from ride request failure
 * - profile: rider profile object for completeness check
 * - routeInfo: optional route info { distanceKm, etaMinutes }
 * - promoError: optional error from promo validation
 * - promoLoading: optional loading state for promo validation
 */
function BookingConfirmation({
  pickup,
  destination,
  stops = [],
  rideType,
  fare,
  discountedFare,
  promoCode,
  onConfirm,
  onPromoApply,
  loading,
  error,
  profile,
  routeInfo,
  promoError,
  promoLoading,
}) {
  const [profileWarning, setProfileWarning] = useState(false);
  const submittingRef = useRef(false);

  const hasDiscount = discountedFare != null && discountedFare < fare;
  const displayFare = hasDiscount ? discountedFare : fare;

  const handleConfirm = useCallback(async () => {
    // Prevent duplicate submissions
    if (loading || submittingRef.current) {
      return;
    }

    // Profile completeness guard
    if (!isProfileComplete(profile)) {
      setProfileWarning(true);
      return;
    }

    setProfileWarning(false);
    submittingRef.current = true;

    try {
      if (onConfirm) {
        await onConfirm();
      }
    } finally {
      submittingRef.current = false;
    }
  }, [loading, profile, onConfirm]);

  const dismissProfileWarning = () => {
    setProfileWarning(false);
  };

  return (
    <div className="booking-confirmation" role="region" aria-label="Booking confirmation">
      {/* Booking Summary */}
      <div className="booking-confirmation__summary">
        <h2 className="booking-confirmation__title">Confirm Your Ride</h2>

        {/* Pickup */}
        <div className="booking-confirmation__row">
          <span className="booking-confirmation__icon" aria-hidden="true">📍</span>
          <div className="booking-confirmation__detail">
            <span className="booking-confirmation__detail-label">Pickup</span>
            <span className="booking-confirmation__detail-value">
              {pickup?.label || 'Not set'}
            </span>
          </div>
        </div>

        {/* Stops */}
        {stops.map((stop, index) => (
          <div className="booking-confirmation__row" key={`stop-${index}`}>
            <span className="booking-confirmation__icon" aria-hidden="true">⬤</span>
            <div className="booking-confirmation__detail">
              <span className="booking-confirmation__detail-label">Stop {index + 1}</span>
              <span className="booking-confirmation__detail-value">
                {stop?.label || `Stop ${index + 1}`}
              </span>
            </div>
          </div>
        ))}

        {/* Destination */}
        <div className="booking-confirmation__row">
          <span className="booking-confirmation__icon" aria-hidden="true">🏁</span>
          <div className="booking-confirmation__detail">
            <span className="booking-confirmation__detail-label">Destination</span>
            <span className="booking-confirmation__detail-value">
              {destination?.label || 'Not set'}
            </span>
          </div>
        </div>

        {/* Ride Type */}
        <div className="booking-confirmation__row">
          <span className="booking-confirmation__icon" aria-hidden="true">🚗</span>
          <div className="booking-confirmation__detail">
            <span className="booking-confirmation__detail-label">Ride Type</span>
            <span className="booking-confirmation__detail-value">
              {RIDE_TYPE_LABELS[rideType] || rideType}
            </span>
          </div>
        </div>

        {/* Fare */}
        <div className="booking-confirmation__fare-section">
          <span className="booking-confirmation__fare-label">Estimated Fare</span>
          <div className="booking-confirmation__fare-value">
            {hasDiscount && (
              <span className="booking-confirmation__fare-original">
                {Math.round(fare)} MRU
              </span>
            )}
            <span className="booking-confirmation__fare-amount">
              {Math.round(displayFare)} MRU
            </span>
          </div>
        </div>
      </div>

      {/* Promo Code Section */}
      <PromoCodeInput
        onApply={onPromoApply}
        currentCode={promoCode}
        error={promoError}
        loading={promoLoading}
      />

      {/* Profile Incomplete Warning */}
      {profileWarning && (
        <div
          className="booking-confirmation__profile-warning"
          role="alert"
          aria-live="assertive"
        >
          <span className="booking-confirmation__profile-warning-text">
            Please complete your profile (photo and phone number) before booking.
          </span>
          <button
            className="booking-confirmation__profile-warning-dismiss"
            onClick={dismissProfileWarning}
            aria-label="Dismiss profile warning"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {error && (
        <div
          className="booking-confirmation__error"
          role="alert"
          aria-live="assertive"
        >
          {error}
        </div>
      )}

      {/* Confirm Button */}
      <button
        className="booking-confirmation__confirm-btn"
        onClick={handleConfirm}
        disabled={loading}
        aria-busy={loading}
        aria-label={loading ? 'Requesting ride...' : 'Confirm booking'}
      >
        {loading ? (
          <span className="booking-confirmation__spinner" aria-hidden="true" />
        ) : null}
        <span>{loading ? 'Requesting...' : 'Confirm Booking'}</span>
      </button>
    </div>
  );
}

export default BookingConfirmation;
