import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { isCancellable, canEditStops, getStatusStepIndex } from '../utils/rideStatus';
import wsService from '../services/wsService';
import { cancelRide } from '../services/apiService';
import RouteTimeline, { buildLiveRoutePoints } from '../../components/RouteTimeline';
import WaitingFeeBanner from '../../components/WaitingFeeBanner';
import LocationInput from './LocationInput';
import { getNextPendingStop } from '../../driver/components/MultiStopProgress';
import './RideTracker.css';

const MAX_STOPS = 3;

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

function estimateDistanceKm(from, to) {
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
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getCoordinatePair(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
    ? [parsedLat, parsedLng]
    : null;
}

function RideTracker({ ride, driverPosition, city = 'Nouakchott', onAddStop, onChat, onShare, onSOS, onPayRate, onCancelSuccess }) {
  const [eta, setEta] = useState(ride.eta_minutes);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState(null);

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

    const nextStop =
      ride.status === 'in_progress' ? getNextPendingStop(ride.stops || []) : null;
    const target =
      ride.status === 'in_progress'
        ? nextStop
          ? getCoordinatePair(nextStop.latitude, nextStop.longitude)
          : getCoordinatePair(ride.destination_lat, ride.destination_lng) || ride.destination?.position
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
    ride.stops,
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
  const rawDriverName =
    ride.driver_name ||
    ride.driver?.full_name ||
    [ride.driver_first_name, ride.driver_last_name].filter(Boolean).join(' ').trim();
  const driverName = rawDriverName || 'Driver';
  const driverPhoto =
    ride.driver_photo_url ||
    ride.driver_picture ||
    ride.driver_photo ||
    ride.driver?.profile_picture ||
    ride.driver?.photo_url;
  const vehiclePhoto = ride.vehicle_photo_url || ride.vehicle_photo;
  const vehicleName =
    [ride.vehicle_make, ride.vehicle_model].filter(Boolean).join(' ') ||
    [ride.car_make, ride.car_model].filter(Boolean).join(' ') ||
    ride.vehicle ||
    'Vehicle details pending';
  const vehicleCategory =
    ride.vehicle_category_label ||
    ride.vehicle_category ||
    ride.car_type ||
    ride.ride_type;
  const driverLevel = ride.driver_level_label || ride.driver_level || ride.driver_category_label || ride.driver_category;
  const driverRating = Number(ride.driver_avg_rating || ride.driver_rating || 0).toFixed(1);
  const pinCode = ride.pickup_pin || ride.pin_code;
  const callNumber = ride.driver_phone || ride.driver?.phone_number || ride.private_call_number;
  const plateNumber = ride.plate_number || ride.vehicle_plate || ride.driver_vehicle_plate;
  const driverAssigned = DRIVER_ASSIGNED_STATUSES.has(ride.status) && Boolean(rawDriverName);
  const effectiveDriverPosition =
    driverPosition ||
    getCoordinatePair(ride.driver_current_lat, ride.driver_current_lng) ||
    getCoordinatePair(ride.driver_lat, ride.driver_lng);
  const nextPendingStop =
    ride.status === 'in_progress' ? getNextPendingStop(ride.stops || []) : null;
  const targetPosition =
    ride.status === 'in_progress'
      ? nextPendingStop
        ? getCoordinatePair(nextPendingStop.latitude, nextPendingStop.longitude)
        : getCoordinatePair(ride.destination_lat, ride.destination_lng) || ride.destination?.position
      : getCoordinatePair(ride.pickup_lat, ride.pickup_lng) || ride.pickup?.position;
  const movementDistanceKm =
    effectiveDriverPosition && Array.isArray(targetPosition)
      ? estimateDistanceKm(effectiveDriverPosition, targetPosition.map(Number))
      : null;
  const routePoints = buildLiveRoutePoints(ride);
  const stopCount = Array.isArray(ride.stops) ? ride.stops.length : 0;
  const progressSteps = useMemo(() => {
    if (ride.status === 'in_progress') {
      if (nextPendingStop) {
        return PROGRESS_STEPS.map((step) =>
          step.key === 'in_progress'
            ? { ...step, label: `To Stop ${nextPendingStop.stop_order}` }
            : step
        );
      }
      return PROGRESS_STEPS.map((step) =>
        step.key === 'in_progress'
          ? { ...step, label: 'Heading to destination' }
          : step
      );
    }
    return PROGRESS_STEPS;
  }, [ride.status, nextPendingStop]);
  const canAddMoreStops = canEditStops(ride.status) && stopCount < MAX_STOPS && Boolean(onAddStop);

  const handleAddStopSelect = useCallback(
    async (location) => {
      if (!location?.position || !onAddStop) return;

      setAddingStop(true);
      setAddStopError(null);

      try {
        await onAddStop(location);
        setShowAddStop(false);
      } catch (error) {
        setAddStopError(error.message || 'Could not add stop. Try again.');
      } finally {
        setAddingStop(false);
      }
    },
    [onAddStop]
  );

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

  if (ride.status === 'completed') {
    const fareLabel = ride.fare != null ? `${Math.round(Number(ride.fare))} MRU` : '—';

    return (
      <div className="ride-tracker ride-tracker--completed" aria-label="Trip completed">
        <div className="ride-tracker__complete-badge" aria-hidden="true">✓</div>
        <h2 className="ride-tracker__complete-title">You&apos;ve arrived</h2>
        <p className="ride-tracker__complete-subtitle">Thanks for riding with Yala</p>

        <div className="ride-tracker__complete-driver">
          {driverPhoto ? (
            <img className="ride-tracker__driver-photo" src={driverPhoto} alt={`${driverName} profile`} />
          ) : (
            <div className="ride-tracker__driver-photo--placeholder" aria-hidden="true">
              {driverName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="ride-tracker__driver-details">
            <p className="ride-tracker__driver-name">{driverName}</p>
            <p className="ride-tracker__driver-meta">
              <strong>★ {driverRating}</strong>
              <span>{vehicleName}</span>
            </p>
          </div>
        </div>

        <div className="ride-tracker__complete-fare">
          <span>Trip total</span>
          <strong>{fareLabel}</strong>
        </div>

        <button
          className="ride-tracker__btn ride-tracker__btn--pay-rate"
          onClick={onPayRate}
          aria-label="Rate your driver"
          type="button"
        >
          Rate your driver
        </button>
      </div>
    );
  }

  return (
    <div className="ride-tracker" aria-label="Ride tracking panel">
      <section className="ride-tracker__route" aria-label="Trip route">
        <RouteTimeline points={routePoints} compact />
        {canAddMoreStops && (
          <div className="ride-tracker__add-stop">
            {!showAddStop ? (
              <button
                type="button"
                className="ride-tracker__add-stop-btn"
                onClick={() => setShowAddStop(true)}
              >
                + Add stop ({stopCount}/{MAX_STOPS})
              </button>
            ) : (
              <div className="ride-tracker__add-stop-form">
                <LocationInput
                  label={`Add stop ${stopCount + 1}`}
                  value=""
                  city={city}
                  onSelect={handleAddStopSelect}
                  variant="stop"
                />
                <button
                  type="button"
                  className="ride-tracker__add-stop-cancel"
                  onClick={() => {
                    setShowAddStop(false);
                    setAddStopError(null);
                  }}
                  disabled={addingStop}
                >
                  Cancel
                </button>
              </div>
            )}
            {addStopError && (
              <p className="ride-tracker__add-stop-error" role="alert">
                {addStopError}
              </p>
            )}
            {addingStop && (
              <p className="ride-tracker__add-stop-loading">Adding stop...</p>
            )}
          </div>
        )}
        {ride.status === 'in_progress' && stopCount === 0 && (
          <p className="ride-tracker__route-hint">
            Stops must be added before the trip starts.
          </p>
        )}
      </section>

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
                alt={`${driverName} profile`}
              />
            ) : (
              <div className="ride-tracker__driver-photo--placeholder" aria-hidden="true">
                {driverName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="ride-tracker__driver-details">
              <div className="ride-tracker__driver-title">
                <p className="ride-tracker__driver-name">{driverName}</p>
                {ride.driver_verified && <span className="ride-tracker__verified-badge">Verified</span>}
              </div>
              <p className="ride-tracker__driver-meta">
                <strong>★ {driverRating}</strong>
                {driverLevel && <span>{driverLevel}</span>}
                {ride.driver_code && <span>Code {ride.driver_code}</span>}
              </p>
              <p className="ride-tracker__driver-contact">📞 {callNumber || 'Phone unavailable'}</p>
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
                {[ride.vehicle_color || ride.car_color, vehicleCategory].filter(Boolean).join(' · ')}
              </p>
              <span className="ride-tracker__plate">{plateNumber || 'Plate pending'}</span>
            </div>
            {ride.vehicle_verified && <span className="ride-tracker__vehicle-verified">Verified vehicle</span>}
          </div>
          <p className="ride-tracker__movement">
            📍{' '}
            {ride.status === 'in_progress'
              ? nextPendingStop
                ? `Driver heading to stop ${nextPendingStop.stop_order}`
                : 'Driver moving to final destination'
              : 'Driver moving to pickup'}
            {movementDistanceKm != null ? ` · ~${movementDistanceKm.toFixed(1)} km away` : ' · Live location updating'}
          </p>
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

      {ride.status === 'driver_arrived' && <WaitingFeeBanner ride={ride} audience="rider" />}

      {/* Progress Indicator */}
      {driverAssigned && <div className="ride-tracker__progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={4}>
        {progressSteps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isActive = index === currentStep;
          let stepClass = 'ride-tracker__step';
          if (isCompleted) stepClass += ' ride-tracker__step--completed';
          if (isActive) stepClass += ' ride-tracker__step--active';

          return (
            <div key={step.key} className={stepClass}>
              <div className="ride-tracker__step-dot" />
              <span className="ride-tracker__step-label">{step.label}</span>
              {index < progressSteps.length - 1 && (
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
