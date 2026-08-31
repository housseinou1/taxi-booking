const RECENT_DESTINATIONS_KEY = 'yala_rider_recent_destinations';
const MAX_RECENT = 6;

function normalizeEntry(location) {
  if (
    !location ||
    !Array.isArray(location.position) ||
    location.position.length < 2 ||
    !Number.isFinite(Number(location.position[0])) ||
    !Number.isFinite(Number(location.position[1]))
  ) {
    return null;
  }

  return {
    label: String(location.label || 'Saved destination').trim(),
    position: [Number(location.position[0]), Number(location.position[1])],
    city: location.city || 'Nouakchott',
  };
}

export function getRecentDestinations(limit = MAX_RECENT) {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_DESTINATIONS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter(Boolean)
      .slice(0, limit);
  } catch (error) {
    return [];
  }
}

export function rememberRecentDestination(location) {
  const entry = normalizeEntry(location);
  if (!entry) return;

  const existing = getRecentDestinations(MAX_RECENT + 2);
  const deduped = existing.filter(
    (item) =>
      item.label !== entry.label ||
      item.position[0] !== entry.position[0] ||
      item.position[1] !== entry.position[1]
  );

  const next = [entry, ...deduped].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(next));
}
