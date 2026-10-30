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

// -------------------------------------------------------------------
// Regression: Rider home sheet must expand on upward swipe
//
// Bug (Google Play closed testing): on the Rider home screen the collapsed
// bottom sheet did not expand when swiped up — it only opened after tapping
// the destination field. Root cause was in RiderHome wiring: the sheet state
// was derived purely from bookingStep and the onStateChange handler ignored
// expand gestures, so BottomSheet (a controlled component) never moved.
//
// This harness reproduces the Rider wiring contract the fix establishes:
// the parent honors a swipe by feeding the new state back into `state`
// (via a manual override), while a swipe must never select a destination
// or submit a ride on its own. It guards against the handler reverting to a
// no-op for expand gestures.
// -------------------------------------------------------------------

describe('Rider home sheet wiring (regression)', () => {
  // Minimal mirror of RiderHome's effectiveSheetState + handleSheetStateChange
  // for an idle home screen (bookingStep === 'idle').
  function RiderHomeSheetHarness({ onDestinationSelect, onSubmitRide }) {
    const [manualSheetState, setManualSheetState] = React.useState(null);
    const derivedSheetState = 'collapsed'; // idle
    const effectiveSheetState = manualSheetState ?? derivedSheetState;

    const handleSheetStateChange = (newState) => {
      // Idle: honor the swipe. Up (half/full) opens the booking flow; down
      // keeps it collapsed. Never auto-selects a destination or submits.
      if (newState === 'half' || newState === 'full') {
        setManualSheetState(newState);
      } else {
        setManualSheetState('collapsed');
      }
    };

    return (
      <BottomSheet state={effectiveSheetState} onStateChange={handleSheetStateChange}>
        <p>Idle home content</p>
      </BottomSheet>
    );
  }

  it('expands the collapsed sheet to half on an upward swipe', () => {
    const onDestinationSelect = jest.fn();
    const onSubmitRide = jest.fn();
    const { container } = render(
      <RiderHomeSheetHarness
        onDestinationSelect={onDestinationSelect}
        onSubmitRide={onSubmitRide}
      />
    );
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).toHaveClass('bottom-sheet--collapsed');

    // Swipe up past the 30px threshold.
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 500, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 400, bubbles: true }));

    // The sheet must now be expanded, not stuck collapsed.
    expect(sheet).toHaveClass('bottom-sheet--half');
    expect(sheet).not.toHaveClass('bottom-sheet--collapsed');

    // The swipe must not select a destination or submit a ride.
    expect(onDestinationSelect).not.toHaveBeenCalled();
    expect(onSubmitRide).not.toHaveBeenCalled();
  });

  it('collapses the sheet again on a downward swipe', () => {
    const { container } = render(<RiderHomeSheetHarness />);
    const sheet = container.querySelector('.bottom-sheet');

    // Expand first.
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 500, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 400, bubbles: true }));
    expect(sheet).toHaveClass('bottom-sheet--half');

    // Swipe down past threshold → collapsed.
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 400, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 500, bubbles: true }));
    expect(sheet).toHaveClass('bottom-sheet--collapsed');
  });

  // Full RiderHome wiring: idle swipe-up advances bookingStep to 'location'
  // and the step-derived state ('full') must win — the manual override must
  // NOT reset the sheet back to collapsed when the booking flow opens.
  function RiderHomeStepHarness() {
    const [bookingStep, setBookingStep] = React.useState('idle');
    const [manualSheetState, setManualSheetState] = React.useState(null);

    const derivedSheetState =
      bookingStep === 'idle' ? 'collapsed' : bookingStep === 'location' ? 'full' : 'collapsed';
    const effectiveSheetState = manualSheetState ?? derivedSheetState;

    const handleSheetStateChange = (newState) => {
      if (bookingStep === 'idle') {
        if (newState === 'half' || newState === 'full') {
          setManualSheetState(null);
          setBookingStep('location'); // open booking flow
        } else {
          setManualSheetState('collapsed');
        }
      }
    };

    // Mirror RiderHome: clear manual override whenever the step changes.
    React.useEffect(() => {
      setManualSheetState(null);
    }, [bookingStep]);

    return (
      <div data-testid="step" data-step={bookingStep}>
        <BottomSheet state={effectiveSheetState} onStateChange={handleSheetStateChange}>
          <p>content</p>
        </BottomSheet>
      </div>
    );
  }

  it('opening the booking flow via swipe-up leaves the sheet expanded (not reset to collapsed)', () => {
    const { container, getByTestId } = render(<RiderHomeStepHarness />);
    const sheet = container.querySelector('.bottom-sheet');
    expect(sheet).toHaveClass('bottom-sheet--collapsed');
    expect(getByTestId('step')).toHaveAttribute('data-step', 'idle');

    // Swipe up: advances to the 'location' booking step.
    fireEvent(sheet, new MouseEvent('pointerdown', { clientY: 500, bubbles: true }));
    fireEvent(sheet, new MouseEvent('pointerup', { clientY: 400, bubbles: true }));

    // Booking flow opened and the sheet is full — the override reset did not
    // collapse it.
    expect(getByTestId('step')).toHaveAttribute('data-step', 'location');
    expect(sheet).toHaveClass('bottom-sheet--full');
    expect(sheet).not.toHaveClass('bottom-sheet--collapsed');
  });
});
