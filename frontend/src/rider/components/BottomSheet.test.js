import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet, { computeNextState, getNextStateUp, getNextStateDown } from './BottomSheet';

// -------------------------------------------------------------------
// Unit tests for pure state transition functions
// -------------------------------------------------------------------

describe('getNextStateUp', () => {
  it('transitions collapsed to half', () => {
    expect(getNextStateUp('collapsed')).toBe('half');
  });

  it('transitions half to full', () => {
    expect(getNextStateUp('half')).toBe('full');
  });

  it('keeps full as full', () => {
    expect(getNextStateUp('full')).toBe('full');
  });
});

describe('getNextStateDown', () => {
  it('transitions full to half', () => {
    expect(getNextStateDown('full')).toBe('half');
  });

  it('transitions half to collapsed', () => {
    expect(getNextStateDown('half')).toBe('collapsed');
  });

  it('keeps collapsed as collapsed', () => {
    expect(getNextStateDown('collapsed')).toBe('collapsed');
  });
});

describe('computeNextState', () => {
  it('swipe up from collapsed yields half', () => {
    expect(computeNextState('collapsed', 'up')).toBe('half');
  });

  it('swipe up from half yields full', () => {
    expect(computeNextState('half', 'up')).toBe('full');
  });

  it('swipe up from full stays full', () => {
    expect(computeNextState('full', 'up')).toBe('full');
  });

  it('swipe down from full yields half', () => {
    expect(computeNextState('full', 'down')).toBe('half');
  });

  it('swipe down from half yields collapsed', () => {
    expect(computeNextState('half', 'down')).toBe('collapsed');
  });

  it('swipe down from collapsed stays collapsed', () => {
    expect(computeNextState('collapsed', 'down')).toBe('collapsed');
  });
});

// -------------------------------------------------------------------
// Component rendering tests
// -------------------------------------------------------------------

describe('BottomSheet component', () => {
  it('renders children content', () => {
    render(
      <BottomSheet state="half" onStateChange={() => {}}>
        <p>Hello Bottom Sheet</p>
      </BottomSheet>
    );
    expect(screen.getByText('Hello Bottom Sheet')).toBeInTheDocument();
  });

  it('applies collapsed class when state is collapsed', () => {
    const { container } = render(
      <BottomSheet state="collapsed" onStateChange={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).toHaveClass('bottom-sheet--collapsed');
  });

  it('applies half class when state is half', () => {
    const { container } = render(
      <BottomSheet state="half" onStateChange={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).toHaveClass('bottom-sheet--half');
  });

  it('applies full class when state is full', () => {
    const { container } = render(
      <BottomSheet state="full" onStateChange={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).toHaveClass('bottom-sheet--full');
  });

  it('has accessible region role and label', () => {
    render(
      <BottomSheet state="half" onStateChange={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    expect(screen.getByRole('region', { name: /bottom sheet/i })).toBeInTheDocument();
  });

  it('calls onStateChange with half when swiped up from collapsed', () => {
    const onStateChange = jest.fn();
    const { container } = render(
      <BottomSheet state="collapsed" onStateChange={onStateChange}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');

    // fireEvent with init properties that map to React synthetic event
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 500, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 400, bubbles: true }));

    expect(onStateChange).toHaveBeenCalledWith('half');
  });

  it('calls onStateChange with collapsed when swiped down from half', () => {
    const onStateChange = jest.fn();
    const { container } = render(
      <BottomSheet state="half" onStateChange={onStateChange}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');

    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 400, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 500, bubbles: true }));

    expect(onStateChange).toHaveBeenCalledWith('collapsed');
  });

  it('does not call onStateChange when swipe is below threshold', () => {
    const onStateChange = jest.fn();
    const { container } = render(
      <BottomSheet state="half" onStateChange={onStateChange}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');

    // Simulate a small movement (less than 30px threshold)
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 400, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 410, bubbles: true }));

    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('does not call onStateChange when swiping down from collapsed (already at lowest)', () => {
    const onStateChange = jest.fn();
    const { container } = render(
      <BottomSheet state="collapsed" onStateChange={onStateChange}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');

    // Swipe down from collapsed - should stay collapsed
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 400, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 500, bubbles: true }));

    // computeNextState returns 'collapsed' which equals current state, so no call
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('pointer events pass through to map when collapsed (CSS class applied)', () => {
    const { container } = render(
      <BottomSheet state="collapsed" onStateChange={() => {}}>
        <p>Content</p>
      </BottomSheet>
    );
    const sheet = container.querySelector('.bottom-sheet');
    // The collapsed class triggers pointer-events: none in CSS
    expect(sheet).toHaveClass('bottom-sheet--collapsed');
  });
});
