import React, { useState } from 'react';

/**
 * PromoCodeInput component for entering and applying promotional discount codes.
 *
 * Props:
 * - onApply: (code: string) => void — called when the user submits a promo code
 * - currentCode: optional current applied promo code string
 * - error: optional error message from failed promo validation
 * - loading: whether promo validation is in progress
 */
function PromoCodeInput({ onApply, currentCode, error, loading }) {
  const [code, setCode] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed && onApply) {
      onApply(trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  return (
    <div className="promo-code-input">
      <label className="promo-code-input__label" htmlFor="promo-code-field">
        Promo Code
      </label>
      <div className="promo-code-input__row">
        <input
          id="promo-code-field"
          className="promo-code-input__field"
          type="text"
          placeholder="Enter promo code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          aria-describedby={error ? 'promo-code-error' : undefined}
          aria-invalid={error ? 'true' : undefined}
        />
        <button
          className="promo-code-input__apply-btn"
          type="button"
          onClick={handleSubmit}
          disabled={!code.trim() || loading}
          aria-label="Apply promo code"
        >
          {loading ? '...' : 'Apply'}
        </button>
      </div>
      {currentCode && !error && (
        <span className="promo-code-input__success" role="status">
          ✓ Code "{currentCode}" applied
        </span>
      )}
      {error && (
        <span
          id="promo-code-error"
          className="promo-code-input__error"
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

export default PromoCodeInput;
