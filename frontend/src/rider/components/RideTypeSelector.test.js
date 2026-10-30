import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RideTypeSelector from './RideTypeSelector';
import { estimateFare } from '../services/apiService';

// Pricing is authoritative on the backend: the selector renders whatever
// estimateFare() returns and must not compute fares client-side.
jest.mock('../services/apiService', () => ({
  __esModule: true,
  estimateFare: jest.fn(),
}));

describe('RideTypeSelector component', () => {
  const defaultProps = {
    distance: 5,
    etaMinutes: 8,
    selectedType: 'regular',
    onSelect: jest.fn(),
  };

  beforeEach(() => {
    defaultProps.onSelect.mockClear();
    // resetMocks clears implementations, so every test needs a settled promise.
    estimateFare.mockResolvedValue({ ride_type: 'regular', estimated_fare: 0 });
  });

  it('renders four fare cards for all ride types', () => {
    render(<RideTypeSelector {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('renders ride type labels from market config', () => {
    render(<RideTypeSelector {...defaultProps} />);
    expect(screen.getByText('Regular')).toBeInTheDocument();
    expect(screen.getByText('XL')).toBeInTheDocument();
    expect(screen.getByText('Comfort')).toBeInTheDocument();
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('displays the backend fare estimate for each ride type', async () => {
    // distance = 5km; the backend returns the authoritative fare per category.
    const fares = { regular: 300, xl: 450, comfort: 525, share: 225 };
    estimateFare.mockImplementation(({ ride_type }) =>
      Promise.resolve({ ride_type, estimated_fare: fares[ride_type] })
    );

    render(<RideTypeSelector {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('300 MRU')).toBeInTheDocument();
    });
    expect(screen.getByText('450 MRU')).toBeInTheDocument();
    expect(screen.getByText('525 MRU')).toBeInTheDocument();
    expect(screen.getByText('225 MRU')).toBeInTheDocument();
  });

  it('shows — MRU rather than inventing a fare when pricing is unavailable', async () => {
    estimateFare.mockRejectedValue(new Error('pricing unavailable'));

    render(<RideTypeSelector {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getAllByText('— MRU')).toHaveLength(4);
    });
    expect(screen.queryByText('0 MRU')).not.toBeInTheDocument();
  });

  it('highlights only the selected card', () => {
    const { container } = render(<RideTypeSelector {...defaultProps} selectedType="comfort" />);
    const cards = container.querySelectorAll('.fare-card');
    const selectedCards = container.querySelectorAll('.fare-card--selected');
    expect(cards).toHaveLength(4);
    expect(selectedCards).toHaveLength(1);
  });

  it('calls onSelect with ride type key when a card is clicked', () => {
    render(<RideTypeSelector {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    // Click the XL card (second one)
    fireEvent.click(buttons[1]);
    expect(defaultProps.onSelect).toHaveBeenCalledWith('xl');
  });

  it('displays ETA based on etaMinutes prop', () => {
    render(<RideTypeSelector {...defaultProps} etaMinutes={10} />);
    // regular, xl, comfort get 10 min; share gets ceil(10*1.2) = 12 min
    expect(screen.getAllByText('10 min')).toHaveLength(3);
    expect(screen.getByText('12 min')).toBeInTheDocument();
  });

  it('displays dash when etaMinutes is not provided', () => {
    render(<RideTypeSelector {...defaultProps} etaMinutes={undefined} />);
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('has radiogroup role for accessibility', () => {
    render(<RideTypeSelector {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('has accessible aria-label on the container', () => {
    render(<RideTypeSelector {...defaultProps} />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Select ride type');
  });

  it('renders scroll container with correct class', () => {
    const { container } = render(<RideTypeSelector {...defaultProps} />);
    const scrollContainer = container.querySelector('.ride-type-selector__scroll');
    expect(scrollContainer).toBeInTheDocument();
  });
});
