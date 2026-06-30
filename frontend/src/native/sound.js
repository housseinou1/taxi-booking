/**
 * Native sound and vibration utilities for Capacitor apps.
 */

import { Capacitor } from "@capacitor/core";
import { isNative, getPlatform } from "./platform";
import {
  cancelDeliveryOfferAlertNotification,
  showDeliveryOfferAlertNotification,
} from "./deliveryAlerts";

let cachedNativeAudio = null;
let cachedHaptics = null;

async function getNativeAudioPlugin() {
  if (cachedNativeAudio !== null) {
    return cachedNativeAudio;
  }

  if (!isNative()) {
    cachedNativeAudio = false;
    return null;
  }

  try {
    const mod = await import("@capacitor-community/native-audio");
    cachedNativeAudio = mod?.NativeAudio || mod?.default || null;
  } catch (error) {
    console.log("NativeAudio plugin unavailable:", error?.message || error);
    cachedNativeAudio = false;
  }

  return cachedNativeAudio || null;
}

function getHapticsPlugin() {
  if (cachedHaptics) return cachedHaptics;
  try {
    const mod = require("@capacitor/haptics");
    cachedHaptics = mod?.Haptics || mod?.default || null;
  } catch (error) {
    cachedHaptics = null;
  }
  return cachedHaptics;
}

let soundPreloaded = false;
let deliverySoundPreloaded = false;
let deliveryAlertIntervalId = null;
let deliveryAlertActive = false;
let sharedAudioContext = null;
let lastRideAlertAt = 0;
const RIDE_ALERT_MIN_GAP_MS = 350;
const RIDE_ALERT_SOUND_STYLE_KEY = "driver_notification_sound_style";
export const RIDE_ALERT_SOUND_STYLE_STANDARD = "standard";
export const RIDE_ALERT_SOUND_STYLE_LYFT = "lyft";
let rideAlertSoundStyleCache = null;

function getCapacitorAssetUrl(fileName) {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.convertFileSrc(`/${fileName}`);
  }
  const publicBase = process.env.PUBLIC_URL || "";
  if (typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null") {
    return `${window.location.origin}${publicBase}/${fileName}`;
  }
  return `${publicBase}/${fileName}`;
}

function getNativeAudioAssetPaths() {
  return [
    getCapacitorAssetUrl("delivery_request.wav"),
    getCapacitorAssetUrl("notification.wav"),
    "public/delivery_request.wav",
    "delivery_request.wav",
    "public/notification.wav",
    "notification.wav",
  ].filter((value, index, list) => list.indexOf(value) === index);
}

function getDeliveryNativeAudioAssetPaths() {
  return getNativeAudioAssetPaths();
}

function normalizeRideAlertSoundStyle(style) {
  return style === RIDE_ALERT_SOUND_STYLE_STANDARD
    ? RIDE_ALERT_SOUND_STYLE_STANDARD
    : RIDE_ALERT_SOUND_STYLE_LYFT;
}

export function getRideAlertSoundStyle() {
  if (rideAlertSoundStyleCache) {
    return rideAlertSoundStyleCache;
  }

  try {
    const stored = window.localStorage.getItem(RIDE_ALERT_SOUND_STYLE_KEY);
    rideAlertSoundStyleCache = normalizeRideAlertSoundStyle(stored);
  } catch (error) {
    rideAlertSoundStyleCache = RIDE_ALERT_SOUND_STYLE_LYFT;
  }

  return rideAlertSoundStyleCache;
}

export function setRideAlertSoundStyle(style) {
  const normalized = normalizeRideAlertSoundStyle(style);
  rideAlertSoundStyleCache = normalized;

  try {
    window.localStorage.setItem(RIDE_ALERT_SOUND_STYLE_KEY, normalized);
  } catch (error) {
    // Ignore storage write issues in restricted environments.
  }

  return normalized;
}

function getNotificationAudioUrl() {
  const publicBase = process.env.PUBLIC_URL || "";
  const fileName = "/delivery_request.wav";
  const fallbackFileName = "/notification.wav";

  if (typeof window !== "undefined") {
    const origin = window.location?.origin;
    if (origin && origin !== "null") {
      // In Capacitor, files are served from the webview's origin
      return `${origin}${publicBase}${fileName}`;
    }
  }

  return `${publicBase}${fileName}`;
}

function getNotificationAudioFallbackUrl() {
  const publicBase = process.env.PUBLIC_URL || "";
  if (typeof window !== "undefined") {
    const origin = window.location?.origin;
    if (origin && origin !== "null") {
      return `${origin}${publicBase}/notification.wav`;
    }
  }
  return `${publicBase}/notification.wav`;
}

let notificationAudio = null;
let notificationAudioFallback = null;

function getNotificationAudio() {
  const url = getNotificationAudioUrl();
  if (!notificationAudio || notificationAudio.src !== url) {
    notificationAudio = new Audio(url);
    notificationAudio.preload = "auto";
    notificationAudio.volume = 1;
  }
  return notificationAudio;
}

function getNotificationAudioFallback() {
  const url = getNotificationAudioFallbackUrl();
  if (!notificationAudioFallback || notificationAudioFallback.src !== url) {
    notificationAudioFallback = new Audio(url);
    notificationAudioFallback.preload = "auto";
    notificationAudioFallback.volume = 1;
  }
  return notificationAudioFallback;
}

/**
 * Preload the notification sound for instant playback.
 */
export async function preloadNotificationSound() {
  if (!isNative()) {
    try {
      getNotificationAudio().load();
      getNotificationAudioFallback().load();
    } catch (error) {
      // ignore
    }
    return false;
  }

  const NativeAudio = await getNativeAudioPlugin();
  if (!NativeAudio?.preload) return false;
  if (soundPreloaded && deliverySoundPreloaded) return true;

  const preloadAsset = async (assetId, assetPath) => {
    const isUrl = assetPath.startsWith("http") || assetPath.startsWith("capacitor") || assetPath.startsWith("file");
    await NativeAudio.preload({
      assetId,
      assetPath,
      audioChannelNum: 1,
      isUrl,
    });
  };

  for (const assetPath of getNativeAudioAssetPaths()) {
    try {
      await preloadAsset("notification", assetPath);
      soundPreloaded = true;
      break;
    } catch (error) {
      console.log("NativeAudio preload failed for", assetPath, error.message || error);
    }
  }

  for (const assetPath of getDeliveryNativeAudioAssetPaths()) {
    try {
      await preloadAsset("delivery_request", assetPath);
      deliverySoundPreloaded = true;
      console.log("NativeAudio preloaded delivery_request:", assetPath);
      break;
    } catch (error) {
      console.log("NativeAudio delivery preload failed for", assetPath, error.message || error);
    }
  }

  return soundPreloaded || deliverySoundPreloaded;
}

async function playNativeDeliverySound() {
  if (!isNative()) return false;

  if (!deliverySoundPreloaded && !soundPreloaded) {
    await preloadNotificationSound();
  }

  const NativeAudio = await getNativeAudioPlugin();
  if (!NativeAudio?.play) return false;

  const assetIds = deliverySoundPreloaded
    ? ["delivery_request", "notification"]
    : ["notification"];

  for (const assetId of assetIds) {
    try {
      await NativeAudio.stop({ assetId }).catch(() => {});
      await NativeAudio.play({ assetId, time: 0 });
      return true;
    } catch (error) {
      console.log("NativeAudio play error:", assetId, error.message || error);
    }
  }

  return false;
}

export async function playNativeSound() {
  if (!isNative()) return false;

  if (!soundPreloaded) {
    await preloadNotificationSound();
  }

  const NativeAudio = await getNativeAudioPlugin();
  if (!NativeAudio?.play || !soundPreloaded) {
    return false;
  }

  try {
    await NativeAudio.stop({ assetId: "notification" }).catch(() => {});
    await NativeAudio.play({ assetId: "notification", time: 0 });
    return true;
  } catch (error) {
    console.log("NativeAudio play error:", error.message || error);
    return false;
  }
}

export async function vibrateNative(pattern) {
  const Haptics = getHapticsPlugin();
  if (isNative() && Haptics?.vibrate) {
    try {
      await Haptics.vibrate({ duration: 320 });
      if (pattern) {
        setTimeout(() => Haptics.vibrate({ duration: 320 }).catch(() => {}), 420);
        setTimeout(() => Haptics.vibrate({ duration: 320 }).catch(() => {}), 840);
      }
      return true;
    } catch (error) {
      console.log("Haptics vibrate error:", error.message || error);
    }
  }

  if (navigator.vibrate) {
    navigator.vibrate(pattern ? [280, 120, 280, 120, 280] : [280]);
    return true;
  }

  return false;
}

export async function playRideAlertChime({ force = false } = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    const nowMs = Date.now();
    if (!force && nowMs - lastRideAlertAt < RIDE_ALERT_MIN_GAP_MS) {
      return false;
    }
    lastRideAlertAt = nowMs;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const soundStyle = getRideAlertSoundStyle();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(
      soundStyle === RIDE_ALERT_SOUND_STYLE_STANDARD ? 0.78 : 0.88,
      ctx.currentTime
    );
    masterGain.connect(ctx.destination);

    const playNote = (freq, startTime, duration, gainLevel = 0.55) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    if (soundStyle === RIDE_ALERT_SOUND_STYLE_STANDARD) {
      playNote(1047, now, 0.18, 0.62);
      playNote(1319, now + 0.14, 0.2, 0.68);
      playNote(1568, now + 0.3, 0.28, 0.72);
    } else {
      playNote(880, now, 0.16, 0.66);
      playNote(1109, now + 0.11, 0.18, 0.72);
      playNote(1319, now + 0.24, 0.32, 0.78);
    }

    return true;
  } catch (error) {
    console.log("Chime play error:", error);
    return false;
  }
}

export function isNativeSoundReady() {
  return soundPreloaded;
}

export async function unlockRideRequestSound() {
  await preloadNotificationSound();

  try {
    if (!sharedAudioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        sharedAudioContext = new AudioContextClass();
      }
    }
    if (sharedAudioContext?.state === "suspended") {
      await sharedAudioContext.resume();
    }
  } catch (error) {
    // WebView may still block until the first real alert.
  }

  // Unlock primary audio
  try {
    const audio = getNotificationAudio();
    audio.volume = 0.01;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
  } catch (error) {
    console.log("Primary audio unlock failed:", error?.message || error);
  }

  // Unlock fallback audio
  try {
    const fallback = getNotificationAudioFallback();
    fallback.volume = 0.01;
    await fallback.play();
    fallback.pause();
    fallback.currentTime = 0;
    fallback.volume = 1;
  } catch (error) {
    console.log("Fallback audio unlock failed:", error?.message || error);
  }

  await playRideAlertChime({ force: true });
  await playNativeSound();

  return true;
}

/** Stop repeating delivery-offer alert immediately. */
export function stopDeliveryOfferAlert() {
  deliveryAlertActive = false;
  if (deliveryAlertIntervalId) {
    window.clearInterval(deliveryAlertIntervalId);
    deliveryAlertIntervalId = null;
  }

  cancelDeliveryOfferAlertNotification().catch(() => {});

  if (notificationAudio) {
    try {
      notificationAudio.pause();
      notificationAudio.currentTime = 0;
    } catch (error) {
      // ignore
    }
  }

  if (isNative()) {
    getNativeAudioPlugin().then((NativeAudio) => {
      if (!NativeAudio?.stop) return;
      NativeAudio.stop({ assetId: "delivery_request" }).catch(() => {});
      NativeAudio.stop({ assetId: "notification" }).catch(() => {});
    });
  }
}

/** Uber-style alert for incoming delivery offers. */
export async function playDeliveryOfferAlert(options = {}) {
  const force = options.force ?? true;

  try {
    await vibrateNative(true);
  } catch (e) {
    console.log("Vibration failed:", e?.message || e);
  }

  let played = false;

  // Try Web Audio chime first (most reliable in WebView)
  try {
    played = await playRideAlertChime({ force });
  } catch (e) {
    console.log("Chime failed:", e?.message || e);
  }

  // Try primary HTML5 Audio (delivery_request.wav)
  try {
    const audio = getNotificationAudio();
    audio.currentTime = 0;
    audio.volume = 1;
    await audio.play();
    return true;
  } catch (e) {
    console.log("HTML5 primary audio failed:", e?.message || e);
  }

  // Try fallback HTML5 Audio (notification.wav)
  try {
    const fallback = getNotificationAudioFallback();
    fallback.currentTime = 0;
    fallback.volume = 1;
    await fallback.play();
    return true;
  } catch (e) {
    console.log("HTML5 fallback audio failed:", e?.message || e);
  }

  // Try NativeAudio plugin
  try {
    await preloadNotificationSound();
    if (await playNativeDeliverySound()) {
      return true;
    }
    if (await playNativeSound()) {
      return true;
    }
  } catch (e) {
    console.log("Native delivery sound fallback failed:", e?.message || e);
  }

  return played;
}

/** Repeat delivery alert until stopped (accept/decline/timeout). */
export async function startDeliveryOfferAlertLoop(options = {}) {
  stopDeliveryOfferAlert();
  deliveryAlertActive = true;

  await showDeliveryOfferAlertNotification({
    title: options.title || "New Delivery Request",
    body: options.body || "Pickup nearby — tap to accept or decline",
  });

  await playDeliveryOfferAlert({ force: true });

  deliveryAlertIntervalId = window.setInterval(() => {
    if (!deliveryAlertActive) return;
    showDeliveryOfferAlertNotification({
      title: options.title || "New Delivery Request",
      body: options.body || "Pickup nearby — tap to accept or decline",
    }).catch(() => {});
    playDeliveryOfferAlert({ force: true }).catch(() => {});
  }, 3200);
}

export async function playRideRequestAlert({ force = false } = {}) {
  await vibrateNative(true);

  const chimePlayed = await playRideAlertChime({ force: force || true });

  try {
    const audio = getNotificationAudio();
    audio.currentTime = 0;
    audio.volume = 1;
    await audio.play();
    return true;
  } catch (error) {
    console.log("HTML5 ride alert failed:", error?.message || error);
  }

  await preloadNotificationSound();
  if (await playNativeSound()) {
    return true;
  }

  return chimePlayed;
}
