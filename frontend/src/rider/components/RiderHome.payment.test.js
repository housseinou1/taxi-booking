import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RiderHome from './RiderHome';
import { RideProvider } from '../context/RideContext';
import { PAYMENT_METHOD_STORAGE_KEY } from '../utils/paymentMethods';

// ─── i18n ────────────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
    i18n: { language: 'en', changeLanguage: jest.fn() },
  }),
}));

// ─── MapView ──────────────────────────────────────────────────────────────────
jest.mock('./MapView', () => {
  return function MockMapView() {
    return <div data-testid="mapview-container" />;
  };
});

// ─── ws + route services ───────────────────────────────────────────────────────
jest.mock('../services/wsService', () => ({
  __esModule: true,
  default: {
    subscribeRideUpdates: () => jest.fn(),
    subscribeDriverPosition: () => jest.fn(),
    joinRideGroup: jest.fn(),
    leaveRideGroup: jest.fn(),
  },
  resetWsConnection: jest.fn(),
}));

const mockGetRoute = jest.fn();
jest.mock('../services/routeService', () => ({
  __esModule: true,
  default: { getRoute: (...args) => mockGetRoute(...args) },
  getRoute: (...args) => mockGetRoute(...args),
}));

// ─── apiService — NOTE: includes estimateFare (used by useFareEstimates) ────────
const mockRequestRide = jest.fn();
const mockGetRiderProfile = jest.fn();
const mockGetActiveRide = jest.fn();
const mockValidatePromo = jest.fn();
const mockEstimateFare = jest.fn();

jest.mock('../services/apiService', () => ({
  __esModule: true,
  default: {
    requestRide: (...args) => mockRequestRide(...args),
    getRiderProfile: (...args) => mockGetRiderProfile(...args),
    getActiveRide: (...args) => mockGetActiveRide(...args),
    validatePromo: (...args) => mockValidatePromo(...args),
    estimateFare: (...args) => mockEstimateFare(...args),
  },
  requestRide: (...args) => mockRequestRide(...args),
  getRiderProfile: (...args) => mockGetRiderProfile(...args),
  getActiveRide: (...args) => mockGetActiveRide(...args),
  validatePromo: (...args) => mockValidatePromo(...args),
  estimateFare: (...args) => mockEstimateFare(...args),
}));

// ─── legalApi — assert the confirm sequence calls acceptRideLegal then requestRide ─
const mockAcceptRideLegal = jest.fn();
const mockFetchLegalStatus = jest.fn();
jest.mock('../../legal/legalApi', () => ({
  __esModule: true,
  acceptRideLegal: (...args) => mockAcceptRideLegal(...args),
  fetchLegalStatus: (...args) => mockFetchLegalStatus(...args),
}));

// ─── marketConfig ────────────────────────────────────────────────────────────
jest.mock('../../marketConfig', () => ({
  MARKET: {
    defaultCity: 'Nouakchott',
    defaultPickup: { label: 'Sebkha', position: [18.0735, -15.9582] },
    defaultDestination: { label: 'Toujounine', position: [18.0896, -15.9754] },
    center: [18.0735, -15.9582],
    currency: 'MRU',
    locations: [
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
    ],
    fare: {
      regular: { label: 'Regular', base: 175, perKm: 20 },
      xl: { label: 'XL', base: 225, perKm: 25 },
      comfort: { label: 'Comfort', base: 275, perKm: 30 },
      share: { label: 'Share', base: 150, perKm: 15 },
    },
  },
  getLocationsByCity: (city) =>
    [
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
    ].filter((l) => l.city === city),
  calculateFare: (rideType, distanceKm) => {
    const pricing = { regular: { base: 175, perKm: 20 }, xl: { base: 225, perKm: 25 }, comfort: { base: 275, perKm: 30 }, share: { base: 150, perKm: 15 } };
    const p = pricing[rideType] || pricing.regular;
    return Math.round((p.base + (Number(distanceKm) || 0) * p.perKm) * 100) / 100;
  },
  calculateDistanceKm: () => 5,
  isPointInServiceArea: () => true,
}));

// ─── locationFilter ─────────────────────────────────────────────────────────
jest.mock('../utils/locationFilter', () => ({
  filterLocations: (query, city) => {
    const locations = [
      { city: 'Nouakchott', label: 'Ksar', position: [18.1002, -15.9631] },
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
    ];
    if (!query || !query.trim()) return locations.filter((l) => l.city === city);
    const q = query.trim().toLowerCase();
    return locations.filter((l) => l.city === city && l.label.toLowerCase().includes(q));
  },
}));

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

async function navigateToConfirm() {
  openLocationStep();

  const pickupInput = screen.getByPlaceholderText('Search pickup location...');
  fireEvent.change(pickupInput, { target: { value: 'Ksar' } });
  await waitFor(() => {
    expect(screen.getAllByRole('option').find((el) => el.textContent.includes('Ksar'))).toBeTruthy();
  });
  fireEvent.mouseDown(screen.getAllByRole('option').find((el) => el.textContent.includes('Ksar')));

  const destinationInput = screen.getByPlaceholderText('Search destination location...');
  fireEvent.change(destinationInput, { target: { value: 'Arafat' } });
  await waitFor(() => {
    expect(screen.getAllByRole('option').find((el) => el.textContent.includes('Arafat'))).toBeTruthy();
  });
  fireEvent.mouseDown(screen.getAllByRole('option').find((el) => el.textContent.includes('Arafat')));

  await waitFor(() => {
    expect(screen.getByText('Confirm Your Ride')).toBeInTheDocument();
  });
}

function acceptTerms() {
  // Tick both legal checkboxes so the Confirm button becomes enabled.
  const checkboxes = screen.getAllByRole('checkbox');
  checkboxes.forEach((box) => {
    if (!box.checked) fireEvent.click(box);
  });
}

describe('RiderHome — payment selector wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetRiderProfile.mockResolvedValue({ phone_number: '+22245001234', profile_picture: 'p.jpg' });
    mockGetActiveRide.mockResolvedValue(null);
    mockFetchLegalStatus.mockResolvedValue({ ride: { compliance_current: false, requires_resign: false } });
    mockGetRoute.mockResolvedValue({ points: [[18.1002, -15.9631], [18.0466, -15.9657]], distanceKm: 5, etaMinutes: 8 });
    mockEstimateFare.mockResolvedValue({ ride_type: 'regular', estimated_fare: 275, base_fare: 175 });
    mockAcceptRideLegal.mockResolvedValue({});
    mockRequestRide.mockResolvedValue({
      id: 42, status: 'accepted', pin_code: '1234', driver_name: 'Amadou Ba',
      vehicle: 'Toyota Hilux', plate_number: 'NKC-9876',
      pickup: { label: 'Ksar', position: [18.1002, -15.9631] },
      destination: { label: 'Arafat', position: [18.0466, -15.9657] },
      stops: [], fare: 300, eta_minutes: 8,
    });
  });

  it('initializes the payment method from readStoredPaymentMethod() (Bankily persisted)', async () => {
    localStorage.setItem(PAYMENT_METHOD_STORAGE_KEY, 'bankily');
    renderRiderHome();
    await navigateToConfirm();

    const group = within(screen.getByRole('group', { name: /payment method/i }));
    expect(group.getByRole('button', { name: 'Bankily' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to Cash when nothing is stored', async () => {
    renderRiderHome();
    await navigateToConfirm();

    const group = within(screen.getByRole('group', { name: /payment method/i }));
    expect(group.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('selecting Bankily updates state: Bankily selected, Cash deselected, and persists', async () => {
    renderRiderHome();
    await navigateToConfirm();

    const group = within(screen.getByRole('group', { name: /payment method/i }));
    fireEvent.click(group.getByRole('button', { name: 'Bankily' }));

    await waitFor(() => {
      expect(group.getByRole('button', { name: 'Bankily' })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(group.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY)).toBe('bankily');
  });

  it('switching among methods updates the selected state each time', async () => {
    renderRiderHome();
    await navigateToConfirm();

    const group = within(screen.getByRole('group', { name: /payment method/i }));

    fireEvent.click(group.getByRole('button', { name: 'Masravi' }));
    await waitFor(() => {
      expect(group.getByRole('button', { name: 'Masravi' })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY)).toBe('masrvi');

    fireEvent.click(group.getByRole('button', { name: 'Sedad' }));
    await waitFor(() => {
      expect(group.getByRole('button', { name: 'Sedad' })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(group.getByRole('button', { name: 'Masravi' })).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY)).toBe('seddad');

    fireEvent.click(group.getByRole('button', { name: 'Card' }));
    await waitFor(() => {
      expect(group.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    });
    expect(localStorage.getItem(PAYMENT_METHOD_STORAGE_KEY)).toBe('card');
  });
});

describe('RiderHome — handleConfirmBooking legal → requestRide sequence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockGetRiderProfile.mockResolvedValue({ phone_number: '+22245001234', profile_picture: 'p.jpg' });
    mockGetActiveRide.mockResolvedValue(null);
    mockFetchLegalStatus.mockResolvedValue({ ride: { compliance_current: false, requires_resign: false } });
    mockGetRoute.mockResolvedValue({ points: [[18.1002, -15.9631], [18.0466, -15.9657]], distanceKm: 5, etaMinutes: 8 });
    mockEstimateFare.mockResolvedValue({ ride_type: 'regular', estimated_fare: 275, base_fare: 175 });
    mockAcceptRideLegal.mockResolvedValue({});
    mockRequestRide.mockResolvedValue({
      id: 42, status: 'accepted', pin_code: '1234', driver_name: 'Amadou Ba',
      vehicle: 'Toyota Hilux', plate_number: 'NKC-9876',
      pickup: { label: 'Ksar', position: [18.1002, -15.9631] },
      destination: { label: 'Arafat', position: [18.0466, -15.9657] },
      stops: [], fare: 300, eta_minutes: 8,
    });
  });

  it('accepts legal terms first, then calls requestRide', async () => {
    renderRiderHome();
    await navigateToConfirm();

    acceptTerms();

    fireEvent.click(screen.getByRole('button', { name: /Confirm booking/i }));

    await waitFor(() => {
      expect(mockAcceptRideLegal).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockRequestRide).toHaveBeenCalledTimes(1);
    });

    // Ordering: legal acceptance resolves before the ride request fires.
    const legalOrder = mockAcceptRideLegal.mock.invocationCallOrder[0];
    const requestOrder = mockRequestRide.mock.invocationCallOrder[0];
    expect(legalOrder).toBeLessThan(requestOrder);
  }, 15000);

  it('surfaces the backend error from acceptRideLegal without masking it', async () => {
    mockAcceptRideLegal.mockRejectedValue(
      new Error('Rider account must be approved by admin before requesting a ride.')
    );

    renderRiderHome();
    await navigateToConfirm();
    acceptTerms();

    fireEvent.click(screen.getByRole('button', { name: /Confirm booking/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Rider account must be approved by admin before requesting a ride.')
      ).toBeInTheDocument();
    });
    // requestRide must not be reached when legal acceptance fails.
    expect(mockRequestRide).not.toHaveBeenCalled();
  }, 15000);
});
