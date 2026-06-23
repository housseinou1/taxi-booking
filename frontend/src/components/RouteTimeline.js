import React from 'react';
import './RouteTimeline.css';

function getLiveStopStatus(stop) {
  if (!stop) return 'pending';
  if (stop.arrived_at && stop.departed_at) return 'departed';
  if (stop.arrived_at) return 'arrived';
  return 'pending';
}

const STATUS_LABELS = {
  pending: 'Pending',
  arrived: 'At stop',
  departed: 'Done',
};

/**
 * Build timeline points from booking state (pickup, optional stops, destination).
 */
export function buildBookingRoutePoints({ pickup, stops = [], destination }) {
  const points = [];

  if (pickup) {
    points.push({
      type: 'pickup',
      label: pickup.label || pickup.address || 'Pickup',
    });
  }

  stops.filter(Boolean).forEach((stop, index) => {
    points.push({
      type: 'stop',
      label: stop.label || stop.address || stop.location_name || `Stop ${index + 1}`,
      stopOrder: index + 1,
    });
  });

  if (destination) {
    points.push({
      type: 'destination',
      label: destination.label || destination.address || 'Destination',
    });
  }

  return points;
}

/**
 * Build timeline points from an active ride (includes stop progress).
 */
export function buildLiveRoutePoints(ride) {
  if (!ride) return [];

  const pickupLabel =
    typeof ride.pickup === 'string' ? ride.pickup : ride.pickup?.label || 'Pickup';
  const destinationLabel =
    typeof ride.destination === 'string'
      ? ride.destination
      : ride.destination?.label || 'Destination';

  const points = [{ type: 'pickup', label: pickupLabel }];
  const rideStops = Array.isArray(ride.stops)
    ? [...ride.stops].sort(
        (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
      )
    : [];

  rideStops.forEach((stop) => {
    points.push({
      type: 'stop',
      label: stop.location_name || `Stop ${stop.stop_order}`,
      stopOrder: stop.stop_order,
      status: getLiveStopStatus(stop),
    });
  });

  points.push({ type: 'destination', label: destinationLabel });
  return points;
}

/**
 * Lyft-style vertical route timeline with dot + connector spine.
 */
export default function RouteTimeline({
  points = [],
  className = '',
  compact = false,
  theme = 'light',
}) {
  if (!points.length) return null;

  return (
    <ol
      className={[
        'route-timeline',
        compact ? 'route-timeline--compact' : '',
        theme === 'dark' ? 'route-timeline--dark' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Trip route"
    >
      {points.map((point, index) => {
        const isLast = index === points.length - 1;
        const metaLabel =
          point.type === 'pickup'
            ? 'Pickup'
            : point.type === 'destination'
            ? 'Drop-off'
            : `Stop ${point.stopOrder || index}`;

        return (
          <li
            key={`${point.type}-${point.stopOrder || index}`}
            className={`route-timeline__item route-timeline__item--${point.type}${
              isLast ? ' route-timeline__item--last' : ''
            }`}
          >
            <span className="route-timeline__rail" aria-hidden="true">
              <span className="route-timeline__dot" />
              {!isLast && <span className="route-timeline__line" />}
            </span>
            <div className="route-timeline__content">
              <div className="route-timeline__meta-row">
                <span className="route-timeline__meta">{metaLabel}</span>
                {point.status && (
                  <span
                    className={`route-timeline__status route-timeline__status--${point.status}`}
                  >
                    {STATUS_LABELS[point.status] || point.status}
                  </span>
                )}
              </div>
              <span className="route-timeline__label">{point.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
