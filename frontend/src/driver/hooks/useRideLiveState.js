import { useCallback, useEffect, useRef, useState } from "react";
import { MARKET } from "../../marketConfig";
import { getVoiceGuidanceEnabled } from "../utils/driverNavigationPrefs";

const FREE_MINS = () => Number(MARKET?.waiting?.freeMinutes ?? 3);
const MAX_WAIT_MINS = () => Number(MARKET?.waiting?.maxWaitMinutes ?? 5);
const PER_MIN_FEE = () => Number(MARKET?.waiting?.perMinuteFee ?? 50);
const NO_SHOW_MAX_DIST_M = () => Number(MARKET?.waiting?.noShowMaxDistanceM ?? 150);

function formatCountdown(seconds) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (!getVoiceGuidanceEnabled()) return;
  try {
    const utt = new window.SpeechSynthesisUtterance(text);
    utt.lang = "en-US";
    utt.volume = 0.9;
    utt.rate = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  } catch {
    // voice guidance unavailable — fail silently
  }
}

function playTone(freq = 880, durationMs = 200, type = "sine") {
  if (typeof window === "undefined" || !window.AudioContext) return;
  try {
    const ctx = new window.AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
    osc.onended = () => ctx.close();
  } catch {
    // audio context unavailable — fail silently
  }
}

/**
 * useRideLiveState
 *
 * Manages real-time driver-side ride state for:
 *  - Arrival ETA countdown (driver_arriving)
 *  - Waiting timer, fee calculation, and no-show unlock (driver_arrived)
 *  - Voice guidance at key milestones
 *  - Sound events at state transitions
 *
 * @param {object|null} ride  - Active ride object from the API/WS
 * @param {[number,number]|null} driverPosition - [lat, lng]
 * @param {{ distanceKm?: number }} options
 * @returns {object} liveState
 */
export default function useRideLiveState(ride, driverPosition, { distanceKm = null } = {}) {
  const [tick, setTick] = useState(0);
  const announcedRef = useRef(new Set());
  const prevStatusRef = useRef(null);

  // Tick every second when there is an active timed state
  useEffect(() => {
    const status = ride?.status;
    if (!status || !["driver_arriving", "driver_arrived"].includes(status)) return undefined;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [ride?.status, ride?.driver_arrived_at]);

  // Sound + voice on status transitions
  useEffect(() => {
    const status = ride?.status;
    if (!status || status === prevStatusRef.current) return;
    prevStatusRef.current = status;

    if (status === "driver_arriving") {
      playTone(660, 180, "sine");
    } else if (status === "driver_arrived") {
      playTone(880, 220, "triangle");
      speak("You have arrived at the pickup point. Starting waiting timer.");
    } else if (status === "in_progress") {
      playTone(1000, 160, "sine");
      speak("Trip started. Navigate to destination.");
    } else if (status === "completed") {
      playTone(1200, 300, "sine");
      speak("Trip completed.");
    } else if (status === "rider_no_show") {
      playTone(440, 400, "sawtooth");
      speak("Rider no-show confirmed.");
    }
  }, [ride?.status]);

  // --- Derived values ---
  const now = Date.now();
  void tick; // ensure re-render on each tick

  const status = ride?.status ?? null;
  const freeSecs = FREE_MINS() * 60;
  const maxSecs = MAX_WAIT_MINS() * 60;
  const perMinFee = PER_MIN_FEE();
  const noShowMaxDist = NO_SHOW_MAX_DIST_M();

  // ── driver_arrived waiting state ──────────────────────────────────────────
  let waitedSeconds = 0;
  if (status === "driver_arrived" && ride?.driver_arrived_at) {
    const arrivedMs = new Date(ride.driver_arrived_at).getTime();
    if (Number.isFinite(arrivedMs)) {
      waitedSeconds = Math.max(0, Math.floor((now - arrivedMs) / 1000));
    }
  }

  const inFreeWait = waitedSeconds <= freeSecs;
  const billingStarted = waitedSeconds > freeSecs;
  const chargeableSecs = billingStarted ? waitedSeconds - freeSecs : 0;
  const chargeableMins = billingStarted ? Math.ceil(chargeableSecs / 60) : 0;
  const waitingFee = chargeableMins * perMinFee;
  const waitProgress = Math.min(1, waitedSeconds / maxSecs);
  const noShowUnlocked = waitedSeconds >= maxSecs;

  // GPS proximity check for no-show
  const distanceToPickupM =
    driverPosition != null &&
    ride?.pickup_lat != null &&
    ride?.pickup_lng != null
      ? (() => {
          const [dLat, dLng] = driverPosition.map(Number);
          const pLat = Number(ride.pickup_lat);
          const pLng = Number(ride.pickup_lng);
          if ([dLat, dLng, pLat, pLng].some((v) => !Number.isFinite(v))) return null;
          const R = 6371000;
          const dPhi = ((pLat - dLat) * Math.PI) / 180;
          const dLambda = ((pLng - dLng) * Math.PI) / 180;
          const a =
            Math.sin(dPhi / 2) ** 2 +
            Math.cos((dLat * Math.PI) / 180) *
              Math.cos((pLat * Math.PI) / 180) *
              Math.sin(dLambda / 2) ** 2;
          return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        })()
      : null;

  const nearPickup =
    distanceToPickupM !== null && distanceToPickupM <= noShowMaxDist;

  // No-show fully ready: timer expired AND near pickup
  const noShowReady = noShowUnlocked && nearPickup;

  // ── Milestone voice announcements (fire once each) ────────────────────────
  const announce = useCallback(
    (key, text, tone) => {
      if (announcedRef.current.has(key)) return;
      announcedRef.current.add(key);
      speak(text);
      if (tone) playTone(...tone);
    },
    []
  );

  if (status === "driver_arrived") {
    if (billingStarted && !announcedRef.current.has("billing_start")) {
      announce(
        "billing_start",
        `Free waiting ended. Waiting fee starts now at ${perMinFee} per minute.`,
        [660, 300, "triangle"]
      );
    }
    if (noShowUnlocked && !announcedRef.current.has("no_show_unlock")) {
      announce(
        "no_show_unlock",
        "Maximum wait time reached. Rider no-show is now available if you are near the pickup point.",
        [440, 500, "sawtooth"]
      );
    }
  }

  // Reset announcements when ride changes
  const rideId = ride?.id;
  useEffect(() => {
    announcedRef.current = new Set();
  }, [rideId]);

  // ── driver_arriving ETA state ─────────────────────────────────────────────
  const arrivingEta =
    status === "driver_arriving" && distanceKm != null && Number.isFinite(Number(distanceKm))
      ? Math.max(1, Math.round((Number(distanceKm) / 32) * 60))
      : null;
  const arrivingEtaLabel =
    arrivingEta != null ? formatCountdown(arrivingEta * 60) : "—";

  return {
    // Shared
    formatCountdown,

    // driver_arriving
    arrivingEta,
    arrivingEtaLabel,

    // driver_arrived — timing
    waitedSeconds,
    freeWaitSeconds: freeSecs,
    maxWaitSeconds: maxSecs,
    inFreeWait,
    billingStarted,
    chargeableMins,
    waitingFee,
    waitProgress,

    // driver_arrived — no-show
    noShowUnlocked,
    nearPickup,
    noShowReady,
    distanceToPickupM,
    noShowMaxDistanceM: noShowMaxDist,
  };
}
