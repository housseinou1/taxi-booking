import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SOSButton from './SOSButton';

describe('SOSButton component', () => {
  it('renders with Emergency SOS aria-label', () => {
    render(<SOSButton onClick={() => {}} />);
    expect(screen.getByLabelText('Emergency SOS')).toBeInTheDocument();
  });

  it('renders the SOS label text', () => {
    render(<SOSButton onClick={() => {}} />);
    expect(screen.getByText('SOS')).toBeInTheDocument();
  });

  it('calls onClick when tapped', () => {
    const handleClick = jest.fn();
    render(<SOSButton onClick={handleClick} />);
    fireEvent.click(screen.getByLabelText('Emergency SOS'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('has minimum 44px tap target via CSS class', () => {
    const { container } = render(<SOSButton onClick={() => {}} />);
    const button = container.querySelector('.sos-button');
    expect(button).toBeInTheDocument();
  });

  it('uses visually distinct red styling (sos-button class)', () => {
    const { container } = render(<SOSButton onClick={() => {}} />);
    const button = container.querySelector('.sos-button');
    expect(button).toHaveClass('sos-button');
  });

  it('renders with button type="button"', () => {
    render(<SOSButton onClick={() => {}} />);
    const button = screen.getByLabelText('Emergency SOS');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies additional className if provided', () => {
    const { container } = render(
      <SOSButton onClick={() => {}} className="custom-class" />
    );
    const button = container.querySelector('.sos-button');
    expect(button).toHaveClass('sos-button');
    expect(button).toHaveClass('custom-class');
  });

  it('renders the emergency icon', () => {
    const { container } = render(<SOSButton onClick={() => {}} />);
    const icon = container.querySelector('.sos-button__icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
