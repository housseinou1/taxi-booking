import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import RideTracker from './RideTracker';

// Mock wsService
jest.mock('../services/wsService', () => {
  const mock = {
    __esModule: true,
    default: {
      subscribeRideUpdates: jest.fn(),
      subscribeDriverPosition: jest.fn(() => () => {}),
      leaveRideGroup: jest.fn(),
    },
    subscribeRideUpdates: jest.fn(),
    subscribeDriverPosition: jest.fn(() => () => {}),
    leaveRideGroup: jest.fn(),
  };
  return mock;
});

// Mock apiService.cancelRide
jest.mock('../services/apiService', () => ({
  cancelRide: jest.fn(),
}));

const { cancelRide } = require('../services/apiService');
const wsService = require('../services/wsService').default;

// Track WS callbacks for ETA update tests
let wsCallbacks = [];

// -------------------------------------------------------------------
// Test data
// -------------------------------------------------------------------

const makeRide = (overrides = {}) => ({
  id: 101,
  status: 'driver_arriving',
  driver_name: 'Moussa Diallo',
  driver_picture: 'https://example.com/photo.jpg',
  driver_avg_rating: 4.8,
  driver_level_label: 'Gold',
  driver_code: '900001',
  driver_verified: true,
  vehicle: 'Toyota Corolla',
  vehicle_make: 'Toyota',
  vehicle_model: 'Corolla',
  vehicle_color: 'White',
  vehicle_category_label: 'Comfort',
  vehicle_photo_url: 'https://example.com/car.jpg',
  vehicle_verified: true,
  plate_number: 'NKC-4521',
  pickup: { label: 'Marché Capitale', position: [18.09, -15.97] },
  destination: { label: 'Aéroport', position: [18.10, -15.94] },
  stops: [],
  fare: 450,
  pin_code: '4729',
  eta_minutes: 5,
  ...overrides,
});

// -------------------------------------------------------------------
// Component tests
// -------------------------------------------------------------------

describe('RideTracker component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wsCallbacks = [];
    wsService.subscribeRideUpdates.mockImplementation((cb) => {
      wsCallbacks.push(cb);
      return () => {
        wsCallbacks = wsCallbacks.filter((fn) => fn !== cb);
      };
    });
  });

  describe('Driver Info display', () => {
    it('renders driver name', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByText('Moussa Diallo')).toBeInTheDocument();
    });

    it('renders vehicle and plate number', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByText('NKC-4521')).toBeInTheDocument();
      expect(screen.getByText('Toyota Corolla')).toBeInTheDocument();
    });

    it('renders visible driver phone number in the driver card', () => {
      render(<RideTracker ride={makeRide({ driver_phone: '+22240001122' })} />);
      expect(screen.getByText('📞 +22240001122')).toBeInTheDocument();
    });

    it('renders rating, level, driver code, and Yala verification', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByText('★ 4.8')).toBeInTheDocument();
      expect(screen.getByText('Gold')).toBeInTheDocument();
      expect(screen.getByText('Code 900001')).toBeInTheDocument();
      expect(screen.getByText('Verified by Yala')).toBeInTheDocument();
    });

    it('renders vehicle photo, category, color, and verification', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByAltText('Toyota Corolla vehicle')).toHaveAttribute(
        'src',
        'https://example.com/car.jpg'
      );
      expect(screen.getByText('White · Comfort')).toBeInTheDocument();
      expect(screen.getByText('Verified vehicle')).toBeInTheDocument();
    });

    it('shows live movement message after driver acceptance', () => {
      render(
        <RideTracker
          ride={makeRide({
            pickup_lat: 18.09,
            pickup_lng: -15.97,
          })}
          driverPosition={[18.08, -15.97]}
        />
      );
      expect(screen.getByText(/Driver moving to pickup/i)).toBeInTheDocument();
    });

    it('renders driver photo when available', () => {
      render(<RideTracker ride={makeRide()} />);
      const img = screen.getByAltText('Moussa Diallo profile');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
    });

    it('renders placeholder when no driver photo', () => {
      const { container } = render(
        <RideTracker ride={makeRide({ driver_picture: null })} />
      );
      const placeholder = container.querySelector('.ride-tracker__driver-photo--placeholder');
      expect(placeholder).toBeInTheDocument();
    });
  });

  describe('Progress indicator', () => {
    it('renders all 5 progress steps', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByText('Finding Driver')).toBeInTheDocument();
      expect(screen.getByText('Driver Arriving')).toBeInTheDocument();
      expect(screen.getByText('Arrived')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('highlights active step based on ride status', () => {
      const { container } = render(
        <RideTracker ride={makeRide({ status: 'driver_arrived' })} />
      );
      const steps = container.querySelectorAll('.ride-tracker__step');
      // Step 0 (Finding Driver) should be completed
      expect(steps[0]).toHaveClass('ride-tracker__step--completed');
      // Step 1 (Driver Arriving) should be completed
      expect(steps[1]).toHaveClass('ride-tracker__step--completed');
      // Step 2 (Arrived) should be active
      expect(steps[2]).toHaveClass('ride-tracker__step--active');
    });

    it('marks in_progress step as active', () => {
      const { container } = render(
        <RideTracker ride={makeRide({ status: 'in_progress' })} />
      );
      const steps = container.querySelectorAll('.ride-tracker__step');
      expect(steps[0]).toHaveClass('ride-tracker__step--completed');
      expect(steps[1]).toHaveClass('ride-tracker__step--completed');
      expect(steps[2]).toHaveClass('ride-tracker__step--completed');
      expect(steps[3]).toHaveClass('ride-tracker__step--active');
    });
  });

  describe('ETA display', () => {
    it('renders ETA from ride prop', () => {
      render(<RideTracker ride={makeRide({ eta_minutes: 7 })} />);
      expect(screen.getByText('7 min')).toBeInTheDocument();
    });

    it('renders dash when ETA is null', () => {
      render(<RideTracker ride={makeRide({ eta_minutes: null })} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('updates ETA from WebSocket message', () => {
      render(<RideTracker ride={makeRide({ eta_minutes: 5 })} />);
      expect(screen.getByText('5 min')).toBeInTheDocument();

      act(() => {
        wsCallbacks.forEach((cb) => cb({ ride_id: 101, eta_minutes: 3 }));
      });

      expect(screen.getByText('3 min')).toBeInTheDocument();
    });

    it('estimates ETA from coordinates included in the active ride', () => {
      render(
        <RideTracker
          ride={makeRide({
            eta_minutes: null,
            driver_current_lat: 18.08,
            driver_current_lng: -15.97,
          })}
        />
      );

      expect(screen.getByText('2 min')).toBeInTheDocument();
    });
  });

  describe('PIN code display', () => {
    it('renders the ride PIN code', () => {
      render(<RideTracker ride={makeRide({ pin_code: '4729' })} />);
      expect(screen.getByText('4729')).toBeInTheDocument();
    });

    it('renders the PIN label', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByText('Ride PIN')).toBeInTheDocument();
    });

    it('prefers the backend pickup_pin field', () => {
      render(<RideTracker ride={makeRide({ pickup_pin: '8642', pin_code: '' })} />);
      expect(screen.getByText('8642')).toBeInTheDocument();
    });
  });

  describe('Assignment state', () => {
    it('shows searching only before a driver is assigned', () => {
      render(
        <RideTracker
          ride={makeRide({
            status: 'requested',
            driver_name: '',
            driver_code: '',
            driver: null,
            eta_minutes: null,
            pickup_pin: '',
            pin_code: '',
          })}
        />
      );
      expect(screen.getByText('Looking for a nearby driver')).toBeInTheDocument();
      expect(screen.queryByText('Verified by Yala')).not.toBeInTheDocument();
    });

    it('shows no-driver message when dispatch fails', () => {
      render(
        <RideTracker
          ride={makeRide({
            status: 'requested',
            driver_name: '',
            driver_code: '',
            driver: null,
            dispatch_status: 'no_driver_found',
            eta_minutes: null,
            pickup_pin: '',
            pin_code: '',
          })}
        />
      );
      expect(screen.getByText('No driver available right now')).toBeInTheDocument();
    });

    it('removes searching message after acceptance', () => {
      render(<RideTracker ride={makeRide({ status: 'driver_arriving' })} />);
      expect(screen.queryByText('Looking for a nearby driver')).not.toBeInTheDocument();
      expect(screen.getByText('Verified by Yala')).toBeInTheDocument();
    });

    it('removes searching message when driver accepted but name not yet loaded', () => {
      render(
        <RideTracker
          ride={makeRide({
            status: 'driver_arriving',
            driver_name: '',
            driver_first_name: '',
            driver_last_name: '',
            driver: 42,
            eta_minutes: 8,
          })}
          driverPosition={[18.08, -15.96]}
        />
      );
      expect(screen.queryByText('Looking for a nearby driver')).not.toBeInTheDocument();
      expect(screen.getByText('Verified by Yala')).toBeInTheDocument();
      expect(screen.getByLabelText('Driver and vehicle information')).toBeInTheDocument();
    });

    it('hides searching once ETA is available during stale requested status', () => {
      render(
        <RideTracker
          ride={makeRide({
            status: 'requested',
            driver_name: '',
            driver: 42,
            eta_minutes: 8,
          })}
          driverPosition={[18.08, -15.96]}
        />
      );
      expect(screen.queryByText('Looking for a nearby driver')).not.toBeInTheDocument();
    });
  });

  describe('Cancel button visibility', () => {
    it('shows cancel button when status is cancellable', () => {
      render(<RideTracker ride={makeRide({ status: 'driver_arriving' })} />);
      expect(screen.getByLabelText('Cancel ride')).toBeInTheDocument();
    });

    it('shows cancel button for driver_arrived status', () => {
      render(<RideTracker ride={makeRide({ status: 'driver_arrived' })} />);
      expect(screen.getByLabelText('Cancel ride')).toBeInTheDocument();
    });

    it('hides cancel button when in_progress', () => {
      render(<RideTracker ride={makeRide({ status: 'in_progress' })} />);
      expect(screen.queryByLabelText('Cancel ride')).not.toBeInTheDocument();
    });

    it('hides cancel button when completed', () => {
      render(<RideTracker ride={makeRide({ status: 'completed' })} />);
      expect(screen.queryByLabelText('Cancel ride')).not.toBeInTheDocument();
    });

    it('shows rate action when completed', () => {
      const onPayRate = jest.fn();
      render(<RideTracker ride={makeRide({ status: 'completed' })} onPayRate={onPayRate} />);
      fireEvent.click(screen.getByRole('button', { name: /rate your driver/i }));
      expect(onPayRate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cancel modal', () => {
    it('opens modal when cancel button is clicked', () => {
      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      expect(screen.getByRole('dialog', { name: 'Cancel Ride' })).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Cancel Ride' }).parentElement).toBe(document.body);
    });

    it('keeps modal pointer gestures from reaching the bottom sheet', () => {
      const onPointerDown = jest.fn();
      const onPointerUp = jest.fn();
      render(
        <div onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          <RideTracker ride={makeRide()} />
        </div>
      );
      fireEvent.click(screen.getByLabelText('Cancel ride'));

      const reason = screen.getByRole('radio', { name: 'Wrong pickup location' });
      fireEvent.pointerDown(reason);
      fireEvent.pointerUp(reason);
      fireEvent.click(reason);

      expect(onPointerDown).not.toHaveBeenCalled();
      expect(onPointerUp).not.toHaveBeenCalled();
      expect(reason).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('button', { name: 'Confirm Cancel' })).toBeEnabled();
    });

    it('displays cancellation reason options', () => {
      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      expect(screen.getByText('Driver too far')).toBeInTheDocument();
      expect(screen.getByText('Changed my mind')).toBeInTheDocument();
      expect(screen.getByText('Wrong pickup location')).toBeInTheDocument();
    });

    it('disables confirm button when no reason selected', () => {
      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      const confirmBtn = screen.getByText('Confirm Cancel');
      expect(confirmBtn).toBeDisabled();
    });

    it('enables confirm button after selecting a reason', () => {
      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      fireEvent.click(screen.getByText('Changed my mind'));
      const confirmBtn = screen.getByText('Confirm Cancel');
      expect(confirmBtn).not.toBeDisabled();
    });

    it('calls cancelRide API with reason on confirm', async () => {
      cancelRide.mockResolvedValue({ success: true });
      const onCancelSuccess = jest.fn();

      render(<RideTracker ride={makeRide()} onCancelSuccess={onCancelSuccess} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      fireEvent.click(screen.getByText('Changed my mind'));
      fireEvent.click(screen.getByText('Confirm Cancel'));

      await waitFor(() => {
        expect(cancelRide).toHaveBeenCalledWith(101, 'Changed my mind');
      });

      await waitFor(() => {
        expect(onCancelSuccess).toHaveBeenCalled();
      });
    });

    it('shows error when cancellation fails', async () => {
      cancelRide.mockRejectedValue(new Error('Server unavailable'));

      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      fireEvent.click(screen.getByText('Changed my mind'));
      fireEvent.click(screen.getByText('Confirm Cancel'));

      await waitFor(() => {
        expect(screen.getByText('Server unavailable')).toBeInTheDocument();
      });
    });

    it('dismisses modal on Keep Ride click', () => {
      render(<RideTracker ride={makeRide()} />);
      fireEvent.click(screen.getByLabelText('Cancel ride'));
      expect(screen.getByRole('dialog', { name: 'Cancel Ride' })).toBeInTheDocument();

      fireEvent.click(screen.getByText('Keep Ride'));
      expect(screen.queryByRole('dialog', { name: 'Cancel Ride' })).not.toBeInTheDocument();
    });
  });

  describe('Chat and SOS buttons', () => {
    it('renders chat button', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByLabelText('Chat with driver')).toBeInTheDocument();
    });

    it('renders SOS button', () => {
      render(<RideTracker ride={makeRide()} />);
      expect(screen.getByLabelText('Emergency SOS')).toBeInTheDocument();
    });

    it('calls onChat when chat button is clicked', () => {
      const onChat = jest.fn();
      render(<RideTracker ride={makeRide()} onChat={onChat} />);
      fireEvent.click(screen.getByLabelText('Chat with driver'));
      expect(onChat).toHaveBeenCalledTimes(1);
    });

    it('calls onSOS when SOS button is clicked', () => {
      const onSOS = jest.fn();
      render(<RideTracker ride={makeRide()} onSOS={onSOS} />);
      fireEvent.click(screen.getByLabelText('Emergency SOS'));
      expect(onSOS).toHaveBeenCalledTimes(1);
    });
  });
});
