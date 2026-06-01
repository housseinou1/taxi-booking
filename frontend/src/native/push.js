/**
 * Push notification registration and handling.
 * No-ops gracefully when not running in a native Capacitor container.
 */

import { isNative, getPlatform } from './platform';
import { getToken } from './storage';

let PushNotifications = null;
try {
  const mod = require('@capacitor/push-notifications');
  PushNotifications = mod.PushNotifications;
} catch {
  // Push notifications not available in browser
}

/**
 * Initializes push notifications: requests permission, registers device token
 * with the backend, and sets up notification tap listener.
 *
 * @param {Function} onNotificationTap - Callback receiving notification data when tapped
 * @param {string} apiUrl - Backend API base URL for device registration
 */
export async function initPushNotifications(onNotificationTap, apiUrl) {
  if (!isNative() || !PushNotifications) return;

  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    // Listen for device token registration
    PushNotifications.addListener('registration', async (token) => {
      try {
        const jwt = await getToken('access');
        if (!jwt || !apiUrl) return;

        await fetch(`${apiUrl}/notifications/register-device/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            token: token.value,
            platform: getPlatform(),
          }),
        });
      } catch {
        // Registration failed — will retry on next app launch
      }
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const data = notification.notification.data;
      if (onNotificationTap) {
        onNotificationTap(data);
      }
    });
  } catch {
    // Push initialization failed — app continues without push
  }
}

/**
 * Computes the navigation route from a notification payload.
 *
 * @param {Object} data - Notification data payload
 * @param {string} appType - 'rider' or 'driver'
 * @returns {string|null} Internal route path or null
 */
export function getRouteFromNotification(data, appType) {
  if (!data || !data.type) return null;

  if (appType === 'rider') {
    switch (data.type) {
      case 'ride_status':
        return '/rider-dashboard';
      case 'ride_complete':
        return '/rider-history';
      case 'ride_cancelled':
        return '/rider-dashboard';
      default:
        return '/rider-dashboard';
    }
  }

  if (appType === 'driver') {
    switch (data.type) {
      case 'new_ride_request':
        return '/driver';
      case 'ride_update':
        return '/driver';
      case 'earnings_update':
        return '/driver/earnings';
      default:
        return '/driver';
    }
  }

  return null;
}
