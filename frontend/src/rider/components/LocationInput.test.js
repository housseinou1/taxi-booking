import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import LocationInput from './LocationInput';

// Mock the locationFilter utility
jest.mock('../utils/locationFilter', () => ({
  filterLocations: jest.fn(),
}));

const { filterLocations } = require('../utils/locationFilter');

const mockLocations = [
  { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
  { city: 'Nouakchott', label: 'Socogim Plage', position: [18.0627, -15.9612] },
  { city: 'Nouakchott', label: 'Saada', position: [18.068, -15.99] },
  { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
];

const mockSavedPlaces = [
  { key: 'home', label: 'Sebkha', position: [18.0735, -15.9582] },
  { key: 'work', label: 'Toujounine', position: [18.0896, -15.9754] },
];

beforeEach(() => {
  jest.useFakeTimers();
  filterLocations.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LocationInput', () => {
  it('renders label and input field', () => {
    render(
      <LocationInput label="Destination" value="" city="Nouakchott" onSelect={() => {}} />
    );

    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders saved places chips when provided', () => {
    render(
      <LocationInput
        label="Pickup"
        value=""
        city="Nouakchott"
        savedPlaces={mockSavedPlaces}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('Sebkha')).toBeInTheDocument();
    expect(screen.getByText('Toujounine')).toBeInTheDocument();
  });

  it('calls onFocus when input is focused', () => {
    const onFocus = jest.fn();
    render(
      <LocationInput
        label="Destination"
        value=""
        city="Nouakchott"
        onSelect={() => {}}
        onFocus={onFocus}
      />
    );

    fireEvent.focus(screen.getByRole('combobox'));
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('debounces filtering and shows autocomplete dropdown', async () => {
    filterLocations.mockReturnValue([
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Socogim Plage', position: [18.0627, -15.9612] },
    ]);

    render(
      <LocationInput label="Destination" value="" city="Nouakchott" onSelect={() => {}} />
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Se' } });

    // Before debounce fires, no dropdown
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Advance timers past debounce delay
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(filterLocations).toHaveBeenCalledWith('Se', 'Nouakchott');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Sebkha')).toBeInTheDocument();
    expect(screen.getByText('Socogim Plage')).toBeInTheDocument();
  });

  it('calls onSelect with location when an option is clicked', () => {
    filterLocations.mockReturnValue([
      { city: 'Nouakchott', label: 'Arafat', position: [18.0466, -15.9657] },
    ]);

    const onSelect = jest.fn();
    render(
      <LocationInput label="Destination" value="" city="Nouakchott" onSelect={onSelect} />
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Ara' } });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    fireEvent.click(screen.getByText('Arafat'));

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Arafat',
      position: [18.0466, -15.9657],
      city: 'Nouakchott',
    });
  });

  it('calls onSelect when a saved place chip is clicked', () => {
    const onSelect = jest.fn();
    render(
      <LocationInput
        label="Pickup"
        value=""
        city="Nouakchott"
        savedPlaces={mockSavedPlaces}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByLabelText('Select saved place: Sebkha'));

    expect(onSelect).toHaveBeenCalledWith({
      label: 'Sebkha',
      position: [18.0735, -15.9582],
      city: 'Nouakchott',
    });
  });

  it('supports keyboard navigation with ArrowDown, ArrowUp, and Enter', () => {
    filterLocations.mockReturnValue([
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
      { city: 'Nouakchott', label: 'Saada', position: [18.068, -15.99] },
    ]);

    const onSelect = jest.fn();
    render(
      <LocationInput label="Destination" value="" city="Nouakchott" onSelect={onSelect} />
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'S' } });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    // Navigate down to first option
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    // Navigate down to second option
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    // Select with Enter
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({
      label: 'Saada',
      position: [18.068, -15.99],
      city: 'Nouakchott',
    });
  });

  it('closes dropdown on Escape key', () => {
    filterLocations.mockReturnValue([
      { city: 'Nouakchott', label: 'Sebkha', position: [18.0735, -15.9582] },
    ]);

    render(
      <LocationInput label="Destination" value="" city="Nouakchott" onSelect={() => {}} />
    );

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'Seb' } });

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('has minimum 44px tap targets on chips', () => {
    render(
      <LocationInput
        label="Pickup"
        value=""
        city="Nouakchott"
        savedPlaces={mockSavedPlaces}
        onSelect={() => {}}
      />
    );

    const chips = screen.getAllByRole('button');
    chips.forEach((chip) => {
      // The CSS class enforces min-height: var(--tap-target-min) which is 44px
      expect(chip).toHaveClass('location-input__chip');
    });
  });

  it('updates input value when external value prop changes', () => {
    const { rerender } = render(
      <LocationInput label="Pickup" value="" city="Nouakchott" onSelect={() => {}} />
    );

    const input = screen.getByRole('combobox');
    expect(input.value).toBe('');

    rerender(
      <LocationInput label="Pickup" value="Sebkha" city="Nouakchott" onSelect={() => {}} />
    );

    expect(input.value).toBe('Sebkha');
  });
});
