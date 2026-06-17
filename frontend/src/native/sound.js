/**
 * Native sound and vibration utilities for Capacitor apps.
 * Uses @capacitor-community/native-audio for sound playback (bypasses WebView restrictions)
 * and @capacitor/haptics for device vibration.
 *
 * Falls back gracefully to Web APIs when running in a browser.
 */

import { isNative } from "./platform";

let cachedNativeAudio = null;
let cachedHaptics = null;

function getNativeAudioPlugin() {
  if (cachedNativeAudio) return cachedNativeAudio;
  try {
    const mod = require("@capacitor-community/native-audio");
    cachedNativeAudio = mod?.NativeAudio || mod?.default || null;
  } catch (error) {
    cachedNativeAudio = null;
  }
  return cachedNativeAudio;
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
let preloadAttempted = false;
let sharedAudioContext = null;
let lastRideAlertAt = 0;
const RIDE_ALERT_MIN_GAP_MS = 420;
const RIDE_ALERT_SOUND_STYLE_KEY = "driver_notification_sound_style";
export const RIDE_ALERT_SOUND_STYLE_STANDARD = "standard";
export const RIDE_ALERT_SOUND_STYLE_LYFT = "lyft";
let rideAlertSoundStyleCache = null;

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

/**
 * Preload the notification sound for instant playback.
 * Call this once on app initialization.
 */
export async function preloadNotificationSound() {
  if (!isNative() || preloadAttempted) return;
  const NativeAudio = getNativeAudioPlugin();
  if (!NativeAudio?.preload) return;
  preloadAttempted = true;

  try {
    await NativeAudio.preload({
      assetId: "notification",
      assetPath: "public/notification.wav",
      audioChannelNum: 1,
      isUrl: false,
    });
    soundPreloaded = true;
    console.log("NativeAudio: preloaded notification sound");
  } catch (error) {
    console.log("NativeAudio preload error (trying alt path):", error.message || error);
    // Try without the public/ prefix
    try {
      await NativeAudio.preload({
        assetId: "notification",
        assetPath: "notification.wav",
        audioChannelNum: 1,
        isUrl: false,
      });
      soundPreloaded = true;
      console.log("NativeAudio: preloaded with alt path");
    } catch (retryError) {
      console.log("NativeAudio preload failed completely:", retryError.message || retryError);
    }
  }
}

/**
 * Play the notification sound natively.
 * Bypasses all WebView autoplay restrictions.
 */
export async function playNativeSound() {
  if (!isNative() || !soundPreloaded) {
    console.log("NativeAudio: cannot play, native=" + isNative() + " preloaded=" + soundPreloaded);
    return false;
  }
  const NativeAudio = getNativeAudioPlugin();
  if (!NativeAudio?.play) return false;

  try {
    await NativeAudio.play({ assetId: "notification" });
    console.log("NativeAudio: played notification");
    return true;
  } catch (error) {
    console.log("NativeAudio play error:", error.message || error);
    return false;
  }
}

/**
 * Trigger native device vibration.
 * Uses Capacitor Haptics plugin on native, falls back to navigator.vibrate on web.
 */
export async function vibrateNative(pattern) {
  const Haptics = getHapticsPlugin();
  if (isNative()) {
    if (Haptics?.vibrate) {
      try {
      await Haptics.vibrate({ duration: 300 });
      if (pattern) {
        setTimeout(() => Haptics.vibrate({ duration: 300 }).catch(() => {}), 450);
        setTimeout(() => Haptics.vibrate({ duration: 300 }).catch(() => {}), 900);
      }
      return true;
      } catch (error) {
        console.log("Haptics vibrate error:", error.message || error);
      }
    }
  }

  // Web fallback
  if (navigator.vibrate) {
    navigator.vibrate(pattern ? [220, 120, 220] : [220]);
    return true;
  }

  return false;
}

/**
 * Play a ride request alert sound using the selected style.
 * Uses Web Audio API oscillator — works even if notification.wav fails.
 */
export async function playRideAlertChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    const nowMs = Date.now();
    if (nowMs - lastRideAlertAt < RIDE_ALERT_MIN_GAP_MS) {
      return false;
    }
    lastRideAlertAt = nowMs;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === "suspended") await ctx.resume();

    const soundStyle = getRideAlertSoundStyle();
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(
      soundStyle === RIDE_ALERT_SOUND_STYLE_STANDARD ? 0.2 : 0.22,
      ctx.currentTime
    );
    masterGain.connect(ctx.destination);

    const playNote = (freq, startTime, duration, gainLevel = 0.28) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    if (soundStyle === RIDE_ALERT_SOUND_STYLE_STANDARD) {
      // Standard profile: classic three-note sine chime (C6 -> E6 -> G6).
      playNote(1047, now, 0.13, 0.2);
      playNote(1319, now + 0.12, 0.14, 0.23);
      playNote(1568, now + 0.24, 0.2, 0.25);
    } else {
      // Lyft profile: cleaner triad cue (A5 -> C#6 -> E6).
      playNote(880, now, 0.11, 0.23);
      playNote(1109, now + 0.09, 0.13, 0.26);
      playNote(1319, now + 0.2, 0.22, 0.3);
    }

    return true;
  } catch (e) {
    console.log("Chime play error:", e);
    return false;
  }
}


/**
 * Returns true if native sound is preloaded and ready.
 */
export function isNativeSoundReady() {
  return soundPreloaded;
}
