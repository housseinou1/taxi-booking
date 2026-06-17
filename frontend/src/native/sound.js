/**
 * Native sound and vibration utilities for Capacitor apps.
 * Uses @capacitor-community/native-audio for sound playback (bypasses WebView restrictions)
 * and @capacitor/haptics for device vibration.
 *
 * Falls back gracefully to Web APIs when running in a browser.
 */

import { isNative } from "./platform";
import { NativeAudio } from "@capacitor-community/native-audio";
import { Haptics } from "@capacitor/haptics";

let soundPreloaded = false;
let preloadAttempted = false;

/**
 * Preload the notification sound for instant playback.
 * Call this once on app initialization.
 */
export async function preloadNotificationSound() {
  if (!isNative() || preloadAttempted) return;
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
  if (isNative()) {
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

  // Web fallback
  if (navigator.vibrate) {
    navigator.vibrate(pattern ? [300, 150, 300, 150, 300] : [300]);
    return true;
  }

  return false;
}

/**
 * Play a Lyft-style ride request alert sound.
 * Quick ascending three-note chime: bright, clean, attention-grabbing.
 * Uses Web Audio API oscillator — works even if notification.wav fails.
 */
export async function playRideAlertChime() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;

  try {
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") await ctx.resume();

    const playNote = (freq, startTime, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Lyft-style ascending three notes: C6 → E6 → G6
    playNote(1047, now, 0.15);        // C6
    playNote(1319, now + 0.12, 0.15); // E6
    playNote(1568, now + 0.24, 0.25); // G6 (longer, rings out)

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
