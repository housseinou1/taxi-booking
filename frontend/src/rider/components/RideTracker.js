import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isCancellable, getStatusStepIndex } from '../utils/rideStatus';
import wsService from '../services/wsService';
import { cancelRide } from '../services/apiService';
import './RideTracker.css';

/**
 * Cancellation reasons available to the rider.
 */
const CANCEL_REASONS = [
  'Rider not available',
  'Driver too far',
  'Wrong pickup location',
  'Emergency',
  'Waited too long',
  'Changed my mind',
  'Other',
];

/**
 * Progress steps displayed in the step-by-step indicator.
 * Maps status progression to user-friendly labels.
 */
const PROGRESS_STEPS = [
  { key: 'driver_arriving', label: 'Driver Arriving' },
  { key: 'driver_arrived', label: 'Arrived' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

/**
 * RideTracker component for real-time ride status tracking.
 *
 * Displays driver info, ride progress, live ETA, PIN code,
 * and provides cancel, chat, and SOS actions.
 *
 * Props:
 * - ride: ActiveRide object with status, driver info, PIN, ETA, etc.
 * - driverPosition: optional [lat, lng] tuple for driver location
 * - onChat: callback when chat button is tapped
 * - onSOS: callback when SOS button is tapped
 * - onCancelSuccess: callback after successful cancellation
 */
const DRIVER_ASSIGNED_STATUSES = new Set([
  'accepted',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
  'completed',
]);

function estimateEtaMinutes(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to)) return null;

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(to[0] - from[0]);
  const lngDelta = toRadians(to[1] - from[1]);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from[0])) *
      Math.cos(toRadians(to[0])) *
      Math.sin(lngDelta / 2) ** 2;
  const distanceKm = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.max(1, Math.round((distanceKm / 32) * 60));
}

function getCoordinatePair(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
    ? [parsedLat, parsedLng]
    : null;
}

function RideTracker({ ride, driverPosition, onChat, onShare, onSOS, onPayRate, onCancelSuccess }) {
  const [eta, setEta] = useState(ride.eta_minutes);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  // Subscribe to ETA updates via WebSocket
  useEffect(() => {
    const unsubscribe = wsService.subscribeRideUpdates((data) => {
      if (data.eta_minutes != null && (data.ride_id === ride.id || data.ride_id == null)) {
        setEta(data.eta_minutes);
      }
    });

    return unsubscribe;
  }, [ride.id]);

  // Sync ETA from prop when it changes
  useEffect(() => {
    if (ride.eta_minutes != null) {
      setEta(ride.eta_minutes);
    }
  }, [ride.eta_minutes]);

  useEffect(() => {
    const effectiveDriverPosition =
      driverPosition ||
      getCoordinatePair(ride.driver_current_lat, ride.driver_current_lng) ||
      getCoordinatePair(ride.driver_lat, ride.driver_lng);
    if (!effectiveDriverPosition) return;

    const target =
      ride.status === 'in_progress'
        ? getCoordinatePair(ride.destination_lat, ride.destination_lng) || ride.destination?.position
        : getCoordinatePair(ride.pickup_lat, ride.pickup_lng) || ride.pickup?.position;

    if (Array.isArray(target) && target.every((coordinate) => Number.isFinite(Number(coordinate)))) {
      setEta(estimateEtaMinutes(effectiveDriverPosition, target.map(Number)));
    }
  }, [
    driverPosition,
    ride.driver_current_lat,
    ride.driver_current_lng,
    ride.driver_lat,
    ride.driver_lng,
    ride.destination_lat,
    ride.destination_lng,
    ride.destination,
    ride.pickup_lat,
    ride.pickup_lng,
    ride.pickup,
    ride.status,
  ]);

  /**
   * Get the current step index for the progress indicator.
   * Maps ride status to the 4-step display (0-3).
   */
  const getCurrentStepIndex = useCallback(() => {
    const statusIndex = getStatusStepIndex(ride.status);
    // Map the full status index to our 4-step progress:
    // driver_arriving (index 3) → step 0
    // driver_arrived (index 4) → step 1
    // in_progress (index 5) → step 2
    // completed (index 6) → step 3
    if (statusIndex >= 6) return 3; // completed
    if (statusIndex >= 5) return 2; // in_progress
    if (statusIndex >= 4) return 1; // driver_arrived
    if (statusIndex >= 3) return 0; // driver_arriving
    return 0; // default to first step for earlier statuses
  }, [ride.status]);

  const currentStep = getCurrentStepIndex();
  const driverAssigned = DRIVER_ASSIGNED_STATUSES.has(ride.status) && Boolean(ride.driver_name);
  const driverPhoto = ride.driver_photo_url || ride.driver_picture;
  const vehiclePhoto = ride.vehicle_photo_url || ride.vehicle_photo;
  const vehicleName =
    [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(' ') ||
    ride.vehicle ||
    'Vehicle details pending';
  const vehicleCategory = ride.vehicle_category_label || ride.vehicle_category || ride.ride_type;
  const driverLevel = ride.driver_level_label || ride.driver_level || ride.driver_category_label || ride.driver_category;
  const driverRating = Number(ride.driver_avg_rating || ride.driver_rating || 0).toFixed(1);
  const pinCode = ride.pickup_pin || ride.pin_code;
  const callNumber = ride.driver_phone || ride.private_call_number;

  /**
   * Handle cancellation confirmation.
   */
  const handleConfirmCancel = async () => {
    if (!cancelReason) return;

    setCancelling(true);
    setCancelError(null);

    try {
      const result = await cancelRide(ride.id, cancelReason);
      setShowCancelModal(false);
      setCancelReason('');
      if (onCancelSuccess) {
        onCancelSuccess(result);
      }
    } catch (error) {
      setCancelError(error.message || 'Failed to cancel ride');
    } finally {
      setCancelling(false);
    }
  };

  const handleDismissModal = () => {
    setShowCancelModal(false);
    setCancelReason('');
    setCancelError(null);
  };

  return (
    <div className="ride-tracker" aria-label="Ride tracking panel">
      {/* Driver Info */}
      {driverAssigned ? (
        <section className="ride-tracker__assignment" aria-label="Driver and vehicle information">
          <div className="ride-tracker__verified-banner">
            <span aria-hidden="true">✓</span>
            Verified by Yala
          </div>

          <div className="ride-tracker__driver">
            {driverPhoto ? (
              <img
                className="ride-tracker__driver-photo"
                src={driverPhoto}
                alt={`${ride.driver_name} profile`}
              />
            ) : (
              <div className="ride-tracker__driver-photo--placeholder" aria-hidden="true">
                {ride.driver_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="ride-tracker__driver-details">
              <div className="ride-tracker__driver-title">
                <p className="ride-tracker__driver-name">{ride.driver_name}</p>
                {ride.driver_verified && <span className="ride-tracker__verified-badge">Verified</span>}
              </div>
              <p className="ride-tracker__driver-meta">
                <strong>★ {driverRating}</strong>
                {driverLevel && <span>{driverLevel}</span>}
                {ride.driver_code && <span>Code {ride.driver_code}</span>}
              </p>
            </div>
          </div>

          <div className="ride-tracker__vehicle">
            {vehiclePhoto ? (
              <img className="ride-tracker__vehicle-photo" src={vehiclePhoto} alt={`${vehicleName} vehicle`} />
            ) : (
              <div className="ride-tracker__vehicle-photo--placeholder" aria-hidden="true">CAR</div>
            )}
            <div className="ride-tracker__vehicle-details">
              <p className="ride-tracker__vehicle-name">{vehicleName}</p>
              <p className="ride-tracker__vehicle-info">
                {[ride.vehicle_color, vehicleCategory].filter(Boolean).join(' · ')}
              </p>
              <span className="ride-tracker__plate">{ride.plate_number || 'Plate pending'}</span>
            </div>
            {ride.vehicle_verified && <span className="ride-tracker__vehicle-verified">Verified vehicle</span>}
          </div>
        </section>
      ) : (
        <div className="ride-tracker__searching" role="status">
          <span className="ride-tracker__searching-spinner" aria-hidden="true" />
          <div>
            <strong>Looking for a nearby driver</strong>
            <span>We will show verified driver and vehicle details after acceptance.</span>
          </div>
        </div>
      )}

      {/* Progress Indicator */}
      {driverAssigned && <div className="ride-tracker__progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={4}>
        {PROGRESS_STEPS.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          let stepClass = 'ride-tracker__step';
          if (isCompleted) stepClass += ' ride-tracker__step--completed';
          if (isActive) stepClass += ' ride-tracker__step--active';

          return (
            <div key={step.key} className={stepClass}>
              <div className="ride-tracker__step-dot" />
              <span className="ride-tracker__step-label">{step.label}</span>
              {index < PROGRESS_STEPS.length - 1 && (
                <div className="ride-tracker__step-connector" />
              )}
            </div>
          );
        })}
      </div>}

      {/* ETA and PIN */}
      <div className="ride-tracker__info">
        <div className="ride-tracker__eta">
          <span className="ride-tracker__eta-label">ETA</span>
          <span className="ride-tracker__eta-pill">
            {eta != null ? `Arriving in ${eta} min` : 'Searching for ETA'}
          </span>
          <span className="ride-tracker__eta-value">
            {eta != null ? `${eta} min` : '—'}
          </span>
        </div>
        <div className="ride-tracker__pin">
          <span className="ride-tracker__pin-label">Ride PIN</span>
          <span className="ride-tracker__pin-value">{pinCode || '—'}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ride-tracker__actions">
        {ride.status === 'completed' && (
          <button
            className="ride-tracker__btn ride-tracker__btn--pay-rate"
            onClick={onPayRate}
            aria-label="Pay and rate"
            type="button"
          >
            Pay & Rate
          </button>
        )}

        {callNumber && driverAssigned && (
          <a
            className="ride-tracker__btn ride-tracker__btn--call"
            href={`tel:${callNumber}`}
            aria-label="Call driver"
          >
            Call
          </a>
        )}

        <button
          className="ride-tracker__btn ride-tracker__btn--chat"
          onClick={onChat}
          aria-label="Chat with driver"
          type="button"
          disabled={!driverAssigned}
        >
          Chat
        </button>

        <button
          className="ride-tracker__btn ride-tracker__btn--share"
          onClick={onShare}
          aria-label="Share trip"
          type="button"
          disabled={!driverAssigned}
        >
          Share
        </button>

        <button
          className="ride-tracker__btn ride-tracker__btn--sos"
          onClick={onSOS}
          aria-label="Emergency SOS"
          type="button"
        >
          SOS
        </button>

        {isCancellable(ride.status) && (
          <button
            className="ride-tracker__btn ride-tracker__btn--cancel"
            onClick={() => setShowCancelModal(true)}
            aria-label="Cancel ride"
            type="button"
          >
            Cancel Ride
          </button>
        )}
      </div>

      {/* Cancel Error */}
      {cancelError && !showCancelModal && (
        <div className="ride-tracker__error" role="alert">
          {cancelError}
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && createPortal(
        <div
          className="ride-tracker__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <div className="ride-tracker__modal">
            <h2 id="cancel-modal-title" className="ride-tracker__modal-title">
              Cancel Ride
            </h2>
            <p className="ride-tracker__modal-fee">
              {ride.driver || ride.driver_name
                ? 'A 100 MRU cancellation fee may apply because a driver accepted this ride.'
                : 'No cancellation fee applies before a driver accepts.'}
            </p>

            <div className="ride-tracker__modal-reasons" role="radiogroup" aria-label="Cancellation reason">
              {CANCEL_REASONS.map((reason) => {
                const isSelected = cancelReason === reason;
                return (
                  <button
                    key={reason}
                    className={`ride-tracker__reason-option${isSelected ? ' ride-tracker__reason-option--selected' : ''}`}
                    onClick={() => setCancelReason(reason)}
                    role="radio"
                    aria-checked={isSelected}
                    type="button"
                  >
                    <span className="ride-tracker__reason-radio" />
                    {reason}
                  </button>
                );
              })}
            </div>

            {cancelError && (
              <div className="ride-tracker__error" role="alert">
                {cancelError}
              </div>
            )}

            <div className="ride-tracker__modal-actions">
              <button
                className="ride-tracker__modal-btn ride-tracker__modal-btn--dismiss"
                onClick={handleDismissModal}
                type="button"
              >
                Keep Ride
              </button>
              <button
                className="ride-tracker__modal-btn ride-tracker__modal-btn--confirm"
                onClick={handleConfirmCancel}
                disabled={!cancelReason || cancelling}
                type="button"
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default RideTracker;
