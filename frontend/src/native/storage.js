/**
 * Secure token storage abstraction.
 * Uses Capacitor Secure Storage (Keychain/Keystore) in native mode,
 * falls back to localStorage in browser mode.
 */

import { isNative } from "./platform";

const TOKEN_KEYS = {
  access: "jwt_access",
  refresh: "jwt_refresh",
};

let secureStoragePromise = null;

function loadSecureStoragePlugin() {
  if (!isNative()) {
    return Promise.resolve(null);
  }

  if (!secureStoragePromise) {
    secureStoragePromise = import("capacitor-secure-storage-plugin")
      .then((mod) => mod.SecureStoragePlugin || null)
      .catch(() => null);
  }

  return secureStoragePromise;
}

/**
 * Stores a token value securely.
 * @param {string} key - Token key ('access' or 'refresh')
 * @param {string} value - Token value to store
 */
export async function setToken(key, value) {
  const SecureStoragePlugin = await loadSecureStoragePlugin();
  if (SecureStoragePlugin) {
    try {
      await SecureStoragePlugin.set({ key: TOKEN_KEYS[key] || key, value });
      return;
    } catch {
      // Fall through to localStorage
    }
  }
  localStorage.setItem(key, value);
}

/**
 * Retrieves a stored token value.
 * @param {string} key - Token key ('access' or 'refresh')
 * @returns {Promise<string|null>} The token value or null if not found
 */
export async function getToken(key) {
  const SecureStoragePlugin = await loadSecureStoragePlugin();
  if (SecureStoragePlugin) {
    try {
      const result = await SecureStoragePlugin.get({ key: TOKEN_KEYS[key] || key });
      return result.value;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(key);
}

/**
 * Removes a stored token.
 * @param {string} key - Token key ('access' or 'refresh')
 */
export async function removeToken(key) {
  const SecureStoragePlugin = await loadSecureStoragePlugin();
  if (SecureStoragePlugin) {
    try {
      await SecureStoragePlugin.remove({ key: TOKEN_KEYS[key] || key });
      return;
    } catch {
      // Key may not exist — ignore
    }
  }
  localStorage.removeItem(key);
}
