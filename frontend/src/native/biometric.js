/**
 * Biometric authentication abstraction.
 * Supports Face ID, Touch ID (iOS) and fingerprint (Android).
 * No-ops gracefully when biometrics are unavailable or in browser mode.
 */

import { isNative } from './platform';

let NativeBiometric = null;
try {
  const mod = require('capacitor-native-biometric');
  NativeBiometric = mod.NativeBiometric;
} catch {
  // Biometric plugin not available
}

const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Determines if biometric prompt should be shown based on how long
 * the app was in the background.
 *
 * @param {number} backgroundDurationMs - Duration in milliseconds the app was backgrounded
 * @returns {boolean} True if biometric verification should be prompted
 */
export function shouldPromptBiometric(backgroundDurationMs) {
  return backgroundDurationMs > BACKGROUND_THRESHOLD_MS;
}

/**
 * Checks if biometric authentication is available on the device.
 *
 * @returns {Promise<boolean>} True if biometrics are available and enrolled
 */
export async function isBiometricAvailable() {
  if (!isNative() || !NativeBiometric) return false;

  try {
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
}

/**
 * Prompts the user for biometric verification (Face ID, Touch ID, or fingerprint).
 *
 * @returns {Promise<boolean>} True if verification succeeded, false if failed
 */
export async function performBiometricVerification() {
  if (!isNative() || !NativeBiometric) return false;

  try {
    await NativeBiometric.verifyIdentity({
      reason: 'Verify your identity to access Yala',
      title: 'Biometric Login',
    });
    return true;
  } catch {
    return false;
  }
}
