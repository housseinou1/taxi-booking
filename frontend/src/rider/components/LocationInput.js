import React, { useState, useEffect, useRef, useCallback } from 'react';
import { filterLocations } from '../utils/locationFilter';
import './LocationInput.css';

/**
 * LocationInput — text input with debounced autocomplete filtering.
 *
 * Props:
 *   label        — "Pickup" or "Destination"
 *   value        — current display value
 *   city         — city to filter locations for
 *   savedPlaces  — optional array of { key, label, position }
 *   onSelect     — callback with { label, position, city }
 *   onFocus      — optional callback when input gains focus (expand bottom sheet)
 */
function LocationInput({ label, value, city, savedPlaces, onSelect, onFocus }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Debounced filter
  const handleQueryChange = useCallback(
    (newQuery) => {
      setQuery(newQuery);
      setActiveIndex(-1);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        if (newQuery.trim()) {
          const filtered = filterLocations(newQuery, city);
          setResults(filtered);
          setIsOpen(filtered.length > 0);
        } else {
          setResults([]);
          setIsOpen(false);
        }
      }, 250);
    },
    [city]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleFocus = () => {
    if (onFocus) {
      onFocus();
    }
    // Show results if there's already a query
    if (query.trim()) {
      const filtered = filterLocations(query, city);
      setResults(filtered);
      setIsOpen(filtered.length > 0);
    }
  };

  const handleBlur = () => {
    // Auto-select first matching result when user clicks away
    setTimeout(() => {
      if (query.trim() && results.length > 0 && onSelect) {
        const exactMatch = results.find(
          (loc) => loc.label.toLowerCase() === query.trim().toLowerCase()
        );
        if (exactMatch) {
          handleSelect(exactMatch);
        } else {
          // Select first result as best match
          handleSelect(results[0]);
        }
      }
    }, 200);
  };

  const handleSelect = (location) => {
    setQuery(location.label);
    setIsOpen(false);
    setActiveIndex(-1);
    if (onSelect) {
      onSelect({
        label: location.label,
        position: location.position,
        city: location.city,
      });
    }
  };

  const handleSavedPlaceSelect = (savedPlace) => {
    setQuery(savedPlace.label);
    setIsOpen(false);
    if (onSelect) {
      onSelect({
        label: savedPlace.label,
        position: savedPlace.position,
        city: city,
      });
    }
  };

  const handleKeyDown = (event) => {
    if (!isOpen || results.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        event.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex]);
        } else if (results.length > 0) {
          // Auto-select first result when Enter pressed without arrow navigation
          handleSelect(results[0]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="location-input">
      <label className="location-input__label" htmlFor={`location-input-${label}`}>
        {label}
      </label>

      {/* Saved Places Chips */}
      {savedPlaces && savedPlaces.length > 0 && (
        <div className="location-input__saved-places" role="group" aria-label="Saved places">
          {savedPlaces.map((place) => (
            <button
              key={place.key}
              type="button"
              className="location-input__chip"
              onClick={() => handleSavedPlaceSelect(place)}
              aria-label={`Select saved place: ${place.label}`}
            >
              <span className="location-input__chip-icon" aria-hidden="true">
                {place.key === 'home' ? '🏠' : '💼'}
              </span>
              {place.label}
            </button>
          ))}
        </div>
      )}

      {/* Text Input */}
      <input
        ref={inputRef}
        id={`location-input-${label}`}
        className="location-input__field"
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={`Search ${label.toLowerCase()} location...`}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`location-input-listbox-${label}`}
        aria-activedescendant={
          activeIndex >= 0 ? `location-option-${label}-${activeIndex}` : undefined
        }
      />

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <ul
          ref={dropdownRef}
          id={`location-input-listbox-${label}`}
          className="location-input__dropdown"
          role="listbox"
          aria-label={`${label} location suggestions`}
        >
          {results.length > 0 ? (
            results.map((location, index) => (
              <li
                key={`${location.label}-${index}`}
                id={`location-option-${label}-${index}`}
                className={`location-input__option${
                  index === activeIndex ? ' location-input__option--active' : ''
                }`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => handleSelect(location)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="location-input__option-icon" aria-hidden="true">
                  📍
                </span>
                <span className="location-input__option-label">{location.label}</span>
              </li>
            ))
          ) : (
            <li className="location-input__no-results" role="option" aria-selected="false" aria-disabled="true">
              No locations found
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default LocationInput;
