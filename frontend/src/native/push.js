/**
 * Push notification registration and handling.
 * No-ops gracefully when not running in a native Capacitor container.
 */

import { isNative, getAppType, getPlatform } from './platform';
import { getToken } from './storage';

let PushNotifications = null;
let latestPushToken = null;
let initialized = false;
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
  if (!isNative() || !PushNotifications || initialized) return;
  initialized = true;

  try {
    if (getPlatform() === 'android') {
      await PushNotifications.createChannel({
        id: 'yala_rides',
        name: 'Yala ride updates',
        description: 'Ride, message, safety, and payment updates',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    }

    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    // Listen for device token registration
    PushNotifications.addListener('registration', async (token) => {
      try {
        latestPushToken = token.value;
        const jwt = await getToken('access');
        if (!jwt || !apiUrl) return;

        await fetch(`${apiUrl}/notifications/fcm/register/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            token: token.value,
            device_type: getPlatform(),
            app_type: getAppType(),
          }),
        });
      } catch {
        // Registration failed — will retry on next app launch
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      window.dispatchEvent(new CustomEvent('yala:push-received', {
        detail: notification,
      }));
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

export async function unregisterPushNotifications(apiUrl) {
  if (!latestPushToken || !apiUrl) return;
  try {
    const jwt = await getToken('access');
    if (!jwt) return;
    await fetch(`${apiUrl}/notifications/fcm/unregister/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: latestPushToken }),
    });
    latestPushToken = null;
  } catch {
    // Logout must continue even if the device is temporarily offline.
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
  if (!data) return null;
  if (data.deep_link) return data.deep_link;
  if (!data.type) return null;

  if (appType === 'rider') {
    switch (data.type) {
      case 'ride_accepted':
      case 'driver_arriving':
      case 'driver_arrived':
      case 'ride_started':
        return '/rider-dashboard';
      case 'ride_completed':
        return '/history';
      case 'payment_successful':
        return '/rider-payments';
      case 'chat_message':
      case 'ride_cancelled':
        return '/rider-dashboard';
      default:
        return '/rider-dashboard';
    }
  }

  if (appType === 'driver') {
    switch (data.type) {
      case 'ride_request':
      case 'ride_cancelled':
      case 'chat_message':
        return '/driver';
      case 'payment_completed':
        return '/driver/earnings';
      default:
        return '/driver';
    }
  }

  return null;
}
