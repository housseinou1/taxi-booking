import React, { createContext, useContext, useReducer } from 'react';

// Initial state matching the RideState interface
const initialState = {
  // Booking state
  city: 'Nouakchott',
  pickup: null,
  destination: null,
  stops: [],                    // max 3 intermediate stops
  rideType: 'regular',
  fare: 0,
  discountedFare: undefined,
  promoCode: undefined,
  routePath: [],
  routeInfo: null,

  // Active ride state
  currentRide: null,
  driverPosition: null,

  // UI state
  bookingStep: 'idle',
  bottomSheetState: 'collapsed',
  loading: false,
  error: null,
};

// Reducer handling all RideAction types
function rideReducer(state, action) {
  switch (action.type) {
    case 'SET_PICKUP':
      return { ...state, pickup: action.payload };

    case 'SET_DESTINATION':
      return { ...state, destination: action.payload };

    case 'ADD_STOP':
      // Enforce max 3 stops invariant
      if (state.stops.length >= 3) {
        return state;
      }
      return { ...state, stops: [...state.stops, action.payload] };

    case 'REMOVE_STOP':
      return {
        ...state,
        stops: state.stops.filter((_, index) => index !== action.payload),
      };

    case 'UPDATE_STOP':
      return {
        ...state,
        stops: state.stops.map((stop, index) =>
          index === action.payload.index ? action.payload.stop : stop
        ),
      };

    case 'SET_RIDE_TYPE':
      return { ...state, rideType: action.payload };

    case 'SET_ROUTE':
      return {
        ...state,
        routeInfo: action.payload,
        routePath: action.payload.points,
      };

    case 'SET_FARE':
      return {
        ...state,
        fare: action.payload.fare,
        discountedFare: action.payload.discountedFare,
      };

    case 'SET_PROMO':
      return { ...state, promoCode: action.payload };

    case 'REQUEST_RIDE':
      return {
        ...state,
        loading: true,
        error: null,
        bookingStep: 'searching',
      };

    case 'RIDE_ACCEPTED':
      return {
        ...state,
        currentRide: action.payload,
        loading: false,
        bookingStep: 'tracking',
      };

    case 'RIDE_UPDATE':
      return {
        ...state,
        currentRide: state.currentRide
          ? { ...state.currentRide, ...action.payload }
          : null,
      };

    case 'DRIVER_POSITION':
      return { ...state, driverPosition: action.payload };

    case 'RIDE_COMPLETED':
      return {
        ...state,
        currentRide: state.currentRide
          ? { ...state.currentRide, ...action.payload, status: 'completed' }
          : null,
        driverPosition: null,
        loading: false,
        bookingStep: state.currentRide ? 'completed' : 'idle',
      };

    case 'RESET_RIDE':
      return {
        ...state,
        currentRide: null,
        driverPosition: null,
        routePath: [],
        routeInfo: null,
        loading: false,
        bookingStep: 'idle',
        bottomSheetState: 'collapsed',
      };

    case 'RIDE_CANCELLED':
      return {
        ...state,
        currentRide: null,
        driverPosition: null,
        routePath: [],
        routeInfo: null,
        pickup: null,
        destination: null,
        stops: [],
        fare: 0,
        discountedFare: undefined,
        promoCode: undefined,
        loading: false,
        bookingStep: 'idle',
        bottomSheetState: 'collapsed',
      };

    case 'SET_BOOKING_STEP':
      return { ...state, bookingStep: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    case 'RESET_BOOKING':
      return {
        ...state,
        pickup: null,
        destination: null,
        stops: [],
        rideType: 'regular',
        fare: 0,
        discountedFare: undefined,
        promoCode: undefined,
        routePath: [],
        routeInfo: null,
        bookingStep: 'idle',
        bottomSheetState: 'collapsed',
        loading: false,
        error: null,
      };

    default:
      return state;
  }
}

// Create context
const RideContext = createContext(undefined);

// Provider component
function RideProvider({ children }) {
  const [state, dispatch] = useReducer(rideReducer, initialState);

  return (
    <RideContext.Provider value={{ state, dispatch }}>
      {children}
    </RideContext.Provider>
  );
}

// Custom hook for consuming the context
function useRide() {
  const context = useContext(RideContext);
  if (context === undefined) {
    throw new Error('useRide must be used within a RideProvider');
  }
  return context;
}

export { RideContext, RideProvider, useRide, rideReducer, initialState };
