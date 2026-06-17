import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ServiceHub from './ServiceHub';

describe('ServiceHub component', () => {
  it('renders all three service tiles', () => {
    render(<ServiceHub onNavigate={() => {}} />);

    expect(screen.getByRole('button', { name: /delivery/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /intercity/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /schedule/i })).toBeInTheDocument();
  });

  it('renders as a navigation landmark', () => {
    render(<ServiceHub onNavigate={() => {}} />);

    expect(screen.getByRole('navigation', { name: /services/i })).toBeInTheDocument();
  });

  it('navigates to /delivery when Delivery tile is tapped', () => {
    const onNavigate = jest.fn();
    render(<ServiceHub onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /delivery/i }));
    expect(onNavigate).toHaveBeenCalledWith('/delivery');
  });

  it('navigates to /intercity when Intercity tile is tapped', () => {
    const onNavigate = jest.fn();
    render(<ServiceHub onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /intercity/i }));
    expect(onNavigate).toHaveBeenCalledWith('/intercity');
  });

  it('navigates to /schedule when Schedule tile is tapped', () => {
    const onNavigate = jest.fn();
    render(<ServiceHub onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));
    expect(onNavigate).toHaveBeenCalledWith('/schedule');
  });

  it('renders labels for each service tile', () => {
    render(<ServiceHub onNavigate={() => {}} />);

    expect(screen.getByText('Delivery')).toBeInTheDocument();
    expect(screen.getByText('Intercity')).toBeInTheDocument();
    expect(screen.getByText('Schedule')).toBeInTheDocument();
  });

  it('each tile has minimum 44px tap target via CSS class', () => {
    const { container } = render(<ServiceHub onNavigate={() => {}} />);

    const tiles = container.querySelectorAll('.service-hub__tile');
    expect(tiles).toHaveLength(3);
  });

  it('renders SVG icons inside each tile', () => {
    const { container } = render(<ServiceHub onNavigate={() => {}} />);

    const icons = container.querySelectorAll('.service-hub__icon');
    expect(icons).toHaveLength(3);
  });
});
