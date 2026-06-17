import React from 'react';
import './SOSButton.css';

/**
 * SOSButton — visually distinct emergency button for rider safety.
 *
 * Uses contrasting red styling to ensure immediate discoverability
 * during stress situations. Opens the SafetyEmergencyPanel on tap.
 *
 * Props:
 * - onClick: callback triggered when button is tapped (opens SafetyEmergencyPanel)
 * - className: optional additional CSS class
 */
function SOSButton({ onClick, className = '' }) {
  return (
    <button
      className={`sos-button ${className}`.trim()}
      onClick={onClick}
      aria-label="Emergency SOS"
      type="button"
    >
      <span className="sos-button__icon" aria-hidden="true">
        🚨
      </span>
      <span className="sos-button__label">SOS</span>
    </button>
  );
}

export default SOSButton;
