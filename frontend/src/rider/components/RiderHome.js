import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useRide } from '../context/RideContext';
import MapView from './MapView';
import BottomSheet from './BottomSheet';
import LocationInput from './LocationInput';
import RideTypeSelector from './RideTypeSelector';
import BookingConfirmation from './BookingConfirmation';
import RideTracker from './RideTracker';
import RideChat from '../../components/RideChat';
import SafetyEmergencyPanel from '../../safety/SafetyEmergencyPanel';
import wsService from '../services/wsService';
import routeService from '../services/routeService';
import apiService from '../services/apiService';
import { calculateFare } from '../utils/fareCalculator';
import { buildRideRequest } from '../utils/buildRideRequest';
import { MARKET } from '../../marketConfig';
import './RiderHome.css';

const RIDE_TYPE_LABELS = {
  regular: 'Regular',
  comfort: 'Comfort',
  xl: 'XL',
  share: 'Share',
};

function getDriverPositionFromRide(ride) {
  const lat = Number(ride?.driver_current_lat);
  const lng = Number(ride?.driver_current_lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
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
  const [showChat, setShowChat] = useState(false);
  const [showSafety, setShowSafety] = useState(false);

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

  // ─── WebSocket subscriptions for ride updates ──────────────────────
  useEffect(() => {
    const unsubRide = wsService.subscribeRideUpdates(async (data) => {
      if (data.status === 'completed') {
        dispatch({ type: 'RIDE_COMPLETED', payload: data });
      } else if (data.status === 'cancelled') {
        dispatch({ type: 'RIDE_CANCELLED' });
      } else if (data.status && data.ride_id) {
        dispatch({
          type: 'RIDE_UPDATE',
          payload: { status: data.status, eta_minutes: data.eta_minutes },
        });

        // Status broadcasts are intentionally lightweight. Refresh the full
        // rider-authorized ride so driver, vehicle, verification, and PIN data
        // appear immediately after acceptance.
        try {
          const activeRide = await apiService.getActiveRide();
          if (activeRide && String(activeRide.id) === String(data.ride_id)) {
            dispatch({
              type: 'RIDE_ACCEPTED',
              payload: {
                ...activeRide,
                status: data.status,
                eta_minutes: data.eta_minutes ?? activeRide.eta_minutes,
              },
            });
            const initialDriverPosition = getDriverPositionFromRide(activeRide);
            if (initialDriverPosition) {
              dispatch({ type: 'DRIVER_POSITION', payload: initialDriverPosition });
            }
          }
        } catch (err) {
          // Keep the status update visible even if the detail refresh fails.
        }
      }
    });

    return unsubRide;
  }, [dispatch]);

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
    async function checkActiveRide() {
      try {
        const active = await apiService.getActiveRide();
        if (active) {
          dispatch({ type: 'RIDE_ACCEPTED', payload: active });
          const initialDriverPosition = getDriverPositionFromRide(active);
          if (initialDriverPosition) {
            dispatch({ type: 'DRIVER_POSITION', payload: initialDriverPosition });
          }
        }
      } catch (err) {
        // Non-critical
      }
    }
    checkActiveRide();
  }, [dispatch]);

  // ─── Fetch route when pickup and destination are set ───────────────
  useEffect(() => {
    if (!pickup || !destination) return;

    async function fetchRoute() {
      const waypoints = [
        pickup.position,
        ...stops.filter(Boolean).map((s) => s.position),
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
      // Map sheet state to booking step transitions
      if (newState === 'collapsed' && bookingStep === 'location') {
        dispatch({ type: 'SET_BOOKING_STEP', payload: 'idle' });
      }
    },
    [bookingStep, dispatch]
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
        return 'half';
      case 'searching':
        return 'half';
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

  // ─── Booking flow handlers ─────────────────────────────────────────
  const handleDestinationFocus = useCallback(() => {
    dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
  }, [dispatch]);

  const savedPlaces = useMemo(
    () => [
      { key: 'home', label: 'Home', position: [18.0735, -15.9582] },
      { key: 'work', label: 'Work', position: [18.1002, -15.9631] },
      { key: 'favorite', label: 'Favorite', position: [18.1194, -16.0019] },
      { key: 'recent', label: 'Recent', position: [18.0896, -15.9754] },
    ],
    []
  );

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
      },
      () => setLocationMessage('Location permission is needed to use your current position.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [city, dispatch]);

  const startMapSelection = useCallback(
    (target) => {
      setMapSelectionTarget(target);
      setLocationMessage(`Tap the map to select your ${target}.`);
      dispatch({ type: 'SET_BOOKING_STEP', payload: 'location' });
    },
    [dispatch]
  );

  const handlePickupSelect = useCallback(
    (location) => {
      dispatch({ type: 'SET_PICKUP', payload: location });
    },
    [dispatch]
  );

  const handleDestinationSelect = useCallback(
    (location) => {
      dispatch({ type: 'SET_DESTINATION', payload: location });
      // Always transition to rideType after destination is selected
      // The route useEffect will fetch the route when both pickup & destination exist
      dispatch({ type: 'SET_BOOKING_STEP', payload: 'rideType' });
    },
    [dispatch]
  );

  const handleSavedDestination = useCallback(
    (location) => {
      dispatch({ type: 'SET_DESTINATION', payload: location });
      dispatch({ type: 'SET_BOOKING_STEP', payload: pickup ? 'rideType' : 'location' });
    },
    [dispatch, pickup]
  );

  const handleMapClick = useCallback(
    (position) => {
      if (!mapSelectionTarget) return;

      const location = {
        label: `${mapSelectionTarget === 'pickup' ? 'Pickup' : 'Destination'} selected on map`,
        position,
        city,
      };

      if (mapSelectionTarget === 'pickup') {
        handlePickupSelect(location);
      } else {
        handleDestinationSelect(location);
      }
      setMapSelectionTarget(null);
      setLocationMessage('');
    },
    [city, handleDestinationSelect, handlePickupSelect, mapSelectionTarget]
  );

  const handleRideTypeSelect = useCallback(
    (type) => {
      dispatch({ type: 'SET_RIDE_TYPE', payload: type });
      dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' });
    },
    [dispatch]
  );

  const handleConfirmBooking = useCallback(async () => {
    if (!pickup || !destination) return;

    dispatch({ type: 'REQUEST_RIDE' });

    try {
      const payload = buildRideRequest({
        pickup,
        destination,
        stops,
        rideType,
        routeInfo,
        fare: discountedFare || fare,
        promoCode,
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
  }, [pickup, destination, stops, rideType, routeInfo, fare, discountedFare, promoCode, dispatch, t]);

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
    const redirectTimer = window.setTimeout(() => {
      window.location.href = '/rider-payments';
    }, 250);

    return () => window.clearTimeout(redirectTimer);
  }, [currentRide?.id, currentRide?.status]);

  // ─── Render bottom sheet content based on booking step ─────────────
  const renderBottomSheetContent = () => {
    switch (bookingStep) {
      case 'idle':
        return null;

      case 'location':
        return (
          <div className="rider-home__location-content">
            <div className="rider-home__booking-heading">
              <button type="button" onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'idle' })}>
                Back
              </button>
              <div>
                <span>Plan your ride</span>
                <h2>Pickup and drop-off</h2>
              </div>
            </div>
            <LocationInput
              label={t('riderHome.pickup', 'Pickup')}
              value={pickup?.label || ''}
              city={city}
              onSelect={handlePickupSelect}
            />
            <LocationInput
              label={t('riderHome.destination', 'Destination')}
              value={destination?.label || ''}
              city={city}
              savedPlaces={savedPlaces}
              onSelect={handleDestinationSelect}
              onFocus={handleDestinationFocus}
            />
            <div className="rider-home__location-actions">
              <button type="button" onClick={useCurrentLocation}>Use current GPS</button>
              <button type="button" onClick={() => startMapSelection('pickup')}>Pickup on map</button>
              <button type="button" onClick={() => startMapSelection('destination')}>Drop-off on map</button>
            </div>
            {/* Confirm locations and proceed to ride type selection */}
            {pickup && destination && (
              <button
                type="button"
                className="rider-home__confirm-locations-btn"
                onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'rideType' })}
                style={{ width: '100%', marginTop: 16, padding: '14px 0', borderRadius: 999, border: 'none', background: '#00A651', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer' }}
              >
                {t('riderHome.findRides', 'Find Rides →')}
              </button>
            )}
            {locationMessage && <p className="rider-home__location-message">{locationMessage}</p>}
          </div>
        );

      case 'rideType':
        return (
          <div className="rider-home__ride-type-content">
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
              className="rider-home__confirm-ride-btn"
              onClick={() => dispatch({ type: 'SET_BOOKING_STEP', payload: 'confirm' })}
              style={{ width: '100%', marginTop: 16, padding: '16px 0', borderRadius: 999, border: 'none', background: '#00A651', color: '#fff', fontWeight: 900, fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,166,81,0.3)' }}
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
            loading={loading}
            error={error}
            profile={profile}
            routeInfo={routeInfo}
            promoError={promoError}
            promoLoading={promoLoading}
          />
        );

      case 'tracking':
        return currentRide ? (
          <RideTracker
            ride={currentRide}
            driverPosition={driverPosition}
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
      {/* Map background — always visible */}
      <div className="rider-home__map">
        <MapView
          center={mapCenter}
          zoom={13}
          markers={markers}
          routePath={routePath}
          fitBounds={fitBounds}
          onMapClick={handleMapClick}
        />
      </div>

      {bookingStep === 'idle' && (
        <>
          <section className="rider-home__welcome-panel">
            <div className="rider-home__welcome-row">
              <div>
                <span>Yala Rider</span>
                <h1>Welcome, {profile?.first_name || 'Rider'}</h1>
              </div>
              <button type="button" onClick={() => handleNavigate('/rider-profile')} aria-label="Open rider profile">
                {(profile?.first_name || 'R').slice(0, 1).toUpperCase()}
              </button>
            </div>

            <button className="rider-home__main-search" type="button" onClick={handleDestinationFocus}>
              <span aria-hidden="true">⌕</span>
              <strong>Where are you going?</strong>
            </button>

            <div className="rider-home__quick-actions">
              <button type="button" onClick={useCurrentLocation}>
                <span aria-hidden="true">◎</span>
                Current location
              </button>
              <button type="button" onClick={() => handleNavigate('/services')}>
                <span aria-hidden="true">◷</span>
                Schedule ahead
              </button>
            </div>

            <div className="rider-home__saved">
              <div>
                <span>Saved places</span>
                <button type="button" onClick={() => handleNavigate('/saved-places')}>Manage</button>
              </div>
              <div className="rider-home__saved-grid">
                {savedPlaces.map((place) => (
                  <button key={place.key} type="button" onClick={() => handleSavedDestination(place)}>
                    <span aria-hidden="true">
                      {place.key === 'home' ? '⌂' : place.key === 'work' ? '▣' : place.key === 'favorite' ? '★' : '◷'}
                    </span>
                    {place.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <div className="rider-home__map-caption">
            <strong>You are here</strong>
            <span>{pickup?.label || city}</span>
          </div>

          <nav className="rider-home__bottom-nav" aria-label="Rider navigation">
            <button className="active" type="button" onClick={() => handleNavigate('/rider')}>
              <span aria-hidden="true">●</span>Rides
            </button>
            <button type="button" onClick={() => handleNavigate('/delivery')}>
              <span aria-hidden="true">□</span>Delivery
            </button>
            <button type="button" onClick={() => handleNavigate('/services')}>
              <span aria-hidden="true">◷</span>Scheduled
            </button>
            <button type="button" onClick={() => handleNavigate('/rider-profile')}>
              <span aria-hidden="true">○</span>Profile
            </button>
          </nav>
        </>
      )}

      {bookingStep !== 'idle' && (
        <div className="rider-home__panel">
          <BottomSheet state={derivedSheetState} onStateChange={handleSheetStateChange}>
            {renderBottomSheetContent()}
          </BottomSheet>
        </div>
      )}

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
    </div>
  );
}

export default RiderHome;
