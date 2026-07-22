const DEFAULT_OFFER_COUNTDOWN_SECONDS = 30;
const OFFER_GRACE_MS = 3000;

export function normalizeRideOfferId(ride) {
  return String(ride?.id || ride?.ride_id || "");
}

/**
 * Merge polled /rides/available/ results with pending WS offers.
 * Keeps local offers visible until the server confirms them or they expire.
 */
export function mergeAvailableRidesFromServer(serverRides, prevLocal, activeId) {
  const server = (Array.isArray(serverRides) ? serverRides : []).filter((ride) => {
    const id = normalizeRideOfferId(ride);
    return id && (!activeId || id !== String(activeId));
  });

  const serverIds = new Set(server.map((ride) => normalizeRideOfferId(ride)));
  const prevById = new Map(
    (Array.isArray(prevLocal) ? prevLocal : []).map((ride) => [
      normalizeRideOfferId(ride),
      ride,
    ])
  );

  const merged = server.map((ride) => {
    const id = normalizeRideOfferId(ride);
    const prev = prevById.get(id);
    const rideId = ride.id || ride.ride_id;
    return {
      ...ride,
      id: rideId,
      ride_id: ride.ride_id || rideId,
      offerReceivedAt: prev?.offerReceivedAt || Date.now(),
      countdown: prev?.countdown || ride.countdown || DEFAULT_OFFER_COUNTDOWN_SECONDS,
    };
  });

  const now = Date.now();
  for (const local of Array.isArray(prevLocal) ? prevLocal : []) {
    const id = normalizeRideOfferId(local);
    if (!id || serverIds.has(id)) continue;
    if (activeId && id === String(activeId)) continue;

    const countdown = local.countdown || DEFAULT_OFFER_COUNTDOWN_SECONDS;
    const receivedAt = local.offerReceivedAt || now;
    if (now - receivedAt > countdown * 1000 + OFFER_GRACE_MS) continue;

    const rideId = local.id || local.ride_id;
    merged.unshift({
      ...local,
      id: rideId,
      ride_id: local.ride_id || rideId,
    });
  }

  return merged;
}
