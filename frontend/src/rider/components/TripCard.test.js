import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TripCard, { formatTripDate } from './TripCard';

const mockTrip = {
  id: 1,
  date: '2024-03-15T14:30:00Z',
  pickup_address: '123 Main Street, Nouakchott',
  destination_address: '456 Market Ave, Nouakchott',
  fare: 1500,
  ride_type: 'regular',
  status: 'completed',
  driver_name: 'Amadou',
  rating: 4,
  route_path: [[18.09, -15.97], [18.10, -15.96]],
};

describe('TripCard component', () => {
  it('displays date, pickup address, destination address, fare, ride type, and status', () => {
    render(<TripCard trip={mockTrip} onExpand={() => {}} expanded={false} />);

    expect(screen.getByText(formatTripDate(mockTrip.date))).toBeInTheDocument();
    expect(screen.getByText(mockTrip.pickup_address)).toBeInTheDocument();
    expect(screen.getByText(mockTrip.destination_address)).toBeInTheDocument();
    expect(screen.getByText('1500 MRU')).toBeInTheDocument();
    expect(screen.getByText(/regular/i)).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('calls onExpand with trip id when clicked', () => {
    const onExpand = jest.fn();
    render(<TripCard trip={mockTrip} onExpand={onExpand} expanded={false} />);

    fireEvent.click(screen.getByRole('button'));
    expect(onExpand).toHaveBeenCalledWith(1);
  });

  it('shows expanded details when expanded is true', () => {
    render(<TripCard trip={mockTrip} onExpand={() => {}} expanded={true} />);

    expect(screen.getByText('Amadou')).toBeInTheDocument();
    expect(screen.getByText(/Route map/i)).toBeInTheDocument();
    expect(screen.getByLabelText('4 out of 5 stars')).toBeInTheDocument();
  });

  it('does not show expanded details when expanded is false', () => {
    render(<TripCard trip={mockTrip} onExpand={() => {}} expanded={false} />);

    expect(screen.queryByText('Amadou')).not.toBeInTheDocument();
    expect(screen.queryByText(/Route map/i)).not.toBeInTheDocument();
  });

  it('renders cancelled status with appropriate styling class', () => {
    const cancelledTrip = { ...mockTrip, status: 'cancelled' };
    const { container } = render(
      <TripCard trip={cancelledTrip} onExpand={() => {}} expanded={false} />
    );

    const statusBadge = container.querySelector('.trip-card__status--cancelled');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveTextContent('Cancelled');
  });

  it('renders completed status with appropriate styling class', () => {
    const { container } = render(
      <TripCard trip={mockTrip} onExpand={() => {}} expanded={false} />
    );

    const statusBadge = container.querySelector('.trip-card__status--completed');
    expect(statusBadge).toBeInTheDocument();
  });

  it('handles trip without optional fields gracefully', () => {
    const minimalTrip = {
      id: 2,
      date: '2024-03-10T10:00:00Z',
      pickup_address: 'Airport',
      destination_address: 'Hotel',
      fare: 2000,
      ride_type: 'comfort',
      status: 'completed',
    };

    render(<TripCard trip={minimalTrip} onExpand={() => {}} expanded={true} />);

    expect(screen.getByText('Airport')).toBeInTheDocument();
    expect(screen.getByText('Hotel')).toBeInTheDocument();
    // No driver or rating shown when not provided
    expect(screen.queryByText('Driver')).not.toBeInTheDocument();
    expect(screen.queryByText('Rating')).not.toBeInTheDocument();
  });

  it('sets aria-expanded attribute on the summary button', () => {
    const { rerender } = render(
      <TripCard trip={mockTrip} onExpand={() => {}} expanded={false} />
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

    rerender(<TripCard trip={mockTrip} onExpand={() => {}} expanded={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('formatTripDate', () => {
  it('returns a formatted date string for valid ISO dates', () => {
    const result = formatTripDate('2024-03-15T14:30:00Z');
    // Should contain month, day, year
    expect(result).toMatch(/Mar/i);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2024/);
  });

  it('returns original string for invalid dates', () => {
    expect(formatTripDate('not-a-date')).toBe('not-a-date');
  });
});
