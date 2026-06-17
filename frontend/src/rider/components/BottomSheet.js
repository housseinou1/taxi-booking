import React, { useRef, useCallback, useEffect } from 'react';
import './BottomSheet.css';

/**
 * Determines the next state when swiping up.
 * collapsed → half, half → full, full → full
 */
export function getNextStateUp(current) {
  if (current === 'collapsed') return 'half';
  if (current === 'half') return 'full';
  return 'full';
}

/**
 * Determines the next state when swiping down.
 * full → half, half → collapsed, collapsed → collapsed
 */
export function getNextStateDown(current) {
  if (current === 'full') return 'half';
  if (current === 'half') return 'collapsed';
  return 'collapsed';
}

/**
 * Computes the next bottom sheet state given the current state and gesture direction.
 * @param {'collapsed'|'half'|'full'} current - Current state
 * @param {'up'|'down'} direction - Swipe direction
 * @returns {'collapsed'|'half'|'full'} - Next state
 */
export function computeNextState(current, direction) {
  if (direction === 'up') return getNextStateUp(current);
  return getNextStateDown(current);
}

const SWIPE_THRESHOLD = 30; // minimum px distance to register a swipe

/**
 * BottomSheet component with three snap positions and gesture handling.
 *
 * Props:
 * - state: 'collapsed' | 'half' | 'full'
 * - onStateChange: (newState) => void
 * - children: React.ReactNode
 */
function BottomSheet({ state, onStateChange, children }) {
  const sheetRef = useRef(null);
  const dragState = useRef({
    isDragging: false,
    startY: 0,
    currentY: 0,
  });

  const getStateClassName = () => {
    switch (state) {
      case 'collapsed':
        return 'bottom-sheet--collapsed';
      case 'half':
        return 'bottom-sheet--half';
      case 'full':
        return 'bottom-sheet--full';
      default:
        return 'bottom-sheet--collapsed';
    }
  };

  const handlePointerDown = useCallback((e) => {
    // Only start drag from the handle area — let content clicks pass through
    if (e.target.closest('.bottom-sheet__content')) {
      return;
    }
    dragState.current = {
      isDragging: true,
      startY: e.clientY,
      currentY: e.clientY,
    };
    if (sheetRef.current) {
      sheetRef.current.classList.add('bottom-sheet--dragging');
      if (sheetRef.current.setPointerCapture) {
        sheetRef.current.setPointerCapture(e.pointerId);
      }
    }
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!dragState.current.isDragging) return;
    dragState.current.currentY = e.clientY;
  }, []);

  const handlePointerUp = useCallback(
    (e) => {
      if (!dragState.current.isDragging) return;

      const { startY } = dragState.current;
      const endY = e.clientY;
      const deltaY = startY - endY; // positive = swiped up, negative = swiped down

      dragState.current.isDragging = false;

      if (sheetRef.current) {
        sheetRef.current.classList.remove('bottom-sheet--dragging');
        if (sheetRef.current.releasePointerCapture) {
          sheetRef.current.releasePointerCapture(e.pointerId);
        }
      }

      if (Math.abs(deltaY) >= SWIPE_THRESHOLD) {
        const direction = deltaY > 0 ? 'up' : 'down';
        const nextState = computeNextState(state, direction);
        if (nextState !== state) {
          onStateChange(nextState);
        }
      }
    },
    [state, onStateChange]
  );

  // Clean up in case pointer leaves window mid-drag
  useEffect(() => {
    const handlePointerCancel = () => {
      dragState.current.isDragging = false;
      if (sheetRef.current) {
        sheetRef.current.classList.remove('bottom-sheet--dragging');
      }
    };

    const el = sheetRef.current;
    if (el) {
      el.addEventListener('pointercancel', handlePointerCancel);
      return () => el.removeEventListener('pointercancel', handlePointerCancel);
    }
  }, []);

  return (
    <div
      ref={sheetRef}
      className={`bottom-sheet ${getStateClassName()}`}
      role="region"
      aria-label="Bottom sheet"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="bottom-sheet__handle" aria-hidden="true">
        <div className="bottom-sheet__handle-bar" />
      </div>
      <div className="bottom-sheet__content">{children}</div>
    </div>
  );
}

export default BottomSheet;
