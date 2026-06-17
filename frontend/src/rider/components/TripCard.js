import React from 'react';
import { getRideTypeIcon, formatFare } from './FareCard';
import './TripCard.css';

/**
 * Human-readable labels for ride status values.
 */
const STATUS_LABELS = {
  requested: 'Requested',
  pending: 'Pending',
  accepted: 'Accepted',
  driver_arriving: 'Driver Arriving',
  driver_arrived: 'Driver Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * CSS modifier class for status badges.
 */
const STATUS_MODIFIERS = {
  completed: 'trip-card__status--completed',
  cancelled: 'trip-card__status--cancelled',
  in_progress: 'trip-card__status--active',
};

/**
 * Format a date string to a readable short format.
 * @param {string} dateStr - ISO date string or parseable date
 * @returns {string} Formatted date
 */
export function formatTripDate(dateStr) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Render star rating as text.
 * @param {number|undefined} rating - Rating value (1-5)
 * @returns {string} Star representation
 */
function renderStars(rating) {
  if (rating == null) return 'No rating';
  const filled = Math.round(rating);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

/**
 * TripCard component displaying a ride history summary with expandable details.
 *
 * Props:
 * - trip: TripSummary object (id, date, pickup_address, destination_address, fare, ride_type, status, driver_name?, rating?, route_path?)
 * - onExpand: (tripId: number) => void — callback when card is expanded/collapsed
 * - expanded: boolean — whether the detail view is shown
 */
function TripCard({ trip, onExpand, expanded }) {
  const statusLabel = STATUS_LABELS[trip.status] || trip.status;
  const statusModifier = STATUS_MODIFIERS[trip.status] || '';

  return (
    <article
      className={`trip-card${expanded ? ' trip-card--expanded' : ''}`}
      aria-label={`Trip on ${formatTripDate(trip.date)} from ${trip.pickup_address} to ${trip.destination_address}`}
    >
      <button
        className="trip-card__summary"
        type="button"
        onClick={() => onExpand(trip.id)}
        aria-expanded={expanded}
        aria-controls={`trip-detail-${trip.id}`}
      >
        <div className="trip-card__header">
          <span className="trip-card__date">{formatTripDate(trip.date)}</span>
          <span className={`trip-card__status ${statusModifier}`}>
            {statusLabel}
          </span>
        </div>

        <div className="trip-card__route">
          <div className="trip-card__location">
            <span className="trip-card__dot trip-card__dot--pickup" aria-hidden="true" />
            <span className="trip-card__address">{trip.pickup_address}</span>
          </div>
          <div className="trip-card__location">
            <span className="trip-card__dot trip-card__dot--destination" aria-hidden="true" />
            <span className="trip-card__address">{trip.destination_address}</span>
          </div>
        </div>

        <div className="trip-card__footer">
          <span className="trip-card__ride-type">
            <span aria-hidden="true">{getRideTypeIcon(trip.ride_type)}</span>
            {' '}
            {trip.ride_type}
          </span>
          <span className="trip-card__fare">{formatFare(trip.fare)}</span>
        </div>
      </button>

      {expanded && (
        <div
          className="trip-card__details"
          id={`trip-detail-${trip.id}`}
          role="region"
          aria-label="Trip details"
        >
          {trip.route_path && trip.route_path.length > 0 && (
            <div className="trip-card__map-placeholder" aria-label="Route map">
              <span className="trip-card__map-icon" aria-hidden="true">🗺️</span>
              <span className="trip-card__map-text">Route map</span>
            </div>
          )}

          {trip.driver_name && (
            <div className="trip-card__driver">
              <span className="trip-card__driver-label">Driver</span>
              <span className="trip-card__driver-name">{trip.driver_name}</span>
            </div>
          )}

          {trip.rating != null && (
            <div className="trip-card__rating">
              <span className="trip-card__rating-label">Rating</span>
              <span className="trip-card__rating-stars" aria-label={`${trip.rating} out of 5 stars`}>
                {renderStars(trip.rating)}
              </span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default TripCard;
