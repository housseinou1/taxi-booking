import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import BookingConfirmation from './BookingConfirmation';
import PromoCodeInput from './PromoCodeInput';

// -------------------------------------------------------------------
// PromoCodeInput tests
// -------------------------------------------------------------------

describe('PromoCodeInput component', () => {
  const defaultProps = {
    onApply: jest.fn(),
    currentCode: undefined,
    error: undefined,
    loading: false,
  };

  beforeEach(() => {
    defaultProps.onApply.mockClear();
  });

  it('renders the promo code input field', () => {
    render(<PromoCodeInput {...defaultProps} />);
    expect(screen.getByPlaceholderText('Enter promo code')).toBeInTheDocument();
  });

  it('renders the Apply button', () => {
    render(<PromoCodeInput {...defaultProps} />);
    expect(screen.getByRole('button', { name: /apply promo code/i })).toBeInTheDocument();
  });

  it('disables the Apply button when input is empty', () => {
    render(<PromoCodeInput {...defaultProps} />);
    const btn = screen.getByRole('button', { name: /apply promo code/i });
    expect(btn).toBeDisabled();
  });

  it('enables the Apply button when input has value', () => {
    render(<PromoCodeInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('Enter promo code');
    fireEvent.change(input, { target: { value: 'PROMO10' } });
    const btn = screen.getByRole('button', { name: /apply promo code/i });
    expect(btn).not.toBeDisabled();
  });

  it('calls onApply with trimmed code when Apply is clicked', () => {
    render(<PromoCodeInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('Enter promo code');
    fireEvent.change(input, { target: { value: '  RIDE50  ' } });
    fireEvent.click(screen.getByRole('button', { name: /apply promo code/i }));
    expect(defaultProps.onApply).toHaveBeenCalledWith('RIDE50');
  });

  it('calls onApply on Enter key press', () => {
    render(<PromoCodeInput {...defaultProps} />);
    const input = screen.getByPlaceholderText('Enter promo code');
    fireEvent.change(input, { target: { value: 'CODE123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onApply).toHaveBeenCalledWith('CODE123');
  });

  it('displays success message when currentCode is set', () => {
    render(<PromoCodeInput {...defaultProps} currentCode="SAVE20" />);
    expect(screen.getByText(/code "SAVE20" applied/i)).toBeInTheDocument();
  });

  it('displays error message when error prop is set', () => {
    render(<PromoCodeInput {...defaultProps} error="Invalid promo code" />);
    expect(screen.getByText('Invalid promo code')).toBeInTheDocument();
  });

  it('disables input and button when loading', () => {
    render(<PromoCodeInput {...defaultProps} loading={true} />);
    expect(screen.getByPlaceholderText('Enter promo code')).toBeDisabled();
  });
});

// -------------------------------------------------------------------
// BookingConfirmation tests
// -------------------------------------------------------------------

describe('BookingConfirmation component', () => {
  const mockPickup = { label: 'Ksar Market', position: [18.09, -15.97] };
  const mockDestination = { label: 'Airport', position: [18.10, -15.94] };
  const mockStops = [
    { label: 'Hotel Mauritania', position: [18.095, -15.96] },
  ];

  const defaultProps = {
    pickup: mockPickup,
    destination: mockDestination,
    stops: [],
    rideType: 'regular',
    fare: 500,
    discountedFare: undefined,
    promoCode: undefined,
    onConfirm: jest.fn(),
    onPromoApply: jest.fn(),
    loading: false,
    error: undefined,
    profile: { profile_picture: 'photo.jpg', phone_number: '+22212345678' },
    routeInfo: { distanceKm: 5, etaMinutes: 10 },
    promoError: undefined,
    promoLoading: false,
    legalCompliant: true,
  };

  beforeEach(() => {
    defaultProps.onConfirm.mockClear();
    defaultProps.onPromoApply.mockClear();
  });

  it('renders the booking title', () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.getByText('Confirm Your Ride')).toBeInTheDocument();
  });

  it('displays pickup location', () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.getByText('Ksar Market')).toBeInTheDocument();
  });

  it('displays destination location', () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.getByText('Airport')).toBeInTheDocument();
  });

  it('displays intermediate stops', () => {
    render(<BookingConfirmation {...defaultProps} stops={mockStops} />);
    expect(screen.getByText('Hotel Mauritania')).toBeInTheDocument();
    expect(screen.getByText('Stop 1')).toBeInTheDocument();
  });

  it('displays ride type', () => {
    render(<BookingConfirmation {...defaultProps} rideType="comfort" />);
    expect(screen.getAllByText('Comfort').length).toBeGreaterThan(0);
  });

  it('displays fare amount in MRU', () => {
    render(<BookingConfirmation {...defaultProps} fare={500} />);
    expect(screen.getByText('500 MRU')).toBeInTheDocument();
  });

  it('displays complete fare estimate details', () => {
    render(
      <BookingConfirmation
        {...defaultProps}
        rideType="xl"
        routeInfo={{ distanceKm: 7.25, etaMinutes: 12, durationMinutes: 18 }}
        paymentMethod="bankily"
      />
    );

    const estimateDetails = within(screen.getByLabelText('Fare estimate details'));
    expect(estimateDetails.getByText('Estimated arrival')).toBeInTheDocument();
    expect(estimateDetails.getByText('12 min')).toBeInTheDocument();
    expect(estimateDetails.getByText('Distance')).toBeInTheDocument();
    expect(estimateDetails.getByText('7.3 km')).toBeInTheDocument();
    expect(estimateDetails.getByText('Duration')).toBeInTheDocument();
    expect(estimateDetails.getByText('18 min')).toBeInTheDocument();
    expect(estimateDetails.getByText('XL')).toBeInTheDocument();
    expect(estimateDetails.getByText('Bankily')).toBeInTheDocument();
  });

  it('displays discounted fare with original struck through', () => {
    const { container } = render(
      <BookingConfirmation {...defaultProps} fare={500} discountedFare={400} />
    );
    const original = container.querySelector('.booking-confirmation__fare-original');
    expect(original).toHaveTextContent('500 MRU');
    const amount = container.querySelector('.booking-confirmation__fare-amount');
    expect(amount).toHaveTextContent('400 MRU');
  });

  it('calls onConfirm when confirm button is clicked with complete profile', () => {
    render(<BookingConfirmation {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('allows booking when profile is incomplete', () => {
    render(
      <BookingConfirmation
        {...defaultProps}
        profile={{ profile_picture: null, phone_number: '+22212345678' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/complete your profile/i)).not.toBeInTheDocument();
  });

  it('allows booking when phone_number is missing', () => {
    render(
      <BookingConfirmation
        {...defaultProps}
        profile={{ profile_picture: 'photo.jpg', phone_number: '' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /confirm booking/i }));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/complete your profile/i)).not.toBeInTheDocument();
  });

  it('shows loading state on confirm button', () => {
    render(<BookingConfirmation {...defaultProps} loading={true} />);
    const btn = screen.getByRole('button', { name: /requesting ride/i });
    expect(btn).toBeDisabled();
    expect(screen.getByText('Requesting...')).toBeInTheDocument();
  });

  it('prevents duplicate submissions when loading', () => {
    render(<BookingConfirmation {...defaultProps} loading={true} />);
    const btn = screen.getByRole('button', { name: /requesting ride/i });
    fireEvent.click(btn);
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  it('displays error notification when error prop is set', () => {
    render(<BookingConfirmation {...defaultProps} error="Server error" />);
    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('renders PromoCodeInput section', () => {
    render(<BookingConfirmation {...defaultProps} />);
    expect(screen.getByPlaceholderText('Enter promo code')).toBeInTheDocument();
  });

  it('passes onPromoApply to PromoCodeInput', () => {
    render(<BookingConfirmation {...defaultProps} />);
    const input = screen.getByPlaceholderText('Enter promo code');
    fireEvent.change(input, { target: { value: 'TEST' } });
    fireEvent.click(screen.getByRole('button', { name: /apply promo code/i }));
    expect(defaultProps.onPromoApply).toHaveBeenCalledWith('TEST');
  });
});
