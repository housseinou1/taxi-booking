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
 * Step 0: Finding Driver (searching phase)
 * Step 1: Driver Arriving (driver accepted, en route to pickup)
 * Step 2: Arrived (driver at pickup location)
 * Step 3: In Progress (trip ongoing)
 * Step 4: Completed (trip finished)
 */
const PROGRESS_STEPS = [
  { key: 'finding_driver', label: 'Finding Driver' },
  { key: 'driver_arriving', label: 'Driver Arriving' },
  { key: 'driver_arrived', label: 'Arrived' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

/**
 * Maximum reasonable ETA in minutes (2 hours).
 * Anything above this is likely a data error.
 */
const MAX_ETA_MINUTES = 120;

/**
 * Maximum reasonable distance in km (200 km).
 * Anything above this is likely a data error.
 */
const MAX_DISTANCE_KM = 200;

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

const PRE_ASSIGNMENT_STATUSES = new Set(['requested', 'pending']);

/**
 * True once a driver has accepted / is en route.
 * Must not depend on driver_name alone — WS/API updates often omit it briefly.
 */
export function isDriverAssignedToRide(
  ride,
  { eta = null, driverPosition = null, driverName = '' } = {}
) {
  if (!ride) return false;

  const hasDriverIdentity = Boolean(
    ride.driver ||
    ride.driver_id ||
    driverName ||
    ride.driver_first_name ||
    ride.driver_last_name ||
    ride.driver_phone ||
    ride.private_call_number ||
    ride.driver_code
  );

  if (!PRE_ASSIGNMENT_STATUSES.has(ride.status)) {
    return DRIVER_ASSIGNED_STATUSES.has(ride.status);
  }

  // Stale "requested" state while driver is already matched and moving.
  return Boolean(driverPosition || hasDriverIdentity) && eta != null;
}

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
  // Don't initialize ETA if no driver is assigned yet
  const initialEta = PRE_ASSIGNMENT_STATUSES.has(ride.status) ? null
    : (ride.eta_minutes != null && Number(ride.eta_minutes) <= MAX_ETA_MINUTES ? Number(ride.eta_minutes) : null);
  const [eta, setEta] = useState(initialEta);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOtherText, setCancelOtherText] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState(null);

  // Subscribe to ETA updates via WebSocket
  useEffect(() => {
    const unsubscribe = wsService.subscribeRideUpdates((data) => {
      if (data.eta_minutes != null && (data.ride_id === ride.id || data.ride_id == null)) {
        const incoming = Number(data.eta_minutes);
        // Only accept reasonable ETA values
        if (incoming > 0 && incoming <= MAX_ETA_MINUTES) {
          setEta(incoming);
        }
      }
    });

    return unsubscribe;
  }, [ride.id]);

  // Sync ETA from prop when it changes
  useEffect(() => {
    if (ride.eta_minutes != null) {
      const incoming = Number(ride.eta_minutes);
      if (incoming > 0 && incoming <= MAX_ETA_MINUTES) {
        setEta(incoming);
      }
    }
  }, [ride.eta_minutes]);

  useEffect(() => {
    // Only calculate ETA once a driver has accepted — prevents impossible values
    // when no driver position is reliably known yet.
    if (PRE_ASSIGNMENT_STATUSES.has(ride.status)) return;

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
      const calculated = estimateEtaMinutes(effectiveDriverPosition, target.map(Number));
      // Cap to reasonable maximum — anything above is a data error
      if (calculated != null && calculated <= MAX_ETA_MINUTES) {
        setEta(calculated);
      } else if (calculated != null) {
        setEta(null); // Don't show impossible ETA
      }
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
   * Maps ride status to the 5-step display (0-4).
   * 0 = Finding Driver, 1 = Driver Arriving, 2 = Arrived, 3 = In Progress, 4 = Completed
   */
  const getCurrentStepIndex = useCallback(() => {
    const statusIndex = getStatusStepIndex(ride.status);
    // Map the full status index to our 5-step progress:
    // requested/pending (index 0-1) → step 0 (Finding Driver)
    // accepted (index 2) → step 1 (Driver Arriving)
    // driver_arriving (index 3) → step 1 (Driver Arriving)
    // driver_arrived (index 4) → step 2 (Arrived)
    // in_progress (index 5) → step 3 (In Progress)
    // completed (index 6) → step 4 (Completed)
    if (statusIndex >= 6) return 4; // completed
    if (statusIndex >= 5) return 3; // in_progress
    if (statusIndex >= 4) return 2; // driver_arrived
    if (statusIndex >= 2) return 1; // accepted or driver_arriving
    return 0; // requested/pending → Finding Driver
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
  const effectiveDriverPosition =
    driverPosition ||
    getCoordinatePair(ride.driver_current_lat, ride.driver_current_lng) ||
    getCoordinatePair(ride.driver_lat, ride.driver_lng);
  const driverAssigned = isDriverAssignedToRide(ride, {
    eta,
    driverPosition: effectiveDriverPosition,
    driverName: rawDriverName,
  });
  const nextPendingStop =
    ride.status === 'in_progress' ? getNextPendingStop(ride.stops || []) : null;
  const targetPosition =
    ride.status === 'in_progress'
      ? nextPendingStop
        ? getCoordinatePair(nextPendingStop.latitude, nextPendingStop.longitude)
        : getCoordinatePair(ride.destination_lat, ride.destination_lng) || ride.destination?.position
      : getCoordinatePair(ride.pickup_lat, ride.pickup_lng) || ride.pickup?.position;
  const movementDistanceKm = useMemo(() => {
    // Only show distance once a driver is assigned
    if (!driverAssigned) return null;
    if (!effectiveDriverPosition || !Array.isArray(targetPosition)) return null;
    const raw = estimateDistanceKm(effectiveDriverPosition, targetPosition.map(Number));
    // Cap to reasonable maximum — anything above is a data error
    if (raw != null && raw > MAX_DISTANCE_KM) return null;
    return raw;
  }, [driverAssigned, effectiveDriverPosition, targetPosition]);
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
    // While searching, update the label to reflect dispatch state
    if (!driverAssigned && PRE_ASSIGNMENT_STATUSES.has(ride.status)) {
      return PROGRESS_STEPS.map((step) =>
        step.key === 'finding_driver'
          ? {
              ...step,
              label:
                ride.dispatch_status === 'no_driver_found'
                  ? 'No driver found'
                  : ride.dispatch_round >= 2
                    ? 'Searching...'
                    : 'Finding Driver',
            }
          : step
      );
    }
    return PROGRESS_STEPS;
  }, [ride.status, ride.dispatch_status, ride.dispatch_round, nextPendingStop, driverAssigned]);
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

    // If "Other" is selected, require at least 10 characters of explanation
    const isOther = cancelReason === 'Other';
    const effectiveReason = isOther ? cancelOtherText.trim() : cancelReason;

    if (isOther && effectiveReason.length < 10) {
      setCancelError('Please explain your reason (minimum 10 characters).');
      return;
    }

    setCancelling(true);
    setCancelError(null);

    try {
      wsService.leaveRideGroup(ride.id);
      const result = await cancelRide(ride.id, effectiveReason);
      setShowCancelModal(false);
      setCancelReason('');
      setCancelOtherText('');
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
    setCancelOtherText('');
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
                {ride.completed_trips != null && (
                  <span>{ride.completed_trips} rides</span>
                )}
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
            <strong>
              {ride.dispatch_status === 'no_driver_found'
                ? 'No driver available right now'
                : 'Looking for a nearby driver'}
            </strong>
            <span>
              {ride.dispatch_status === 'no_driver_found'
                ? 'You can cancel and retry, or schedule a ride for later.'
                : ride.dispatch_round >= 3
                  ? `Expanding search${ride.search_radius_km ? ` (~${Math.round(ride.search_radius_km)} km)` : ''}…`
                  : ride.dispatch_round >= 2
                    ? 'Still searching nearby drivers…'
                    : 'We will show verified driver and vehicle details after acceptance.'}
            </span>
          </div>
        </div>
      )}

      {ride.status === 'driver_arrived' && <WaitingFeeBanner ride={ride} audience="rider" />}

      {/* Progress Indicator — always visible to show current phase */}
      <div className="ride-tracker__progress" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={5}>
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
      </div>

      {/* ETA and PIN — only show once a driver has been assigned */}
      {driverAssigned && (
        <div className="ride-tracker__info">
          <div className="ride-tracker__eta">
            <span className="ride-tracker__eta-label">ETA</span>
            <span className="ride-tracker__eta-pill">
              {eta != null ? `Arriving in ${eta} min` : 'Calculating ETA...'}
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
      )}

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
                ? 'Free cancellation for the first 2 minutes. After that, up to a 75 MRU fee may apply depending on the driver status.'
                : 'No cancellation fee applies before a driver accepts.'}
            </p>

            <div className="ride-tracker__modal-reasons" role="radiogroup" aria-label="Cancellation reason">
              {CANCEL_REASONS.map((reason) => {
                const isSelected = cancelReason === reason;
                return (
                  <button
                    key={reason}
                    className={`ride-tracker__reason-option${isSelected ? ' ride-tracker__reason-option--selected' : ''}`}
                    onClick={() => { setCancelReason(reason); setCancelError(null); }}
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

            {cancelReason === 'Other' && (
              <div className="ride-tracker__other-reason">
                <label htmlFor="cancel-other-text" className="ride-tracker__other-label">
                  Please explain your reason, minimum 10 characters.
                </label>
                <textarea
                  id="cancel-other-text"
                  className="ride-tracker__other-textarea"
                  value={cancelOtherText}
                  onChange={(e) => { setCancelOtherText(e.target.value); setCancelError(null); }}
                  placeholder="Family emergency, Wrong destination, Changed plans"
                  rows={3}
                  maxLength={500}
                />
                <span className="ride-tracker__other-count">
                  {cancelOtherText.trim().length}/10 min
                </span>
              </div>
            )}

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
                disabled={!cancelReason || cancelling || (cancelReason === 'Other' && cancelOtherText.trim().length < 10)}
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
