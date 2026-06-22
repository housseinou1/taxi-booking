import { buildRideRequest } from './buildRideRequest';

describe('buildRideRequest', () => {
  const validState = {
    pickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
    destination: { label: 'Toujounine', position: [18.0896, -15.9754] },
    stops: [
      { label: 'Ksar', position: [18.1002, -15.9631] },
    ],
    rideType: 'regular',
    fare: 300,
    routeInfo: { distanceKm: 5, etaMinutes: 10 },
    promoCode: 'YALA20',
  };

  it('transforms valid booking state into API payload', () => {
    const payload = buildRideRequest(validState);
    expect(payload).toEqual({
      pickup_latitude: 18.0735,
      pickup_longitude: -15.9582,
      pickup_address: 'Sebkha',
      destination_latitude: 18.0896,
      destination_longitude: -15.9754,
      destination_address: 'Toujounine',
      stops: [{
        latitude: 18.1002,
        longitude: -15.9631,
        location_name: 'Ksar',
        stop_order: 1,
      }],
      ride_type: 'regular',
      distance_km: 5,
      estimated_fare: 300,
      promo_code: 'YALA20',
    });
  });

  it('omits promo_code when not provided', () => {
    const state = { ...validState, promoCode: undefined };
    const payload = buildRideRequest(state);
    expect(payload.promo_code).toBeUndefined();
  });

  it('handles empty stops array', () => {
    const state = { ...validState, stops: [] };
    const payload = buildRideRequest(state);
    expect(payload.stops).toEqual([]);
  });

  it('handles multiple stops', () => {
    const state = {
      ...validState,
      stops: [
        { label: 'Stop1', position: [18.05, -15.95] },
        { label: 'Stop2', position: [18.06, -15.96] },
        { label: 'Stop3', position: [18.07, -15.97] },
      ],
    };
    const payload = buildRideRequest(state);
    expect(payload.stops).toHaveLength(3);
  });

  it('ignores stops without coordinates', () => {
    const state = {
      ...validState,
      stops: [
        { label: 'Incomplete', position: null },
        { label: 'Stop2', position: [18.06, -15.96] },
      ],
    };
    const payload = buildRideRequest(state);
    expect(payload.stops).toHaveLength(1);
    expect(payload.stops[0].location_name).toBe('Stop2');
  });

  it('returns null when booking state is null', () => {
    expect(buildRideRequest(null)).toBeNull();
  });

  it('returns null when pickup is missing', () => {
    const state = { ...validState, pickup: null };
    expect(buildRideRequest(state)).toBeNull();
  });

  it('returns null when destination is missing', () => {
    const state = { ...validState, destination: null };
    expect(buildRideRequest(state)).toBeNull();
  });

  it('returns null when rideType is missing', () => {
    const state = { ...validState, rideType: null };
    expect(buildRideRequest(state)).toBeNull();
  });

  it('defaults distance_km to 0 when routeInfo is missing', () => {
    const state = { ...validState, routeInfo: null };
    const payload = buildRideRequest(state);
    expect(payload.distance_km).toBe(0);
  });

  it('defaults estimated_fare to 0 when fare is missing', () => {
    const state = { ...validState, fare: undefined };
    const payload = buildRideRequest(state);
    expect(payload.estimated_fare).toBe(0);
  });
});
