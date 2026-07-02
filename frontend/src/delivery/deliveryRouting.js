export async function fetchDrivingRoute(points) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const coords = points
    .map((point) => {
      const lat = Number(point[0]);
      const lng = Number(point[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return `${lng},${lat}`;
    })
    .filter(Boolean)
    .join(";");

  if (!coords.includes(";")) return points;

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`
    );
    if (!response.ok) return points;

    const data = await response.json();
    const geometry = data.routes?.[0]?.geometry?.coordinates;
    if (!geometry?.length) return points;

    return geometry.map(([lng, lat]) => [lat, lng]);
  } catch (_) {
    return points;
  }
}
