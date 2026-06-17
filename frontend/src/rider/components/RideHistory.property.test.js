import React from 'react';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import { sortTripsByDate } from './RideHistory';
import TripCard from './TripCard';

/**
 * Feature: rider-app-ui-refresh
 * Property 8: Ride history sort order
 * Property 10: Trip card content completeness
 */

// --- Arbitraries / Generators ---

/** Generate a random ISO date string within a reasonable range */
const arbDateString = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2030-12-31T23:59:59Z'),
}).map((d) => d.toISOString());

const arbRideType = fc.constantFrom('regular', 'comfort', 'xl', 'share');

const arbStatus = fc.constantFrom(
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
  'completed',
  'cancelled'
);

/** Generate a random trip summary object with all required fields */
const arbTripSummary = fc.record({
  id: fc.nat({ max: 100000 }),
  date: arbDateString,
  pickup_address: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  destination_address: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
  fare: fc.integer({ min: 100, max: 50000 }),
  ride_type: arbRideType,
  status: arbStatus,
});

/** Generate a list of trip summaries with unique ids */
const arbTripList = fc.array(arbTripSummary, { minLength: 1, maxLength: 30 }).map((trips) =>
  trips.map((trip, idx) => ({ ...trip, id: idx + 1 }))
);

// --- Property 8: Ride history sort order ---

describe('Feature: rider-app-ui-refresh, Property 8: Ride history sort order', () => {
  /**
   * **Validates: Requirements 8.1**
   *
   * For any list of trip records with date fields, the rendered ride history
   * SHALL display trips in strictly descending chronological order (most recent first).
   */
  it('sortTripsByDate produces strictly descending chronological order', () => {
    fc.assert(
      fc.property(arbTripList, (trips) => {
        const sorted = sortTripsByDate(trips);

        // Verify length is preserved (no trips lost or added)
        expect(sorted.length).toBe(trips.length);

        // Verify strictly descending chronological order
        for (let i = 0; i < sorted.length - 1; i++) {
          const currentDate = new Date(sorted[i].date).getTime();
          const nextDate = new Date(sorted[i + 1].date).getTime();
          expect(currentDate).toBeGreaterThanOrEqual(nextDate);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('sortTripsByDate does not mutate the original array', () => {
    fc.assert(
      fc.property(arbTripList, (trips) => {
        const originalCopy = [...trips];
        sortTripsByDate(trips);
        expect(trips).toEqual(originalCopy);
      }),
      { numRuns: 100 }
    );
  });
});

// --- Property 10: Trip card content completeness ---

describe('Feature: rider-app-ui-refresh, Property 10: Trip card content completeness', () => {
  /**
   * **Validates: Requirements 8.2**
   *
   * For any valid trip summary object containing date, pickup_address,
   * destination_address, fare, ride_type, and status, the rendered TripCard
   * SHALL include all six data fields in its output.
   */
  it('TripCard renders all six required data fields', () => {
    fc.assert(
      fc.property(arbTripSummary, (trip) => {
        // Ensure unique id for each render
        const tripWithId = { ...trip, id: 1 };

        const { container } = render(
          <TripCard trip={tripWithId} onExpand={() => {}} expanded={false} />
        );

        // Use textContent to avoid HTML entity encoding issues (e.g., & → &amp;)
        const textContent = container.textContent;

        // 1. Date: TripCard formats the date via formatTripDate, verify it renders
        const dateElement = container.querySelector('.trip-card__date');
        expect(dateElement).not.toBeNull();
        expect(dateElement.textContent.length).toBeGreaterThan(0);

        // 2. Pickup address
        expect(textContent).toContain(trip.pickup_address);

        // 3. Destination address
        expect(textContent).toContain(trip.destination_address);

        // 4. Fare: formatFare produces "X MRU"
        const expectedFare = `${Math.round(trip.fare)} MRU`;
        expect(textContent).toContain(expectedFare);

        // 5. Ride type
        expect(textContent).toContain(trip.ride_type);

        // 6. Status: Rendered as a human-readable label
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
        const expectedStatus = STATUS_LABELS[trip.status] || trip.status;
        expect(textContent).toContain(expectedStatus);
      }),
      { numRuns: 100 }
    );
  });
});
