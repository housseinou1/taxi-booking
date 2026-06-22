import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RiderHome from './RiderHome';
import { RideProvider } from '../context/RideContext';

// ─── Mock react-i18next ──────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── Mock MapView component directly to avoid leaflet CSS import issues ───────
jest.mock('./MapView', () => {
  return function MockMapView({ center, markers, routePath, fitBounds }) {
    return (
      <div data-testid="mapview-container">
        <div data-testid="map-container" data-center={JSON.stringify(center)}>
          {markers && markers.map((m) => (
            <div
              key={m.id}
              data-testid="map-marker"
              data-position={JSON.stringify(m.position)}
              data-type={m.type}
              data-animate={m.animate ? 'true' : 'false'}
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

// ─── Mock services ───────────────────────────────────────────────────────────
const mockSubscribeRideUpdates = jest.fn(() => jest.fn());
const mockSubscribeDriverPosition = jest.fn(() => jest.fn());

jest.mock('../services/wsService', () => ({
  __esModule: true,
  default: {
    subscribeRideUpdates: (...args) => mockSubscribeRideUpdates(...args),
    subscribeDriverPosition: (...args) => mockSubscribeDriverPosition(...args),
  },
  subscribeRideUpdates: (...args) => mockSubscribeRideUpdates(...args),
  subscribeDriverPosition: (...args) => mockSubscribeDriverPosition(...args),
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

jest.mock('../services/apiService', () => ({
  __esModule: true,
  default: {
    requestRide: (...args) => mockRequestRide(...args),
    getRiderProfile: (...args) => mockGetRiderProfile(...args),
    getActiveRide: (...args) => mockGetActiveRide(...args),
    validatePromo: (...args) => mockValidatePromo(...args),
  },
  requestRide: (...args) => mockRequestRide(...args),
  getRiderProfile: (...args) => mockGetRiderProfile(...args),
  getActiveRide: (...args) => mockGetActiveRide(...args),
  validatePromo: (...args) => mockValidatePromo(...args),
}));

// ─── Mock marketConfig ───────────────────────────────────────────────────────
jest.mock('../../marketConfig', () => ({
  MARKET: {
    defaultCity: 'Nouakchott',
    defaultPickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
    defaultDestination: { label: 'Toujounine', position: [18.0896, -15.9754] },
    center: [18.0735, -15.9582],
    currency: 'MRU',
    locations: [
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
      { city: 'Nouakchott', label: 'Dar Naim', position: [18.1018, -15.9307] },
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Toujounine', position: [18.0896, -15.9754] },
    ],
    fare: {
      regular: { label: 'Regular', base: 200, perKm: 20 },
      xl: { label: 'XL', base: 300, perKm: 30 },
      comfort: { label: 'Comfort', base: 350, perKm: 35 },
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
    const pricing = { regular: { base: 200, perKm: 20 }, xl: { base: 300, perKm: 30 }, comfort: { base: 350, perKm: 35 }, share: { base: 150, perKm: 15 } };
    const p = pricing[rideType] || pricing.regular;
    return Math.round((p.base + distanceKm * p.perKm) * 100) / 100;
  },
  calculateDistanceKm: () => 5,
  isPointInServiceArea: () => true,
}));

// ─── Mock locationFilter ─────────────────────────────────────────────────────
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

// ─── Helper to render with RideProvider ──────────────────────────────────────
function renderRiderHome() {
  return render(
    <RideProvider>
      <RiderHome />
    </RideProvider>
  );
}

function openLocationStep() {
  fireEvent.click(document.querySelector('.rider-home__floating-search'));
}

// ─── Test suite ──────────────────────────────────────────────────────────────
describe('RiderHome integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default service behavior
    mockGetRiderProfile.mockResolvedValue({
      phone_number: '+22245001234',
      profile_picture: 'https://example.com/photo.jpg',
    });
    mockGetActiveRide.mockResolvedValue(null);
    mockGetRoute.mockResolvedValue({
      points: [[18.0735, -15.9582], [18.0896, -15.9754]],
      distanceKm: 5,
      etaMinutes: 8,
    });
    mockRequestRide.mockResolvedValue({
      id: 42,
      status: 'accepted',
      pin_code: '1234',
      estimated_fare: 300,
      driver_name: 'Amadou Ba',
      vehicle: 'Toyota Hilux',
      plate_number: 'NKC-9876',
      pickup: { label: 'Ksar', position: [18.1002, -15.9631] },
      destination: { label: 'Arafat', position: [18.0466, -15.9657] },
      stops: [],
      fare: 300,
      eta_minutes: 8,
    });
    mockSubscribeRideUpdates.mockImplementation(() => jest.fn());
    mockSubscribeDriverPosition.mockImplementation(() => jest.fn());
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Full booking flow — location → ride type → confirm → tracking
  // Validates: Requirements 4.1, 4.5
  // ─────────────────────────────────────────────────────────────────────────
  it('completes the full booking flow: location → ride type → confirm → tracking', async () => {
    renderRiderHome();

    // Step 1: Home screen shows destination search button
    expect(screen.getAllByText('Where to?').length).toBeGreaterThan(0);

    openLocationStep();

    // Step 2: Location inputs should be visible (find by placeholder)
    const pickupInput = screen.getByPlaceholderText('Search pickup location...');
    const destinationInput = screen.getByPlaceholderText('Search destination location...');
    expect(pickupInput).toBeInTheDocument();
    expect(destinationInput).toBeInTheDocument();

    // Set pickup first
    fireEvent.change(pickupInput, { target: { value: 'Ksar' } });

    // Wait for debounce and autocomplete results
    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.find((el) => el.textContent.includes('Ksar'))).toBeTruthy();
    });

    // Click the Ksar option
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Ksar')));

    // Set destination — since pickup is now set, selecting destination triggers rideType step
    fireEvent.change(destinationInput, { target: { value: 'Arafat' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.find((el) => el.textContent.includes('Arafat'))).toBeTruthy();
    });

    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Arafat')));

    // Continue to ride type after setting pickup and destination
    fireEvent.click(screen.getByRole('button', { name: /Find Rides/i }));

    // Step 3: Ride type selection should appear
    await waitFor(() => {
      expect(screen.getByText('Choose a ride')).toBeInTheDocument();
    });

    // Select Comfort ride type
    const comfortCard = screen.getByLabelText(/Comfort/);
    fireEvent.click(comfortCard);

    // Step 4: Booking confirmation should appear
    await waitFor(() => {
      expect(screen.getByText('Confirm Your Ride')).toBeInTheDocument();
    });

    // Confirm the booking
    const confirmBtn = screen.getByRole('button', { name: /Confirm booking/i });
    fireEvent.click(confirmBtn);

    // Step 5: After successful API call, should transition to tracking (driver info shown)
    await waitFor(() => {
      expect(screen.getByText('Amadou Ba')).toBeInTheDocument();
    });

    expect(mockRequestRide).toHaveBeenCalledTimes(1);
  }, 15000);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: WebSocket ride status updates flow through to RideTracker UI
  // Validates: Requirements 5.2
  // ─────────────────────────────────────────────────────────────────────────
  it('receives WebSocket ride status updates and reflects them in RideTracker', async () => {
    const rideUpdateCallbacks = [];
    mockSubscribeRideUpdates.mockImplementation((cb) => {
      rideUpdateCallbacks.push(cb);
      return jest.fn();
    });

    // Simulate an active ride on mount
    mockGetActiveRide.mockResolvedValue({
      id: 99,
      status: 'driver_arriving',
      driver_name: 'Ibrahim Sy',
      driver_picture: null,
      vehicle: 'Renault Logan',
      plate_number: 'NDB-1111',
      pickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
      destination: { label: 'Ksar', position: [18.1002, -15.9631] },
      stops: [],
      fare: 250,
      pin_code: '7788',
      eta_minutes: 4,
    });

    renderRiderHome();

    // Wait for the active ride to be loaded → tracking step
    await waitFor(() => {
      expect(screen.getByText('Ibrahim Sy')).toBeInTheDocument();
    });

    // Verify initial status: driver_arriving step is active
    expect(screen.getByText('Driver Arriving')).toBeInTheDocument();

    // Simulate WebSocket status update to 'driver_arrived'
    act(() => {
      rideUpdateCallbacks.forEach((callback) => callback({ ride_id: 99, status: 'driver_arrived' }));
    });

    // RideTracker should reflect updated status
    await waitFor(() => {
      expect(screen.getByText('Arrived')).toBeInTheDocument();
    });

    // Simulate another status update to 'in_progress'
    act(() => {
      rideUpdateCallbacks.forEach((callback) => callback({ ride_id: 99, status: 'in_progress' }));
    });

    await waitFor(() => {
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });
  }, 10000);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Driver position updates animate marker on MapView
  // Validates: Requirements 5.2
  // ─────────────────────────────────────────────────────────────────────────
  it('updates the driver marker position on MapView from WebSocket driver position updates', async () => {
    let driverPosCallback;
    mockSubscribeDriverPosition.mockImplementation((rideId, cb) => {
      driverPosCallback = cb;
      return jest.fn();
    });

    mockGetActiveRide.mockResolvedValue({
      id: 55,
      status: 'driver_arriving',
      driver_name: 'Fatima Mint',
      driver_picture: null,
      vehicle: 'Dacia Sandero',
      plate_number: 'NKC-2222',
      pickup: { label: 'Dar Naim', position: [18.1018, -15.9307] },
      destination: { label: 'Arafat', position: [18.0466, -15.9657] },
      stops: [],
      fare: 320,
      pin_code: '5566',
      eta_minutes: 6,
    });

    renderRiderHome();

    // Wait for tracking mode
    await waitFor(() => {
      expect(screen.getByText('Fatima Mint')).toBeInTheDocument();
    });

    // Verify subscribeDriverPosition was called with the ride id
    expect(mockSubscribeDriverPosition).toHaveBeenCalledWith(55, expect.any(Function));

    // Simulate driver position update
    act(() => {
      driverPosCallback([18.09, -15.95]);
    });

    // The driver marker should appear on the map with the updated position
    await waitFor(() => {
      const markers = screen.getAllByTestId('map-marker');
      const driverMarker = markers.find(
        (m) => m.getAttribute('data-position') === JSON.stringify([18.09, -15.95])
      );
      expect(driverMarker).toBeInTheDocument();
    });

    // Simulate another position update (driver moves)
    act(() => {
      driverPosCallback([18.085, -15.955]);
    });

    await waitFor(() => {
      const markers = screen.getAllByTestId('map-marker');
      const updatedMarker = markers.find(
        (m) => m.getAttribute('data-position') === JSON.stringify([18.085, -15.955])
      );
      expect(updatedMarker).toBeInTheDocument();
    });
  }, 10000);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: API error responses display in notification component
  // Validates: Requirements 4.6
  // ─────────────────────────────────────────────────────────────────────────
  it('displays API error messages in the booking confirmation when ride request fails', async () => {
    mockRequestRide.mockRejectedValue(new Error('Driver not available in your area'));

    renderRiderHome();

    // Navigate through booking flow:
    // 1. Open destination search
    openLocationStep();

    // 2. Set pickup
    const pickupInput = screen.getByPlaceholderText('Search pickup location...');
    fireEvent.change(pickupInput, { target: { value: 'Sebkha' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.find((el) => el.textContent.includes('Sebkha'))).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Sebkha')));

    // 3. Set destination
    const destinationInput = screen.getByPlaceholderText('Search destination location...');
    fireEvent.change(destinationInput, { target: { value: 'Dar Naim' } });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      expect(options.find((el) => el.textContent.includes('Dar Naim'))).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Dar Naim')));

    fireEvent.click(screen.getByRole('button', { name: /Find Rides/i }));

    // 4. Select ride type
    await waitFor(() => {
      expect(screen.getByText('Choose a ride')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText(/Regular/));

    // 5. Confirm booking (should fail)
    await waitFor(() => {
      expect(screen.getByText('Confirm Your Ride')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm booking/i });
    fireEvent.click(confirmBtn);

    // The error message should be displayed
    await waitFor(() => {
      expect(screen.getByText('Driver not available in your area')).toBeInTheDocument();
    });

    // Error should be in an alert role for accessibility
    expect(screen.getByRole('alert')).toBeInTheDocument();
  }, 15000);

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Ride completes via WebSocket and exposes Pay & Rate
  // Validates: Requirements 4.5, 5.2
  // ─────────────────────────────────────────────────────────────────────────
  it('shows Pay & Rate when ride completes via WebSocket', async () => {
    const rideUpdateCallbacks = [];
    mockSubscribeRideUpdates.mockImplementation((cb) => {
      rideUpdateCallbacks.push(cb);
      return jest.fn();
    });

    mockGetActiveRide.mockResolvedValue({
      id: 77,
      status: 'in_progress',
      driver_name: 'Cheikh Ould',
      driver_picture: null,
      vehicle: 'Hyundai Accent',
      plate_number: 'NKC-4444',
      pickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
      destination: { label: 'Toujounine', position: [18.0896, -15.9754] },
      stops: [],
      fare: 280,
      pin_code: '3456',
      eta_minutes: 2,
    });

    renderRiderHome();

    // Wait for the active ride tracking view
    await waitFor(() => {
      expect(screen.getByText('Cheikh Ould')).toBeInTheDocument();
    });

    // Simulate ride completion via WebSocket
    act(() => {
      rideUpdateCallbacks.forEach((callback) => callback({ ride_id: 77, status: 'completed' }));
    });

    // Completed ride must remain available so the rider can pay and rate.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Rate your driver/i })).toBeInTheDocument();
    });

    expect(screen.getByText('Cheikh Ould')).toBeInTheDocument();
  }, 10000);

  it('includes intermediate stops in the ride request payload', async () => {
    renderRiderHome();

    openLocationStep();

    const pickupInput = screen.getByPlaceholderText('Search pickup location...');
    fireEvent.change(pickupInput, { target: { value: 'Ksar' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option').find((el) => el.textContent.includes('Ksar'))).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Ksar')));

    const destinationInput = screen.getByPlaceholderText('Search destination location...');
    fireEvent.change(destinationInput, { target: { value: 'Arafat' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option').find((el) => el.textContent.includes('Arafat'))).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Arafat')));

    const addStopInput = screen.getByPlaceholderText('Search add stop 1 location...');
    fireEvent.change(addStopInput, { target: { value: 'Sebkha' } });
    await waitFor(() => {
      expect(screen.getAllByRole('option').find((el) => el.textContent.includes('Sebkha'))).toBeTruthy();
    });
    fireEvent.click(screen.getAllByRole('option').find((el) => el.textContent.includes('Sebkha')));

    fireEvent.click(screen.getByRole('button', { name: /Find Rides/i }));

    await waitFor(() => {
      expect(screen.getByText('Your route')).toBeInTheDocument();
      expect(screen.getByText('Sebkha')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Regular/));
    fireEvent.click(screen.getByRole('button', { name: /Confirm booking/i }));

    await waitFor(() => {
      expect(mockRequestRide).toHaveBeenCalled();
    });

    const requestPayload = mockRequestRide.mock.calls[0][0];
    expect(requestPayload.stops).toHaveLength(1);
    expect(requestPayload.stops[0].location_name).toMatch(/Sebkha/i);
    expect(requestPayload.stops[0].stop_order).toBe(1);
  }, 15000);
});
