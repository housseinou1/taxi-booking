import * as fc from 'fast-check';
import { calculateFare } from './fareCalculator';
import { filterLocations } from './locationFilter';
import { isProfileComplete, canRequestRide } from './profileCheck';
import { buildRideRequest } from './buildRideRequest';
import { applyDiscount } from './discountCalculator';
import { MARKET } from '../../marketConfig';

/**
 * Property-Based Tests for Rider App Utility Functions
 * Feature: rider-app-ui-refresh
 *
 * These tests verify correctness properties across randomly generated inputs
 * using fast-check with a minimum of 100 iterations per property.
 */

const PBT_CONFIG = { numRuns: 100 };

// ─── Arbitraries ────────────────────────────────────────────────────────────────

const rideTypeArb = fc.constantFrom('regular', 'comfort', 'xl', 'share');

const positiveDistanceArb = fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true });

// ─────────────────────────────────────────────────────────────────────────────────
// Property 3: Fare calculation correctness
// Validates: Requirements 3.5
// ─────────────────────────────────────────────────────────────────────────────────

describe('Property 3: Fare calculation correctness', () => {
  it('calculateFare(rideType, distance) returns round((base + distance * perKm) * 100) / 100', () => {
    fc.assert(
      fc.property(rideTypeArb, positiveDistanceArb, (rideType, distance) => {
        const pricing = MARKET.fare[rideType];
        const expected = Math.round((pricing.base + distance * pricing.perKm) * 100) / 100;
        const result = calculateFare(rideType, distance);
        expect(result).toBe(expected);
      }),
      PBT_CONFIG
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
// Property 1: Location autocomplete filter correctness
// Validates: Requirements 2.2
// ─────────────────────────────────────────────────────────────────────────────────

describe('Property 1: Location autocomplete filter correctness', () => {
  // Generator for location objects
  const locationArb = fc.record({
    city: fc.string({ minLength: 1, maxLength: 20 }),
    label: fc.string({ minLength: 1, maxLength: 50 }),
    position: fc.tuple(
      fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
      fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })
    ),
  });

  const locationsListArb = fc.array(locationArb, { minLength: 1, maxLength: 20 });

  it('all returned locations contain the query as a case-insensitive substring', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        locationsListArb,
        (query, locations) => {
          // Pick a city that exists in the generated locations
          const city = locations[0].city;
          const results = filterLocations(query, city, locations);
          const normalizedQuery = query.trim().toLowerCase();

          // If query is empty/whitespace, skip this check (returns all in city)
          if (!normalizedQuery) return true;

          // All returned results must contain the query substring
          for (const loc of results) {
            expect(loc.label.toLowerCase()).toContain(normalizedQuery);
          }
        }
      ),
      PBT_CONFIG
    );
  });

  it('no matching location from the dataset is excluded from results', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        locationsListArb,
        (query, locations) => {
          const city = locations[0].city;
          const results = filterLocations(query, city, locations);
          const normalizedQuery = query.trim().toLowerCase();

          if (!normalizedQuery) return true;

          // Every location in the dataset that matches should be in the results
          const expectedMatches = locations.filter(
            (loc) =>
              loc.city === city &&
              loc.label.toLowerCase().includes(normalizedQuery)
          );

          expect(results.length).toBe(expectedMatches.length);

          // Each expected match should appear in results
          for (const expected of expectedMatches) {
            expect(results).toContainEqual(expected);
          }
        }
      ),
      PBT_CONFIG
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
// Property 5: Ride request availability
// Validates: Requirements 4.3
// ─────────────────────────────────────────────────────────────────────────────────

describe('Property 5: Ride request availability', () => {
  it('does not block booking based on profile photo or phone', () => {
    expect(canRequestRide()).toBe(true);
  });

  it('still reports profile completeness separately for optional UI hints', () => {
    const profileArb = fc.record({
      profile_picture: fc.oneof(fc.constant(null), fc.constant(''), fc.string({ minLength: 1 })),
      phone_number: fc.oneof(fc.constant(null), fc.constant(''), fc.string({ minLength: 1 })),
    });

    fc.assert(
      fc.property(profileArb, (profile) => {
        const hasPicture =
          profile.profile_picture != null && profile.profile_picture !== '';
        const hasPhone =
          profile.phone_number != null && profile.phone_number !== '';
        const expectedComplete = hasPicture && hasPhone;

        expect(isProfileComplete(profile)).toBe(expectedComplete);
        expect(canRequestRide()).toBe(true);
      }),
      PBT_CONFIG
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
// Property 4: Booking state to API payload transformation
// Validates: Requirements 4.1, 4.2
// ─────────────────────────────────────────────────────────────────────────────────

describe('Property 4: Booking state to API payload transformation', () => {
  const coordinateArb = fc.tuple(
    fc.double({ min: -90, max: 90, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true })
  );

  const locationObjArb = fc.record({
    label: fc.string({ minLength: 1, maxLength: 30 }),
    position: coordinateArb,
  });

  const stopsArb = fc.array(locationObjArb, { minLength: 0, maxLength: 3 });

  const bookingStateArb = fc.record({
    pickup: locationObjArb,
    destination: locationObjArb,
    stops: stopsArb,
    rideType: rideTypeArb,
    fare: fc.double({ min: 0, max: 10000, noNaN: true, noDefaultInfinity: true }),
    routeInfo: fc.record({
      distanceKm: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
      etaMinutes: fc.double({ min: 0, max: 120, noNaN: true, noDefaultInfinity: true }),
    }),
    promoCode: fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: undefined }),
  });

  it('payload contains all required fields with correct values matching booking state', () => {
    fc.assert(
      fc.property(bookingStateArb, (bookingState) => {
        const payload = buildRideRequest(bookingState);

        // Payload should not be null for valid booking states
        expect(payload).not.toBeNull();

        // Verify pickup coordinates
        expect(payload.pickup_latitude).toBe(bookingState.pickup.position[0]);
        expect(payload.pickup_longitude).toBe(bookingState.pickup.position[1]);

        // Verify destination coordinates
        expect(payload.destination_latitude).toBe(bookingState.destination.position[0]);
        expect(payload.destination_longitude).toBe(bookingState.destination.position[1]);

        // Verify stops array length matches
        expect(payload.stops).toHaveLength(bookingState.stops.length);

        // Verify each stop's coordinates
        for (let i = 0; i < bookingState.stops.length; i++) {
          expect(payload.stops[i].latitude).toBe(bookingState.stops[i].position[0]);
          expect(payload.stops[i].longitude).toBe(bookingState.stops[i].position[1]);
          expect(payload.stops[i].location_name).toBeTruthy();
          expect(payload.stops[i].stop_order).toBe(i + 1);
        }

        // Verify ride type
        expect(payload.ride_type).toBe(bookingState.rideType);

        // Verify distance
        expect(payload.distance_km).toBe(bookingState.routeInfo.distanceKm);

        // Verify fare
        expect(payload.estimated_fare).toBe(bookingState.fare);
      }),
      PBT_CONFIG
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────────
// Property 9: Discount fare computation
// Validates: Requirements 15.2, 15.4
// ─────────────────────────────────────────────────────────────────────────────────

describe('Property 9: Discount fare computation', () => {
  const fareArb = fc.double({ min: 100, max: 10000, noNaN: true, noDefaultInfinity: true });
  const percentArb = fc.integer({ min: 1, max: 100 });
  const fixedAmountArb = (maxFare) =>
    fc.double({ min: 1, max: Math.max(1, maxFare), noNaN: true, noDefaultInfinity: true });

  it('percentage discount: discounted fare matches formula and both values are present', () => {
    fc.assert(
      fc.property(fareArb, percentArb, (fare, discountPercent) => {
        const result = applyDiscount(fare, discountPercent, 0);

        // Both original and discounted values must be present
        expect(result).toHaveProperty('originalFare');
        expect(result).toHaveProperty('discountedFare');

        // Original fare should match input
        expect(result.originalFare).toBe(fare);

        // Discounted fare should match the formula
        const expectedDiscounted = Math.max(
          0,
          Math.round(fare * (1 - discountPercent / 100) * 100) / 100
        );
        expect(result.discountedFare).toBe(expectedDiscounted);
      }),
      PBT_CONFIG
    );
  });

  it('fixed amount discount: discounted fare matches formula and both values are present', () => {
    fc.assert(
      fc.property(fareArb, (fare) => {
        // Generate a fixed discount amount less than the fare
        const discountAmount = fare * 0.5; // Use half the fare as a safe discount amount
        const result = applyDiscount(fare, 0, discountAmount);

        // Both values must be present
        expect(result).toHaveProperty('originalFare');
        expect(result).toHaveProperty('discountedFare');

        // Original fare should match input
        expect(result.originalFare).toBe(fare);

        // Discounted fare = originalFare - discountAmount, floored at 0
        const expectedDiscounted = Math.max(
          0,
          Math.round((fare - discountAmount) * 100) / 100
        );
        expect(result.discountedFare).toBe(expectedDiscounted);
      }),
      PBT_CONFIG
    );
  });

  it('discounted fare is never negative', () => {
    fc.assert(
      fc.property(
        fareArb,
        fc.integer({ min: 0, max: 100 }),
        fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }),
        (fare, percent, amount) => {
          const result = applyDiscount(fare, percent, amount);
          expect(result.discountedFare).toBeGreaterThanOrEqual(0);
        }
      ),
      PBT_CONFIG
    );
  });
});
