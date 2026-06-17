import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RideTypeSelector from './RideTypeSelector';

describe('RideTypeSelector component', () => {
  const defaultProps = {
    distance: 5,
    etaMinutes: 8,
    selectedType: 'regular',
    onSelect: jest.fn(),
  };

  beforeEach(() => {
    defaultProps.onSelect.mockClear();
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

  it('calculates and displays fares based on distance', () => {
    // distance = 5km
    // regular: base 200 + 5*20 = 300
    // xl: base 300 + 5*30 = 450
    // comfort: base 350 + 5*35 = 525
    // share: base 150 + 5*15 = 225
    render(<RideTypeSelector {...defaultProps} />);
    expect(screen.getByText('300 MRU')).toBeInTheDocument();
    expect(screen.getByText('450 MRU')).toBeInTheDocument();
    expect(screen.getByText('525 MRU')).toBeInTheDocument();
    expect(screen.getByText('225 MRU')).toBeInTheDocument();
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
