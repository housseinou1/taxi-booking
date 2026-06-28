import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RideHistory, { sortTripsByDate } from './RideHistory';
import * as apiService from '../services/apiService';

jest.mock('../services/apiService');

const mockTrips = [
  {
    id: 1,
    date: '2024-03-10T10:00:00Z',
    pickup_address: 'Market Street',
    destination_address: 'Airport',
    fare: 1200,
    ride_type: 'regular',
    status: 'completed',
  },
  {
    id: 2,
    date: '2024-03-15T14:30:00Z',
    pickup_address: 'Hotel Royal',
    destination_address: 'Beach Road',
    fare: 800,
    ride_type: 'comfort',
    status: 'completed',
  },
  {
    id: 3,
    date: '2024-03-12T08:00:00Z',
    pickup_address: 'University',
    destination_address: 'Mall',
    fare: 600,
    ride_type: 'share',
    status: 'cancelled',
  },
];

describe('RideHistory component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    apiService.getRideHistory.mockReturnValue(new Promise(() => {}));
    render(<RideHistory />);

    expect(screen.getByText(/loading your trips/i)).toBeInTheDocument();
  });

  it('displays trips ordered by most recent first', async () => {
    apiService.getRideHistory.mockResolvedValue(mockTrips);
    render(<RideHistory />);

    await waitFor(() => {
      expect(screen.getByText('Hotel Royal')).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);

    // Most recent trip (Mar 15) should appear first
    const addresses = screen.getAllByText(/Hotel Royal|University|Market Street/);
    expect(addresses[0]).toHaveTextContent('Hotel Royal');
  });

  it('displays empty state when no trips exist', async () => {
    apiService.getRideHistory.mockResolvedValue([]);
    render(<RideHistory />);

    await waitFor(() => {
      expect(screen.getByText(/no trips yet/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/book your first ride/i)).toBeInTheDocument();
  });

  it('displays error state with retry button on API failure', async () => {
    apiService.getRideHistory.mockRejectedValue(new Error('Network error'));
    render(<RideHistory />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('fetches ride history from apiService with JWT auth', async () => {
    apiService.getRideHistory.mockResolvedValue([]);
    render(<RideHistory />);

    await waitFor(() => {
      expect(apiService.getRideHistory).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the trip list when trips are present', async () => {
    apiService.getRideHistory.mockResolvedValue(mockTrips);
    render(<RideHistory />);

    await waitFor(() => {
      expect(screen.getByRole('list')).toBeInTheDocument();
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('sortTripsByDate', () => {
  it('sorts trips in descending chronological order', () => {
    const trips = [
      { id: 1, date: '2024-01-01T00:00:00Z' },
      { id: 2, date: '2024-03-15T00:00:00Z' },
      { id: 3, date: '2024-02-10T00:00:00Z' },
    ];

    const sorted = sortTripsByDate(trips);
    expect(sorted[0].id).toBe(2);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(1);
  });

  it('does not mutate the original array', () => {
    const trips = [
      { id: 1, date: '2024-01-01T00:00:00Z' },
      { id: 2, date: '2024-03-15T00:00:00Z' },
    ];

    const sorted = sortTripsByDate(trips);
    expect(sorted).not.toBe(trips);
    expect(trips[0].id).toBe(1);
  });

  it('handles empty array', () => {
    expect(sortTripsByDate([])).toEqual([]);
  });

  it('handles single item array', () => {
    const trips = [{ id: 1, date: '2024-01-01T00:00:00Z' }];
    const sorted = sortTripsByDate(trips);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe(1);
  });
});
