import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import FareCard, { getRideTypeIcon, formatFare } from './FareCard';

// -------------------------------------------------------------------
// Unit tests for helper functions
// -------------------------------------------------------------------

describe('getRideTypeIcon', () => {
  it('returns car emoji for regular', () => {
    expect(getRideTypeIcon('regular')).toBe('🚗');
  });

  it('returns sparkle emoji for comfort', () => {
    expect(getRideTypeIcon('comfort')).toBe('✨');
  });

  it('returns van emoji for xl', () => {
    expect(getRideTypeIcon('xl')).toBe('🚐');
  });

  it('returns people emoji for share', () => {
    expect(getRideTypeIcon('share')).toBe('👥');
  });

  it('returns fallback car emoji for unknown type', () => {
    expect(getRideTypeIcon('unknown')).toBe('🚗');
  });
});

describe('formatFare', () => {
  it('formats integer fare with MRU suffix', () => {
    expect(formatFare(500)).toBe('500 MRU');
  });

  it('rounds decimal fare to nearest integer', () => {
    expect(formatFare(123.7)).toBe('124 MRU');
  });

  it('rounds down when below .5', () => {
    expect(formatFare(99.3)).toBe('99 MRU');
  });
});

// -------------------------------------------------------------------
// Component rendering tests
// -------------------------------------------------------------------

describe('FareCard component', () => {
  const defaultProps = {
    rideType: 'regular',
    label: 'Sakho',
    fare: 350,
    eta: '3 min',
    capacity: '1-4',
    selected: false,
    onSelect: jest.fn(),
  };

  beforeEach(() => {
    defaultProps.onSelect.mockClear();
  });

  it('renders the ride type label', () => {
    render(<FareCard {...defaultProps} />);
    expect(screen.getByText('Sakho')).toBeInTheDocument();
  });

  it('renders the fare amount in MRU', () => {
    render(<FareCard {...defaultProps} />);
    expect(screen.getByText('350 MRU')).toBeInTheDocument();
  });

  it('renders the ETA text', () => {
    render(<FareCard {...defaultProps} />);
    expect(screen.getByText('3 min')).toBeInTheDocument();
  });

  it('renders the capacity text', () => {
    render(<FareCard {...defaultProps} />);
    expect(screen.getByText('1-4')).toBeInTheDocument();
  });

  it('renders the ride type icon', () => {
    render(<FareCard {...defaultProps} />);
    expect(screen.getByText('🚗')).toBeInTheDocument();
  });

  it('applies selected class when selected is true', () => {
    const { container } = render(<FareCard {...defaultProps} selected={true} />);
    const card = container.querySelector('.fare-card');
    expect(card).toHaveClass('fare-card--selected');
  });

  it('does not apply selected class when selected is false', () => {
    const { container } = render(<FareCard {...defaultProps} selected={false} />);
    const card = container.querySelector('.fare-card');
    expect(card).not.toHaveClass('fare-card--selected');
  });

  it('calls onSelect when clicked', () => {
    render(<FareCard {...defaultProps} />);
    fireEvent.click(screen.getByRole('button'));
    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when Enter key is pressed', () => {
    render(<FareCard {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when Space key is pressed', () => {
    render(<FareCard {...defaultProps} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
  });

  it('displays discounted fare with original strikethrough', () => {
    const { container } = render(
      <FareCard {...defaultProps} fare={500} discountedFare={400} />
    );
    // Original fare should have strikethrough class
    const original = container.querySelector('.fare-card__fare-original');
    expect(original).toBeInTheDocument();
    expect(original).toHaveTextContent('500 MRU');

    // Discounted fare should be the main displayed amount
    const amount = container.querySelector('.fare-card__fare-amount');
    expect(amount).toHaveTextContent('400 MRU');
  });

  it('does not show strikethrough when no discount', () => {
    const { container } = render(<FareCard {...defaultProps} />);
    const original = container.querySelector('.fare-card__fare-original');
    expect(original).not.toBeInTheDocument();
  });

  it('does not show strikethrough when discountedFare equals fare', () => {
    const { container } = render(
      <FareCard {...defaultProps} fare={350} discountedFare={350} />
    );
    const original = container.querySelector('.fare-card__fare-original');
    expect(original).not.toBeInTheDocument();
  });

  it('has accessible aria-pressed attribute reflecting selected state', () => {
    const { rerender } = render(<FareCard {...defaultProps} selected={false} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');

    rerender(<FareCard {...defaultProps} selected={true} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('has accessible aria-label with fare details', () => {
    render(<FareCard {...defaultProps} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      'Sakho - 350 MRU - 3 min - 1-4'
    );
  });
});
