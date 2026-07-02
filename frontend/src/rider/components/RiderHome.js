import React, { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useRide } from '../context/RideContext';
import MapView from './MapView';
import BottomSheet from './BottomSheet';
import ServiceHub from './ServiceHub';
import LocationInput from './LocationInput';
import RideTypeSelector from './RideTypeSelector';
import BookingConfirmation from './BookingConfirmation';
import RideTracker from './RideTracker';
import RideChat from '../../components/RideChat';
import SafetyEmergencyPanel from '../../safety/SafetyEmergencyPanel';
import RiderHamburgerMenu from './RiderHamburgerMenu';
import wsService from '../services/wsService';
import routeService from '../services/routeService';
import apiService from '../services/apiService';
import { calculateFare } from '../utils/fareCalculator';
import { buildRideRequest } from '../utils/buildRideRequest';
import { fetchLegalStatus, acceptRideLegal } from '../../legal/legalApi';
import { redirectIfLegalResignRequired } from '../../legal/legalVersionGate';
import { useRiderLegalAcceptance } from '../../legal/components/RiderTermsAcceptance';
import { MARKET } from '../../marketConfig';
import RouteTimeline, { buildBookingRoutePoints } from '../../components/RouteTimeline';
import { getNextPendingStop } from '../../driver/components/MultiStopProgress';
import './RiderHome.css';

const ACTIVE_RIDE_STATUSES = new Set([
  'requested',
  'pending',
  'accepted',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
]);

const RIDE_TYPE_LABELS = {
  regular: 'Regular',
  comfort: 'Comfort',
  xl: 'XL',
  share: 'Share',
};
const MAX_STOPS = 3;

function hasValidLocation(location) {
  return (
    location &&
    Array.isArray(location.position) &&
    location.position.length === 2 &&
    Number.isFinite(Number(location.position[0])) &&
    Number.isFinite(Number(location.position[1]))
  );
}

function RouteSummary({ pickup, destination, stops, onEdit, onAddStop, canAddStop }) {
  const routePoints = buildBookingRoutePoints({ pickup, stops, destination });

  return (
    <div className="rider-home__route-summary">
      <div className="rider-home__route-summary-header">
        <span>Your route</span>
        <button type="button" className="rider-home__route-edit" onClick={onEdit}>
          Edit
        </button>
      </div>
      <RouteTimeline points={routePoints} compact />
      {canAddStop && onAddStop && (
        <button type="button" className="rider-home__add-stop-btn" onClick={onAddStop}>
          + Add stop
        </button>
      )}
    </div>
  );
}

function getDriverPositionFromRide(ride) {
  const lat = Number(ride?.driver_current_lat);
  const lng = Number(ride?.driver_current_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function getCoordinatePair(lat, lng) {
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  return Number.isFinite(parsedLat) && Number.isFinite(parsedLng)
    ? [parsedLat, parsedLng]
    : null;
}

/**
 * RiderHome — composes MapView + BottomSheet + ServiceHub into the main rider experience.
 *
 * Manages booking step transitions via RideContext:
 *   idle → ServiceHub (collapsed)
 *   location → LocationInput (full)
 *   rideType → RideTypeSelector (half)
 *   confirm → BookingConfirmation (half)
 *   tracking → RideTracker (half)
 */
function RiderHome() {
  const { t } = useTranslation();
  const { state, dispatch } = useRide();
  const [profile, setProfile] = useState(null);
  const [promoError, setPromoError] = useState(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [mapSelectionTarget, setMapSelectionTarget] = useState(null);
  const [locationMessage, setLocationMessage] = useState('');
  const [showAddStopInput, setShowAddStopInput] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showSafety, setShowSafety] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [legalCompliant, setLegalCompliant] = useState(false);
  const [requiresResign, setRequiresResign] = useState(false);
  const {
    termsChecked,
    privacyChecked,
    allAccepted: legalAccepted,
    setTermsChecked,
    setPrivacyChecked,
  } = useRiderLegalAcceptance();
  const savedIntentHandledRef = useRef(false);
  const addStopInputRef = useRef(null);
  const currentRideIdRef = useRef(null);

  const {
    city,
    pickup,
    destination,
    stops,
    rideType,
    fare,
    discountedFare,
    promoCode,
    routePath,
    routeInfo,
    currentRide,
    driverPosition,
    bookingStep,
    loading,
    error,
  } = state;

  // ─── Default map center ────────────────────────────────────────────
  const defaultCenter = useMemo(() => {
    const defaultLocation = MARKET.defaultPickup;
    return defaultLocation?.position || [18.0735, -15.9582];
  }, []);

  const mapCenter = useMemo(() => {
    if (pickup) return pickup.position;
    return defaultCenter;
  }, [pickup, defaultCenter]);

  // ─── Map markers ───────────────────────────────────────────────────
  const markers = useMemo(() => {
    const result = [];

    if (pickup) {
      result.push({
        id: 'pickup',
        position: pickup.position,
        type: 'pickup',
        label: pickup.label,
      });
    }

    if (destination) {
      result.push({
        id: 'destination',
        position: destination.position,
        type: 'destination',
        label: destination.label,
      });
    }

    stops.forEach((stop, index) => {
      if (stop) {
        result.push({
          id: `stop-${index}`,
          position: stop.position,
          type: 'stop',
          label: stop.label,
        });
      }
    });

    if (driverPosition) {
      result.push({
        id: 'driver',
        position: driverPosition,
        type: 'driver',
        label: t('riderHome.driver', 'Driver'),
        animate: true,
      });
    }

    return result;
  }, [pickup, destination, stops, driverPosition, t]);

  const fitBounds = markers.length >= 2;
  currentRideIdRef.current = currentRide?.id || null;

  const refreshActiveRide = useCallback(
    async (rideId = null) => {
      try {
        const targetRideId = rideId ?? currentRideIdRef.current;
        let activeRide = null;

        if (targetRideId) {
          try {
            activeRide = await apiService.getRideById(targetRideId);
          } catch (detailError) {
            activeRide = await apiService.getActiveRide();
          }
        } else {
          activeRide = await apiService.getActiveRide();
        }

        if (!activeRide) {
          return;
        }

        if (!targetRideId || String(activeRide.id) === String(targetRideId)) {
          dispatch({ type: 'RIDE_ACCEPTED', payload: activeRide });
          const initialDriverPosition = getDriverPositionFromRide(activeRide);
          if (initialDriverPosition) {
            dispatch({ type: 'DRIVER_POSITION', payload: initialDriverPosition });
          }
        }
      } catch (err) {
        // Keep the last known ride state if refresh fails.
      }
    },
    [dispatch]
  );
  const trackingRoutePath = useMemo(() => {
    if (bookingStep !== 'tracking' || !currentRide || !driverPosition) {
      return [];
    }

    let target;
    if (currentRide.status === 'in_progress') {
      const nextStop = getNextPendingStop(currentRide.stops || []);
      target = nextStop
        ? getCoordinatePair(nextStop.latitude, nextStop.longitude)
        : getCoordinatePair(currentRide.destination_lat, currentRide.destination_lng) ||
          currentRide.destination?.position;
    } else {
      target =
        getCoordinatePair(currentRide.pickup_lat, currentRide.pickup_lng) ||
        currentRide.pickup?.position;
    }

    return Array.isArray(target) ? [driverPosition, target] : [];
  }, [bookingStep, currentRide, driverPosition]);
  const displayRoutePath = trackingRoutePath.length >= 2 ? trackingRoutePath : routePath;

  // ─── Fetch rider profile on mount ──────────────────────────────────
  useEffect(() => {
    async function fetchProfile() {
      try {
        const data = await apiService.getRiderProfile();
        setProfile(data);
      } catch (err) {
        // Non-critical: profile check will fail gracefully
      }
    }
    fetchProfile();
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('access')) return undefined;
    fetchLegalStatus()
      .then((data) => {
        if (redirectIfLegalResignRequired(data, 'ride', '/rider-dashboard')) {
          return;
        }
        const ride = data?.ride || data?.rider;
        const compliant = Boolean(ride?.compliance_current);
        const resign = Boolean(ride?.requires_resign);
        setLegalCompliant(compliant);
        setRequiresResign(resign);
        if (compliant) {
          setTermsChecked(true);
          setPrivacyChecked(true);
        } else if (resign) {
          setTermsChecked(false);
          setPrivacyChecked(false);
        }
      })
      .catch(() => {});
    return undefined;
  }, [setTermsChecked, setPrivacyChecked]);

  // ─── WebSocket subscriptions for ride updates ──────────────────────
  useEffect(() => {
    const unsubRide = wsService.subscribeRideUpdates(async (data) => {
      if (data.status === 'completed') {
        dispatch({ type: 'RIDE_COMPLETED', payload: data });
        return;
      }

      if (data.status === 'cancelled') {
        dispatch({ type: 'RIDE_CANCELLED' });
        return;
      }

      if (!data.ride_id) {
        return;
      }

      const trackingRideId = currentRideIdRef.current;
      if (trackingRideId && String(data.ride_id) !== String(trackingRideId)) {
        return;
      }

      const updatePayload = {};
      if (data.status) updatePayload.status = data.status;
      if (data.eta_minutes != null) updatePayload.eta_minutes = data.eta_minutes;
      if (Array.isArray(data.stops)) updatePayload.stops = data.stops;

      if (Object.keys(updatePayload).length > 0) {
        dispatch({
          type: 'RIDE_UPDATE',
          payload: updatePayload,
        });
      }

      await refreshActiveRide(data.ride_id);
    });

    return unsubRide;
  }, [dispatch, refreshActiveRide]);

  useEffect(() => {
    if (bookingStep !== 'tracking' || !currentRide?.id) {
      return undefined;
    }

    wsService.joinRideGroup(currentRide.id);

    return () => {
      wsService.leaveRideGroup(currentRide.id);
    };
  }, [bookingStep, currentRide?.id]);

  // Poll ride details while tracking so status changes are not missed.
  useEffect(() => {
    if (bookingStep !== 'tracking' || !currentRide?.id) {
      return undefined;
    }

    if (!ACTIVE_RIDE_STATUSES.has(currentRide.status)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshActiveRide(currentRide.id);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [bookingStep, currentRide?.id, currentRide?.status, refreshActiveRide]);

  // Subscribe to driver position when ride is active
  useEffect(() => {
    if (!currentRide?.id) return;

    const unsubPos = wsService.subscribeDriverPosition(
      currentRide.id,
      (pos) => {
        dispatch({ type: 'DRIVER_POSITION', payload: pos });
      }
    );

    return unsubPos;
  }, [currentRide?.id, dispatch]);

  // ─── Check for active ride on mount ────────────────────────────────
  useEffect(() => {
    refreshActiveRide();
  }, [refreshActiveRide]);

  // ─── Fetch route when pickup and destination are set ───────────────
  useEffect(() => {
    if (!pickup || !destination) return;

    async function fetchRoute() {
      const waypoints = [
        pickup.position,
        ...stops.filter((stop) => stop?.position).map((stop) => stop.position),
        destination.position,
      ];

      const route = await routeService.getRoute(waypoints);
      if (route) {
        dispatch({ type: 'SET_ROUTE', payload: route });
        // Calculate fare based on route distance
        const calculatedFare = calculateFare(rideType, route.distanceKm);
        dispatch({
          type: 'SET_FARE',
          payload: { fare: calculatedFare, discountedFare: undefined },
        });
      }
    }

    fetchRoute();
  }, [pickup, destination, stops, rideType, dispatch]);

  // ─── Bottom sheet state management ─────────────────────────────────
  const handleSheetStateChange = useCallback(
    (newState) => {
      if (newState === 'collapsed' && bookingStep === 'location' && !pickup && !destination) {
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'idle' });
      }
    },
    [bookingStep, dispatch, destination, pickup]
  );

  // Derive bottom sheet state from booking step
  const derivedSheetState = useMemo(() => {
    switch (bookingStep) {
      case 'idle':
        return 'collapsed';
      case 'location':
        return 'full';
      case 'rideType':
        return 'half';
      case 'confirm':
      case 'searching':
        return 'full';
      case 'tracking':
        return 'half';
      default:
        return 'collapsed';
    }
  }, [bookingStep]);

  // ─── Navigation handler for ServiceHub ─────────────────────────────
  const handleNavigate = useCallback((path) => {
    window.location.href = path;
  }, []);

  const handleLogout = useCallback(() => {
    [
      "access",
      "refresh",
      "user",
      "selectedRideId",
      "needs_payment_setup",
      "needs_vehicle_setup",
      "sx_login_redirect",
      "yala_next_place",
    ].forEach((key) => localStorage.removeItem(key));

    window.location.replace(`/login?logout=${Date.now()}`);
  }, []);

  // ─── Booking flow handlers ─────────────────────────────────────────
  const handleDestinationFocus = useCallback(() => {
    dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
  }, [dispatch]);

  const handleBookRideFromMenu = useCallback(() => {
    handleDestinationFocus();
  }, [handleDestinationFocus]);

  const riderInitial = (profile?.first_name || 'R').slice(0, 1).toUpperCase();

  const savedPlaces = useMemo(
    () => [
      { key: 'home', label: 'Home', position: [18.0735, -15.9582] },
      { key: 'work', label: 'Work', position: [18.1002, -15.9631] },
      { key: 'favorite', label: 'Favorite', position: [18.1194, -16.0019] },
      { key: 'recent', label: 'Recent', position: [18.0896, -15.9754] },
    ],
    []
  );

  // Apply saved place intent from SavedPlaces page once per mount.
  useEffect(() => {
    if (savedIntentHandledRef.current) return;
    savedIntentHandledRef.current = true;

    const rawIntent = localStorage.getItem('yala_next_place');
    if (!rawIntent) return;

    try {
      const place = JSON.parse(rawIntent);
      const target = place?.target === 'pickup' ? 'pickup' : 'destination';
      const fallbackLabel = target === 'pickup' ? 'Saved pickup' : 'Saved destination';
      const resolvedPosition = Array.isArray(place?.position)
        ? place.position
        : null;

      if (!resolvedPosition || resolvedPosition.length < 2) {
        localStorage.removeItem('yala_next_place');
        return;
      }

      const selectedLocation = {
        label: place?.location || place?.label || fallbackLabel,
        position: resolvedPosition,
        city: place?.city || city,
      };

      if (target === 'pickup') {
        dispatch({ type: 'SET_PICKUP', payload: selectedLocation });
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
      } else {
        dispatch({ type: 'SET_DESTINATION', payload: selectedLocation });
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
      }
    } catch (error) {
      // Ignore malformed saved place payloads.
    } finally {
      localStorage.removeItem('yala_next_place');
    }
  }, [city, destination, dispatch, pickup]);

  const useCurrentLocation = useCallback(() => {
    setLocationMessage('Finding your current location...');
    if (!navigator.geolocation) {
      setLocationMessage('Current location is not supported on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        dispatch({
          type: 'SET_PICKUP',
          payload: {
            label: 'Current location',
            position: [coords.latitude, coords.longitude],
            city,
          },
        });
        setLocationMessage('Current location selected.');
        if (hasValidLocation(destination)) {
          dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' });
        }
      },
      () => setLocationMessage('Location permission is needed to use your current position.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [city, destination, dispatch]);

  const startMapSelection = useCallback(
    (target) => {
      setMapSelectionTarget(target);
      const targetLabel =
        target?.type === 'pickup'
          ? 'pickup'
          : target?.type === 'destination'
          ? 'destination'
          : target?.type === 'new-stop'
          ? 'new stop'
          : 'stop';
      setLocationMessage(`Tap the map to select your ${targetLabel}.`);
      dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
    },
    [dispatch]
  );

  const handlePickupSelect = useCallback(
    (location) => {
      dispatch({ type: 'SET_PICKUP', payload: location });
      if (hasValidLocation(location) && hasValidLocation(destination)) {
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' });
      }
    },
    [dispatch, destination]
  );

  const handleDestinationSelect = useCallback(
    (location) => {
      dispatch({ type: 'SET_DESTINATION', payload: location });
      if (hasValidLocation(location) && hasValidLocation(pickup)) {
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' });
      }
    },
    [dispatch, pickup]
  );

  const handleEditRoute = useCallback(() => {
    dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
  }, [dispatch]);

  const handleFocusAddStop = useCallback(() => {
    setShowAddStopInput(true);
    dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
    window.setTimeout(() => {
      addStopInputRef.current?.focus();
    }, 150);
  }, [dispatch]);

  const handleAddStop = useCallback(
    (location) => {
      if (!location || stops.length >= MAX_STOPS) return;
      dispatch({ type: 'ADD_STOP', payload: location });
    },
    [dispatch, stops.length]
  );

  const handleUpdateStop = useCallback(
    (index, location) => {
      dispatch({
        type: 'UPDATE_STOP',
        payload: { index, stop: location },
      });
    },
    [dispatch]
  );

  const handleRemoveStop = useCallback(
    (index) => {
      dispatch({ type: 'REMOVE_STOP', payload: index });
    },
    [dispatch]
  );

  const handleSavedDestination = useCallback(
    (location) => {
      dispatch({ type: 'SET_DESTINATION', payload: location });
      dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
    },
    [dispatch]
  );

  const handleMapClick = useCallback(
    (position) => {
      if (!mapSelectionTarget) return;

      const location = {
        label:
          mapSelectionTarget?.type === 'pickup'
            ? 'Pickup selected on map'
            : mapSelectionTarget?.type === 'destination'
            ? 'Destination selected on map'
            : 'Stop selected on map',
        position,
        city,
      };

      if (mapSelectionTarget?.type === 'pickup') {
        handlePickupSelect(location);
      } else if (mapSelectionTarget?.type === 'destination') {
        handleDestinationSelect(location);
      } else if (mapSelectionTarget?.type === 'new-stop') {
        handleAddStop(location);
      } else if (mapSelectionTarget?.type === 'stop' && Number.isInteger(mapSelectionTarget.index)) {
        handleUpdateStop(mapSelectionTarget.index, location);
      }
      setMapSelectionTarget(null);
      setLocationMessage('');
    },
    [city, handleAddStop, handleDestinationSelect, handlePickupSelect, handleUpdateStop, mapSelectionTarget]
  );

  const handleRideTypeSelect = useCallback(
    (type) => {
      dispatch({ type: 'SET_RIDE_TYPE', payload: type });
    },
    [dispatch]
  );

  const handleConfirmBooking = useCallback(async () => {
    if (!pickup || !destination) return;
    if (!legalCompliant && !legalAccepted) return;

    dispatch({ type: 'REQUEST_RIDE' });

    try {
      if (!legalCompliant && legalAccepted) {
        await acceptRideLegal({
          device_info: (navigator.userAgent || '').slice(0, 500),
        });
        setLegalCompliant(true);
        setRequiresResign(false);
      }

      const payload = buildRideRequest({
        pickup,
        destination,
        stops,
        rideType,
        routeInfo,
        fare: discountedFare || fare,
        promoCode,
        rideTermsAccepted: legalCompliant || termsChecked,
        privacyAccepted: legalCompliant || privacyChecked,
      });

      const response = await apiService.requestRide(payload);
      dispatch({ type: 'RIDE_ACCEPTED', payload: response });
      const initialDriverPosition = getDriverPositionFromRide(response);
      if (initialDriverPosition) {
        dispatch({ type: 'DRIVER_POSITION', payload: initialDriverPosition });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message || t('riderHome.requestFailed', 'Ride request failed. Please try again.') });
    }
  }, [pickup, destination, stops, rideType, routeInfo, fare, discountedFare, promoCode, dispatch, t, legalCompliant, legalAccepted, termsChecked, privacyChecked]);

  const handlePromoApply = useCallback(
    async (code) => {
      setPromoLoading(true);
      setPromoError(null);

      try {
        const result = await apiService.validatePromo(code, fare);
        if (result.valid) {
          dispatch({ type: 'SET_PROMO', payload: code });
          const discount = result.discount_percent
            ? fare * (1 - result.discount_percent / 100)
            : fare - (result.discount_amount || 0);
          dispatch({
            type: 'SET_FARE',
            payload: { fare, discountedFare: Math.max(0, discount) },
          });
        } else {
          setPromoError(result.message || t('riderHome.invalidPromo', 'Invalid promo code'));
        }
      } catch (err) {
        setPromoError(err.message || t('riderHome.promoFailed', 'Could not validate promo code'));
      } finally {
        setPromoLoading(false);
      }
    },
    [fare, dispatch, t]
  );

  const handleCancelSuccess = useCallback(() => {
    dispatch({ type: 'RIDE_CANCELLED' });
  }, [dispatch]);

  const handleAddStopToActiveRide = useCallback(
    async (location) => {
      if (!currentRide?.id || !location?.position) return;

      const existingStops = Array.isArray(currentRide.stops) ? currentRide.stops : [];
      if (existingStops.length >= MAX_STOPS) {
        throw new Error(`You can add up to ${MAX_STOPS} stops.`);
      }

      const newStop = await apiService.addRideStop(currentRide.id, {
        location_name: location.label || location.address || `Stop ${existingStops.length + 1}`,
        latitude: location.position[0],
        longitude: location.position[1],
      });

      const updatedStops = [...existingStops, newStop].sort(
        (left, right) => Number(left.stop_order || 0) - Number(right.stop_order || 0)
      );

      dispatch({
        type: 'RIDE_UPDATE',
        payload: { stops: updatedStops },
      });
    },
    [currentRide, dispatch]
  );

  const handleChat = useCallback(() => {
    setShowChat(true);
  }, []);

  const handleShareTrip = useCallback(() => {
    setShowSafety(true);
  }, []);

  const handleSOS = useCallback(() => {
    setShowSafety(true);
  }, []);

  const handlePayRate = useCallback(() => {
    if (!currentRide?.id) return;
    localStorage.setItem('selectedRideId', String(currentRide.id));
    window.location.href = '/rider-payments';
  }, [currentRide?.id]);

  useEffect(() => {
    if (currentRide?.status !== 'completed' || !currentRide.id) return;
    localStorage.setItem('selectedRideId', String(currentRide.id));
  }, [currentRide?.id, currentRide?.status]);

  // ─── Render bottom sheet content based on booking step ─────────────
  const renderBottomSheetContent = () => {
    switch (bookingStep) {
      case 'idle':
        return (
          <div className="rider-home__idle rider-home__idle--lyft">
            <h1 className="rider-home__idle-greeting">Hi, {profile?.first_name || 'there'} 👋</h1>
            <p className="rider-home__idle-subtitle">Where are you going?</p>
            <button className="rider-home__lyft-search-card" type="button" onClick={handleDestinationFocus}>
              <span aria-hidden="true">⌕</span>
              <strong>Search destination</strong>
            </button>
            <div className="rider-home__shortcuts">
              <button type="button" className="rider-home__shortcut" onClick={() => handleNavigate('/saved-places')}>
                <span className="rider-home__shortcut-icon" aria-hidden="true">⌂</span>
                Saved
              </button>
              <button type="button" className="rider-home__shortcut" onClick={() => handleNavigate('/rider-history')}>
                <span className="rider-home__shortcut-icon" aria-hidden="true">🕐</span>
                Trips
              </button>
              <button type="button" className="rider-home__shortcut" onClick={() => handleNavigate('/rider-profile')}>
                <span className="rider-home__shortcut-icon" aria-hidden="true">👤</span>
                Profile
              </button>
            </div>
            <ServiceHub onNavigate={handleNavigate} />
            <div className="rider-home__saved">
              <div>
                <span>Saved places</span>
                <button type="button" onClick={() => handleNavigate('/saved-places')}>See all</button>
              </div>
              <div className="rider-home__saved-grid">
                {savedPlaces.slice(0, 2).map((place) => (
                  <button key={place.key} type="button" onClick={() => handleSavedDestination(place)}>
                    <span aria-hidden="true">{place.key === 'home' ? '⌂' : '▣'}</span>
                    {place.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'location':
        return (
          <div className="rider-home__location-content">
            <div className="rider-home__location-scroll">
              <div className="rider-home__booking-heading">
                <button className="yala-btn-secondary" type="button" onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'idle' })}>
                  Back
                </button>
                <div>
                  <span>Set your route</span>
                  <h2>Pickup, stops, and drop-off</h2>
                </div>
              </div>
              <div className="location-stack">
                <LocationInput
                  label={t('riderHome.pickup', 'Pickup')}
                  value={pickup?.label || ''}
                  city={city}
                  onSelect={handlePickupSelect}
                  variant="pickup"
                />
                {stops.map((stop, index) => (
                  <div key={`stop-input-${index}`} className="location-stack__stop-row">
                    <LocationInput
                      label={`${t('riderHome.stop', 'Stop')} ${index + 1}`}
                      value={stop?.label || ''}
                      city={city}
                      onSelect={(location) => handleUpdateStop(index, location)}
                      variant="stop"
                    />
                    <button
                      type="button"
                      className="location-stack__remove-stop"
                      onClick={() => handleRemoveStop(index)}
                      aria-label={`Remove stop ${index + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {stops.length < MAX_STOPS && (
                  <div className="location-stack__add-row">
                    <button
                      type="button"
                      className="rider-home__add-stop-btn"
                      onClick={handleFocusAddStop}
                    >
                      + {t('riderHome.addStop', 'Add stop')} ({stops.length}/{MAX_STOPS})
                    </button>
                    {showAddStopInput && (
                      <LocationInput
                        label={`${t('riderHome.addStop', 'Add stop')} ${stops.length + 1}`}
                        value=""
                        city={city}
                        onSelect={(location) => {
                          handleAddStop(location);
                          setShowAddStopInput(false);
                        }}
                        variant="stop"
                        inputRef={addStopInputRef}
                      />
                    )}
                  </div>
                )}
                <LocationInput
                  label={t('riderHome.destination', 'Destination')}
                  value={destination?.label || ''}
                  city={city}
                  savedPlaces={savedPlaces}
                  onSelect={handleDestinationSelect}
                  onFocus={handleDestinationFocus}
                  variant="destination"
                />
              </div>
              <div className="rider-home__location-actions">
                <button type="button" onClick={useCurrentLocation}>Use current GPS</button>
                <button type="button" onClick={() => startMapSelection({ type: 'pickup' })}>Pickup on map</button>
                <button type="button" onClick={() => startMapSelection({ type: 'destination' })}>Drop-off on map</button>
                {stops.length < MAX_STOPS && (
                  <button type="button" onClick={() => startMapSelection({ type: 'new-stop' })}>
                    Stop on map
                  </button>
                )}
              </div>
              {locationMessage && <p className="rider-home__location-message">{locationMessage}</p>}
            </div>
            {pickup && destination && (
              <div className="rider-home__location-footer">
                <button
                  type="button"
                  className="yala-btn-primary"
                  onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' })}
                >
                  {t('riderHome.requestRide', 'Request Ride →')}
                </button>
              </div>
            )}
          </div>
        );

      case 'rideType':
        return (
          <div className="rider-home__ride-type-content">
            <RouteSummary
              pickup={pickup}
              destination={destination}
              stops={stops}
              onEdit={handleEditRoute}
              onAddStop={handleFocusAddStop}
              canAddStop={stops.length < MAX_STOPS}
            />
            <h2 className="rider-home__section-title">
              {t('riderHome.chooseRide', 'Choose a ride')}
            </h2>
            <RideTypeSelector
              distance={routeInfo?.distanceKm || 1}
              etaMinutes={routeInfo?.etaMinutes}
              selectedType={rideType}
              onSelect={handleRideTypeSelect}
            />
            {/* Confirm Ride button directly on ride type screen */}
            <button
              type="button"
              className="yala-btn-primary"
              onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' })}
            >
              {t('riderHome.confirmRide', `Confirm ${RIDE_TYPE_LABELS[rideType] || 'Regular'} — ${Math.round(fare || 0)} MRU`)}
            </button>
          </div>
        );

      case 'confirm':
      case 'searching':
        return (
          <BookingConfirmation
            pickup={pickup}
            destination={destination}
            stops={stops}
            rideType={rideType}
            fare={fare}
            discountedFare={discountedFare}
            promoCode={promoCode}
            onConfirm={handleConfirmBooking}
            onPromoApply={handlePromoApply}
            onRideTypeChange={handleRideTypeSelect}
            loading={loading}
            error={error}
            profile={profile}
            routeInfo={routeInfo}
            promoError={promoError}
            promoLoading={promoLoading}
            legalCompliant={legalCompliant && !requiresResign}
            termsChecked={termsChecked}
            privacyChecked={privacyChecked}
            onTermsChange={setTermsChecked}
            onPrivacyChange={setPrivacyChecked}
          />
        );

      case 'tracking':
        return currentRide ? (
          <RideTracker
            ride={currentRide}
            driverPosition={driverPosition}
            city={city}
            onAddStop={handleAddStopToActiveRide}
            onChat={handleChat}
            onShare={handleShareTrip}
            onSOS={handleSOS}
            onPayRate={handlePayRate}
            onCancelSuccess={handleCancelSuccess}
          />
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div className="rider-home">
      {requiresResign ? (
        <div
          className="rider-home__legal-banner"
          role="alert"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1200,
            maxWidth: 'min(92vw, 520px)',
            padding: '12px 16px',
            borderRadius: 12,
            background: '#7f1d1d',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          Updated Yala Ride terms require your acceptance before you can request a ride.
        </div>
      ) : null}
      {/* Map background — always visible */}
      <div className="rider-home__map">
        <MapView
          center={mapCenter}
          zoom={13}
          markers={markers}
          routePath={displayRoutePath}
          fitBounds={fitBounds}
          onMapClick={handleMapClick}
        />
      </div>

      {bookingStep === 'idle' && (
        <>
          <header className="rider-home__top-bar">
            <button className="rider-home__menu-btn" type="button" onClick={() => setShowMenu(true)} aria-label="Open rider menu">
              <span className="rider-home__menu-icon" aria-hidden="true" />
            </button>
            <button className="rider-home__avatar-btn" type="button" onClick={() => handleNavigate('/rider-profile')} aria-label="Open rider profile">
              {riderInitial}
            </button>
          </header>
          <button className="rider-home__floating-search" type="button" onClick={handleDestinationFocus}>
            <span aria-hidden="true">⌕</span>
            <strong>Where to?</strong>
          </button>
          <div className="rider-home__map-caption">
            <strong>You are here</strong>
            <span>{pickup?.label || city}</span>
          </div>
        </>
      )}

      <div className="rider-home__panel">
        <BottomSheet
          state={derivedSheetState}
          onStateChange={handleSheetStateChange}
          contentClassName={bookingStep === 'idle' ? 'bottom-sheet__content--idle' : ''}
        >
          {renderBottomSheetContent()}
        </BottomSheet>
      </div>

      {showChat && currentRide?.id && (
        <RideChat rideId={currentRide.id} onClose={() => setShowChat(false)} />
      )}

      {showSafety && createPortal(
        <div className="rider-home__safety-overlay">
          <SafetyEmergencyPanel
            role="rider"
            currentRide={currentRide}
            onClose={() => setShowSafety(false)}
          />
        </div>,
        document.body
      )}

      <RiderHamburgerMenu
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        riderProfile={profile || {}}
        onNavigate={handleNavigate}
        onBookRide={handleBookRideFromMenu}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default RiderHome;
