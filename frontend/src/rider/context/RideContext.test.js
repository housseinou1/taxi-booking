import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { RideProvider, useRide, rideReducer, initialState } from './RideContext';

// Test helper component to exercise the hook
function TestConsumer({ action }) {
  const { state, dispatch } = useRide();
  return (
    <div>
      <span data-testid="city">{state.city}</span>
      <span data-testid="stops">{state.stops.length}</span>
      <span data-testid="bookingStep">{state.bookingStep}</span>
      <span data-testid="loading">{String(state.loading)}</span>
      <span data-testid="rideType">{state.rideType}</span>
      <span data-testid="fare">{state.fare}</span>
      <button onClick={() => dispatch(action)}>dispatch</button>
    </div>
  );
}

describe('RideContext', () => {
  describe('initialState', () => {
    it('has Nouakchott as default city', () => {
      expect(initialState.city).toBe('Nouakchott');
    });

    it('has null pickup and destination', () => {
      expect(initialState.pickup).toBeNull();
      expect(initialState.destination).toBeNull();
    });

    it('has empty stops array', () => {
      expect(initialState.stops).toEqual([]);
    });

    it('has regular as default rideType', () => {
      expect(initialState.rideType).toBe('regular');
    });

    it('has idle bookingStep', () => {
      expect(initialState.bookingStep).toBe('idle');
    });

    it('has collapsed bottomSheetState', () => {
      expect(initialState.bottomSheetState).toBe('collapsed');
    });

    it('has loading false and error null', () => {
      expect(initialState.loading).toBe(false);
      expect(initialState.error).toBeNull();
    });
  });

  describe('rideReducer', () => {
    it('handles SET_PICKUP', () => {
      const location = { label: 'Sebkha', position: [18.0735, -15.9582], city: 'Nouakchott' };
      const result = rideReducer(initialState, { type: 'SET_PICKUP', payload: location });
      expect(result.pickup).toEqual(location);
    });

    it('handles SET_DESTINATION', () => {
      const location = { label: 'Ksar', position: [18.1002, -15.9631], city: 'Nouakchott' };
      const result = rideReducer(initialState, { type: 'SET_DESTINATION', payload: location });
      expect(result.destination).toEqual(location);
    });

    it('handles ADD_STOP up to max 3', () => {
      const stop1 = { label: 'Stop 1', position: [18.0, -15.9], city: 'Nouakchott' };
      const stop2 = { label: 'Stop 2', position: [18.1, -15.8], city: 'Nouakchott' };
      const stop3 = { label: 'Stop 3', position: [18.2, -15.7], city: 'Nouakchott' };
      const stop4 = { label: 'Stop 4', position: [18.3, -15.6], city: 'Nouakchott' };

      let state = rideReducer(initialState, { type: 'ADD_STOP', payload: stop1 });
      expect(state.stops).toHaveLength(1);

      state = rideReducer(state, { type: 'ADD_STOP', payload: stop2 });
      expect(state.stops).toHaveLength(2);

      state = rideReducer(state, { type: 'ADD_STOP', payload: stop3 });
      expect(state.stops).toHaveLength(3);

      // 4th stop should be rejected
      state = rideReducer(state, { type: 'ADD_STOP', payload: stop4 });
      expect(state.stops).toHaveLength(3);
      expect(state.stops[2]).toEqual(stop3); // last stop is still stop3
    });

    it('enforces stops max-3 invariant - returns same state reference', () => {
      const stop = { label: 'Stop', position: [18.0, -15.9], city: 'Nouakchott' };
      let state = initialState;
      state = rideReducer(state, { type: 'ADD_STOP', payload: stop });
      state = rideReducer(state, { type: 'ADD_STOP', payload: stop });
      state = rideReducer(state, { type: 'ADD_STOP', payload: stop });

      const stateBeforeReject = state;
      const stateAfterReject = rideReducer(state, { type: 'ADD_STOP', payload: stop });
      expect(stateAfterReject).toBe(stateBeforeReject);
    });

    it('handles REMOVE_STOP', () => {
      const stop1 = { label: 'Stop 1', position: [18.0, -15.9], city: 'Nouakchott' };
      const stop2 = { label: 'Stop 2', position: [18.1, -15.8], city: 'Nouakchott' };
      let state = rideReducer(initialState, { type: 'ADD_STOP', payload: stop1 });
      state = rideReducer(state, { type: 'ADD_STOP', payload: stop2 });
      state = rideReducer(state, { type: 'REMOVE_STOP', payload: 0 });
      expect(state.stops).toHaveLength(1);
      expect(state.stops[0]).toEqual(stop2);
    });

    it('handles SET_RIDE_TYPE', () => {
      const result = rideReducer(initialState, { type: 'SET_RIDE_TYPE', payload: 'comfort' });
      expect(result.rideType).toBe('comfort');
    });

    it('handles SET_ROUTE', () => {
      const route = { points: [[18.0, -15.9], [18.1, -15.8]], distanceKm: 5, etaMinutes: 10 };
      const result = rideReducer(initialState, { type: 'SET_ROUTE', payload: route });
      expect(result.routeInfo).toEqual(route);
      expect(result.routePath).toEqual(route.points);
    });

    it('handles SET_FARE', () => {
      const result = rideReducer(initialState, { type: 'SET_FARE', payload: { fare: 500, discountedFare: 400 } });
      expect(result.fare).toBe(500);
      expect(result.discountedFare).toBe(400);
    });

    it('handles SET_PROMO', () => {
      const result = rideReducer(initialState, { type: 'SET_PROMO', payload: 'YALA50' });
      expect(result.promoCode).toBe('YALA50');
    });

    it('handles REQUEST_RIDE', () => {
      const result = rideReducer(initialState, { type: 'REQUEST_RIDE' });
      expect(result.loading).toBe(true);
      expect(result.error).toBeNull();
      expect(result.bookingStep).toBe('searching');
    });

    it('handles RIDE_ACCEPTED', () => {
      const ride = { id: 1, status: 'accepted', driver_name: 'Ahmed', vehicle: 'Toyota', plate_number: 'ABC123', pickup: null, destination: null, stops: [], fare: 500, pin_code: '1234' };
      const stateSearching = { ...initialState, loading: true, bookingStep: 'searching' };
      const result = rideReducer(stateSearching, { type: 'RIDE_ACCEPTED', payload: ride });
      expect(result.currentRide).toEqual(ride);
      expect(result.loading).toBe(false);
      expect(result.bookingStep).toBe('tracking');
    });

    it('handles RIDE_UPDATE', () => {
      const ride = { id: 1, status: 'accepted', driver_name: 'Ahmed', vehicle: 'Toyota', plate_number: 'ABC123', pickup: null, destination: null, stops: [], fare: 500, pin_code: '1234' };
      const stateWithRide = { ...initialState, currentRide: ride };
      const result = rideReducer(stateWithRide, { type: 'RIDE_UPDATE', payload: { status: 'in_progress' } });
      expect(result.currentRide.status).toBe('in_progress');
      expect(result.currentRide.driver_name).toBe('Ahmed');
    });

    it('handles RIDE_UPDATE when no current ride', () => {
      const result = rideReducer(initialState, { type: 'RIDE_UPDATE', payload: { status: 'in_progress' } });
      expect(result.currentRide).toBeNull();
    });

    it('handles DRIVER_POSITION', () => {
      const result = rideReducer(initialState, { type: 'DRIVER_POSITION', payload: [18.1, -15.9] });
      expect(result.driverPosition).toEqual([18.1, -15.9]);
    });

    it('handles RIDE_COMPLETED', () => {
      const stateTracking = { ...initialState, currentRide: { id: 1 }, driverPosition: [18.0, -15.9], bookingStep: 'tracking' };
      const result = rideReducer(stateTracking, { type: 'RIDE_COMPLETED', payload: { fare: 500 } });
      expect(result.currentRide).toEqual({ id: 1, fare: 500, status: 'completed' });
      expect(result.driverPosition).toBeNull();
      expect(result.bookingStep).toBe('tracking');
    });

    it('handles RIDE_CANCELLED', () => {
      const stateTracking = { ...initialState, currentRide: { id: 1 }, driverPosition: [18.0, -15.9], loading: true, bookingStep: 'tracking' };
      const result = rideReducer(stateTracking, { type: 'RIDE_CANCELLED' });
      expect(result.currentRide).toBeNull();
      expect(result.driverPosition).toBeNull();
      expect(result.loading).toBe(false);
      expect(result.bookingStep).toBe('idle');
      expect(result.bottomSheetState).toBe('collapsed');
    });

    it('handles SET_BOOKING_STEP', () => {
      const result = rideReducer(initialState, { type: 'SET_BOOKING_STEP', payload: 'confirm' });
      expect(result.bookingStep).toBe('confirm');
    });

    it('handles SET_ERROR', () => {
      const result = rideReducer({ ...initialState, loading: true }, { type: 'SET_ERROR', payload: 'Something went wrong' });
      expect(result.error).toBe('Something went wrong');
      expect(result.loading).toBe(false);
    });

    it('handles SET_ERROR with null to clear', () => {
      const stateWithError = { ...initialState, error: 'Previous error' };
      const result = rideReducer(stateWithError, { type: 'SET_ERROR', payload: null });
      expect(result.error).toBeNull();
    });

    it('handles RESET_BOOKING', () => {
      const dirtyState = {
        ...initialState,
        pickup: { label: 'A', position: [18, -15], city: 'Nouakchott' },
        destination: { label: 'B', position: [18.1, -15.1], city: 'Nouakchott' },
        stops: [{ label: 'C', position: [18.05, -15.05], city: 'Nouakchott' }],
        rideType: 'xl',
        fare: 1000,
        discountedFare: 800,
        promoCode: 'CODE',
        routePath: [[18, -15], [18.1, -15.1]],
        routeInfo: { points: [], distanceKm: 5, etaMinutes: 10 },
        bookingStep: 'confirm',
        bottomSheetState: 'full',
        loading: true,
        error: 'test',
      };
      const result = rideReducer(dirtyState, { type: 'RESET_BOOKING' });
      expect(result.pickup).toBeNull();
      expect(result.destination).toBeNull();
      expect(result.stops).toEqual([]);
      expect(result.rideType).toBe('regular');
      expect(result.fare).toBe(0);
      expect(result.discountedFare).toBeUndefined();
      expect(result.promoCode).toBeUndefined();
      expect(result.routePath).toEqual([]);
      expect(result.routeInfo).toBeNull();
      expect(result.bookingStep).toBe('idle');
      expect(result.bottomSheetState).toBe('collapsed');
      expect(result.loading).toBe(false);
      expect(result.error).toBeNull();
      // city should be preserved
      expect(result.city).toBe('Nouakchott');
    });

    it('returns current state for unknown action', () => {
      const result = rideReducer(initialState, { type: 'UNKNOWN_ACTION' });
      expect(result).toBe(initialState);
    });
  });

  describe('RideProvider and useRide hook', () => {
    it('provides initial state via the hook', () => {
      render(
        <RideProvider>
          <TestConsumer action={{ type: 'SET_PICKUP', payload: null }} />
        </RideProvider>
      );
      expect(screen.getByTestId('city').textContent).toBe('Nouakchott');
      expect(screen.getByTestId('stops').textContent).toBe('0');
      expect(screen.getByTestId('bookingStep').textContent).toBe('idle');
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('rideType').textContent).toBe('regular');
      expect(screen.getByTestId('fare').textContent).toBe('0');
    });

    it('throws when useRide is used outside of RideProvider', () => {
      // Suppress console.error for this test
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => {
        render(<TestConsumer action={{ type: 'SET_PICKUP', payload: null }} />);
      }).toThrow('useRide must be used within a RideProvider');
      spy.mockRestore();
    });
  });
});
