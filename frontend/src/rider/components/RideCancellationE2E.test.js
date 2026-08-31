import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RiderHome from './RiderHome';
import { RideProvider } from '../context/RideContext';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

jest.mock('./MapView', () => {
  return function MockMapView({ center, markers, routePath }) {
    return (
      <div data-testid="mapview-container">
        <div data-testid="map-container" data-center={JSON.stringify(center)}>
          {markers && markers.map((m) => (
            <div
              key={m.id}
              data-testid="map-marker"
              data-position={JSON.stringify(m.position)}
              data-type={m.type}
            />
          ))}
          {routePath && routePath.length > 0 && (
            <div data-testid="map-polyline" data-positions={JSON.stringify(routePath)} />
          )}
        </div>
      </div>
    );
  };
});

jest.mock('./RideTypeSelector', () => ({
  __esModule: true,
  default: function MockRideTypeSelector() {
    return <div data-testid="ride-type-selector-mock" />;
  },
}));

jest.mock('./BookingConfirmation', () => ({
  __esModule: true,
  default: function MockBookingConfirmation() {
    return <div data-testid="booking-confirmation-mock" />;
  },
}));

jest.mock('../../safety/useTripSafetyMonitor', () => ({
  __esModule: true,
  default: () => ({ openEvent: null, respond: jest.fn() }),
}));

jest.mock('../utils/locationFilter', () => ({
  filterLocations: (query, city) => {
    const locations = [
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
      { city: 'Nouakchott', label: 'Dar Naim', position: [18.1018, -15.9307] },
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Toujounine', position: [18.0896, -15.9754] },
    ];
    if (!query || !query.trim()) return locations.filter((l) => l.city === city);
    const q = query.trim().toLowerCase();
    return locations.filter((l) => l.city === city && l.label.toLowerCase().includes(q));
  },
}));

const mockSubscribeRideUpdates = jest.fn(() => jest.fn());
const mockSubscribeDriverPosition = jest.fn(() => jest.fn());
const mockJoinRideGroup = jest.fn();
const mockLeaveRideGroup = jest.fn();

jest.mock('../services/wsService', () => ({
  __esModule: true,
  default: {
    subscribeRideUpdates: (...args) => mockSubscribeRideUpdates(...args),
    subscribeDriverPosition: (...args) => mockSubscribeDriverPosition(...args),
    joinRideGroup: (...args) => mockJoinRideGroup(...args),
    leaveRideGroup: (...args) => mockLeaveRideGroup(...args),
  },
  subscribeRideUpdates: (...args) => mockSubscribeRideUpdates(...args),
  subscribeDriverPosition: (...args) => mockSubscribeDriverPosition(...args),
  joinRideGroup: (...args) => mockJoinRideGroup(...args),
  leaveRideGroup: (...args) => mockLeaveRideGroup(...args),
  resetWsConnection: jest.fn(),
}));

const mockGetRoute = jest.fn();
jest.mock('../services/routeService', () => ({
  __esModule: true,
  default: { getRoute: (...args) => mockGetRoute(...args) },
  getRoute: (...args) => mockGetRoute(...args),
}));

const mockRequestRide = jest.fn();
const mockGetRiderProfile = jest.fn();
const mockGetActiveRide = jest.fn();
const mockValidatePromo = jest.fn();
const mockCancelRide = jest.fn();

jest.mock('../services/apiService', () => ({
  __esModule: true,
  default: {
    requestRide: (...args) => mockRequestRide(...args),
    getRiderProfile: (...args) => mockGetRiderProfile(...args),
    getActiveRide: (...args) => mockGetActiveRide(...args),
    validatePromo: (...args) => mockValidatePromo(...args),
    cancelRide: (...args) => mockCancelRide(...args),
  },
  requestRide: (...args) => mockRequestRide(...args),
  getRiderProfile: (...args) => mockGetRiderProfile(...args),
  getActiveRide: (...args) => mockGetActiveRide(...args),
  validatePromo: (...args) => mockValidatePromo(...args),
  cancelRide: (...args) => mockCancelRide(...args),
}));

jest.mock('../../marketConfig', () => ({
  MARKET: {
    defaultCity: 'Nouakchott',
    defaultPickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
    defaultDestination: { label: 'Toujounine', position: [18.0896, -15.9754] },
    center: [18.0735, -15.9582],
    currency: 'MRU',
    waiting: { freeMinutes: 3, perMinuteFee: 10, maxWaitMinutes: 5 },
    noShow: { riderFee: 75, driverCompensation: 75 },
    cancellation: { enRouteFee: 50, arrivedFee: 75, freeWindowMinutes: 2 },
    locations: [
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
      { city: 'Nouakchott', label: 'Dar Naim', position: [18.1018, -15.9307] },
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Toujounine', position: [18.0896, -15.9754] },
    ],
    fare: {
      regular: { label: 'Regular', base: 175, perKm: 20 },
      xl: { label: 'XL', base: 225, perKm: 25 },
      comfort: { label: 'Comfort', base: 275, perKm: 30 },
      share: { label: 'Share', base: 150, perKm: 15 },
    },
  },
  getLocationsByCity: (city) => {
    const locations = [
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
      { city: 'Nouakchott', label: 'Dar Naim', position: [18.1018, -15.9307] },
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Toujounine', position: [18.0896, -15.9754] },
    ];
    return locations.filter((l) => l.city === city);
  },
  calculateFare: (rideType, distanceKm) => {
    const pricing = {
      regular: { base: 175, perKm: 20 },
      xl: { base: 225, perKm: 25 },
      comfort: { base: 275, perKm: 30 },
      share: { base: 150, perKm: 15 },
    };
    const p = pricing[rideType] || pricing.regular;
    return Math.round((p.base + (distanceKm || 0) * p.perKm) * 100) / 100;
  },
  calculateDistanceKm: () => 5,
  isPointInServiceArea: () => true,
  formatMoney: (amount) => `${Number(amount || 0).toFixed(2)} MRU`,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderRiderHome(activeRide = null) {
  mockGetRiderProfile.mockResolvedValue({
    phone_number: '+22245001234',
    first_name: 'Test',
  });
  mockGetActiveRide.mockResolvedValue(activeRide);
  mockCancelRide.mockResolvedValue({ success: true });
  mockGetRoute.mockResolvedValue({
    points: [[18.0735, -15.9582], [18.0896, -15.9754]],
    distanceKm: 5,
    etaMinutes: 8,
  });

  return render(
    <RideProvider>
      <RiderHome />
    </RideProvider>
  );
}

function makeActiveRide(status, driverName = null) {
  const base = {
    id: 101,
    status,
    driver_name: driverName,
    driver_phone: '+22240001122',
    driver_avg_rating: 4.8,
    vehicle: 'Toyota Corolla',
    vehicle_make: 'Toyota',
    vehicle_model: 'Corolla',
    vehicle_color: 'White',
    vehicle_category_label: 'Comfort',
    plate_number: 'NKC-4521',
    pickup: { label: 'Ksar', position: [18.1002, -15.9631] },
    destination: { label: 'Arafat', position: [18.0466, -15.9657] },
    stops: [],
    fare: 300,
    pin_code: '4729',
    pickup_lat: 18.1002,
    pickup_lng: -15.9631,
    destination_lat: 18.0466,
    destination_lng: -15.9657,
  };

  if (status !== 'requested') {
    base.driver_current_lat = 18.09;
    base.driver_current_lng = -15.97;
    base.eta_minutes = 8;
  }

  if (status === 'driver_arrived') {
    base.driver_arrived_at = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  }

  return base;
}

async function cancelAsRider() {
  fireEvent.click(screen.getByLabelText('Cancel ride'));
  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: 'Cancel Ride' })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('Changed my mind'));

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }));
  });

  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Cancel Ride' })).not.toBeInTheDocument();
  });
}

async function assertHomeIsClean({ driverName, pickupLabel, destinationLabel, etaMinutes }) {
  // Toast appears
  await waitFor(() => {
    expect(screen.getByText('Ride cancelled')).toBeInTheDocument();
  });

  // Toast disappears automatically (allow up to 4s for the 3s timer)
  await waitFor(() => {
    expect(screen.queryByText('Ride cancelled')).not.toBeInTheDocument();
  }, { timeout: 4000 });

  // Route/polyline disappears
  expect(screen.queryByTestId('map-polyline')).not.toBeInTheDocument();

  // Driver information disappears
  if (driverName) {
    expect(screen.queryByText(driverName)).not.toBeInTheDocument();
  }

  // ETA disappears
  expect(screen.queryAllByText(/\d+ min/)).toHaveLength(0);

  // Pickup and destination cleared
  if (pickupLabel) {
    expect(screen.queryByText(pickupLabel)).not.toBeInTheDocument();
  }
  if (destinationLabel) {
    expect(screen.queryByText(destinationLabel)).not.toBeInTheDocument();
  }

  // Rider is back on a clean Home screen
  await waitFor(() => {
    expect(screen.getByText('Where to?')).toBeInTheDocument();
  });

  // A new ride can be requested immediately
  fireEvent.click(screen.getByText('Where to?'));
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Search destination location...')).toBeInTheDocument();
  });

  // Old cancelled ride data does not reappear after a refresh
  mockGetActiveRide.mockResolvedValue(null);
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await waitFor(() => {
    expect(mockGetActiveRide).toHaveBeenCalled();
  });

  if (driverName) {
    expect(screen.queryByText(driverName)).not.toBeInTheDocument();
  }
  if (pickupLabel) {
    expect(screen.queryByText(pickupLabel)).not.toBeInTheDocument();
  }
  if (destinationLabel) {
    expect(screen.queryByText(destinationLabel)).not.toBeInTheDocument();
  }
  expect(screen.queryByTestId('map-polyline')).not.toBeInTheDocument();
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Ride cancellation end-to-end', () => {
  let rideUpdateCallbacks = [];

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    rideUpdateCallbacks = [];
    mockSubscribeRideUpdates.mockImplementation((cb) => {
      rideUpdateCallbacks.push(cb);
      return jest.fn();
    });
  });

  it('1. Rider requests a ride, then Rider cancels before driver accepts — PASS', async () => {
    const activeRide = makeActiveRide('requested');
    renderRiderHome(activeRide);

    await waitFor(() => {
      expect(screen.getByText('Looking for a nearby driver')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Cancel ride')).toBeInTheDocument();

    await cancelAsRider();

    await assertHomeIsClean({
      driverName: null,
      pickupLabel: 'Ksar',
      destinationLabel: 'Arafat',
      etaMinutes: null,
    });
  }, 15000);

  it('2. Rider requests a ride, Driver accepts, then Rider cancels — PASS', async () => {
    const activeRide = makeActiveRide('accepted', 'Moussa Diallo');
    renderRiderHome(activeRide);

    await waitFor(() => {
      expect(screen.getByText('Moussa Diallo')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/\d+ min/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('map-polyline')).toBeInTheDocument();

    await cancelAsRider();

    await waitFor(() => {
      expect(mockCancelRide).toHaveBeenCalledWith(101, 'Changed my mind');
    });

    await assertHomeIsClean({
      driverName: 'Moussa Diallo',
      pickupLabel: 'Ksar',
      destinationLabel: 'Arafat',
    });
  }, 15000);

  it('3. Driver accepts a ride, then Driver cancels — PASS', async () => {
    const activeRide = makeActiveRide('accepted', 'Moussa Diallo');
    renderRiderHome(activeRide);

    await waitFor(() => {
      expect(screen.getByText('Moussa Diallo')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/\d+ min/).length).toBeGreaterThan(0);

    await act(async () => {
      rideUpdateCallbacks.forEach((cb) =>
        cb({ ride_id: activeRide.id, status: 'cancelled' })
      );
    });

    await assertHomeIsClean({
      driverName: 'Moussa Diallo',
      pickupLabel: 'Ksar',
      destinationLabel: 'Arafat',
    });
  }, 15000);

  it('4. Cancel while Driver is arriving — PASS', async () => {
    const activeRide = makeActiveRide('driver_arriving', 'Moussa Diallo');
    renderRiderHome(activeRide);

    await waitFor(() => {
      expect(screen.getByText('Moussa Diallo')).toBeInTheDocument();
    });

    expect(screen.getAllByText(/\d+ min/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('map-polyline')).toBeInTheDocument();

    await cancelAsRider();

    await assertHomeIsClean({
      driverName: 'Moussa Diallo',
      pickupLabel: 'Ksar',
      destinationLabel: 'Arafat',
    });
  }, 15000);
});
