/**
 * Native platform abstraction layer — barrel export.
 * Import from 'native/' to access all platform utilities.
 *
 * Usage:
 *   import { isNative, getPlatform, getAppType } from './native';
 *   import { setToken, getToken } from './native';
 */

// Platform detection
export { isNative, getPlatform, getAppType, shouldShowInstallButton } from './platform';

// Secure token storage
export { setToken, getToken, removeToken } from './storage';

// Push notifications
export { initPushNotifications, getRouteFromNotification } from './push';

// Location and GPS
export {
  requestLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
} from './location';

// Camera and photo
export { takePhoto, pickFromGallery } from './camera';

// Biometric authentication
export { isBiometricAvailable, performBiometricVerification, shouldPromptBiometric } from './biometric';

// Deep linking
export { parseDeepLink, initDeepLinkListener } from './deeplink';

// External navigation
export { formatMapsUrl, openNavigation } from './navigation';
