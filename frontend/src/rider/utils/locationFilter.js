import { MARKET } from '../../marketConfig';

/**
 * Filter locations for autocomplete based on a query string and city.
 * Performs case-insensitive substring matching.
 * Results are sorted by relevance: starts-with matches first, then contains matches.
 *
 * @param {string} query - The search query string
 * @param {string} city - The city to filter locations for
 * @param {Array} [locations] - Optional custom locations array (defaults to MARKET.locations)
 * @returns {Array} Filtered and sorted locations
 */
export function filterLocations(query, city, locations) {
  const locationsList = locations || MARKET.locations;

  if (!query || !query.trim()) {
    return locationsList.filter((loc) => loc.city === city);
  }

  const normalizedQuery = query.trim().toLowerCase();

  // Filter locations by city and case-insensitive substring match
  const matches = locationsList.filter((loc) => {
    if (loc.city !== city) return false;
    return loc.label.toLowerCase().includes(normalizedQuery);
  });

  // Sort by relevance: starts-with first, then contains
  matches.sort((a, b) => {
    const aStartsWith = a.label.toLowerCase().startsWith(normalizedQuery);
    const bStartsWith = b.label.toLowerCase().startsWith(normalizedQuery);

    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.label.localeCompare(b.label);
  });

  return matches;
}
