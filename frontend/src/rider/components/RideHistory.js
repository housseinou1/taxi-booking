import React, { useState, useEffect, useCallback } from 'react';
import { getRideHistory } from '../services/apiService';
import TripCard from './TripCard';
import './RideHistory.css';

/**
 * Sort trips by date in descending order (most recent first).
 * @param {Array} trips - Array of trip summary objects with date fields
 * @returns {Array} Sorted array (does not mutate original)
 */
export function sortTripsByDate(trips) {
  return [...trips].sort((a, b) => {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * RideHistory component that fetches and displays the rider's past trips.
 * Fetches ride history from the API using JWT authentication.
 * Displays trips ordered by most recent first.
 * Shows an empty state when no trips exist.
 */
function RideHistory() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTripId, setExpandedTripId] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRideHistory();
      const sorted = sortTripsByDate(data);
      setTrips(sorted);
    } catch (err) {
      setError(err.message || 'Failed to load ride history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleExpand = useCallback((tripId) => {
    setExpandedTripId((prev) => (prev === tripId ? null : tripId));
  }, []);

  if (loading) {
    return (
      <div className="ride-history" role="status" aria-label="Loading ride history">
        <div className="ride-history__loading">
          <span className="ride-history__spinner" aria-hidden="true" />
          <span>Loading your trips...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ride-history" role="alert">
        <div className="ride-history__error">
          <p className="ride-history__error-message">{error}</p>
          <button
            className="ride-history__retry-btn"
            type="button"
            onClick={fetchHistory}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="ride-history">
        <div className="ride-history__empty">
          <span className="ride-history__empty-icon" aria-hidden="true">🚗</span>
          <h2 className="ride-history__empty-title">No trips yet</h2>
          <p className="ride-history__empty-message">
            Book your first ride and it will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ride-history">
      <h1 className="ride-history__title">Ride History</h1>
      <div className="ride-history__list" role="list">
        {trips.map((trip) => (
          <div key={trip.id} role="listitem">
            <TripCard
              trip={trip}
              onExpand={handleExpand}
              expanded={expandedTripId === trip.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default RideHistory;
