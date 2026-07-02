/**
 * Push notification registration and handling.
 * No-ops gracefully when not running in a native Capacitor container.
 */

import { isNative, getAppType, getPlatform } from './platform';
import { getToken } from './storage';
import {
  playDeliveryOfferAlert,
  startDeliveryOfferAlertLoop,
  stopDeliveryOfferAlert,
} from './sound';
import { initDeliveryAlertNotifications } from './deliveryAlerts';

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
    await initDeliveryAlertNotifications();

    if (getPlatform() === 'android') {
      // Delete and recreate delivery channel to ensure sound is applied
      try {
        await PushNotifications.deleteChannel({ id: 'yala_deliveries' });
      } catch (_) { /* channel might not exist yet */ }

      await PushNotifications.createChannel({
        id: 'yala_rides',
        name: 'Yala ride updates',
        description: 'Ride, message, safety, and payment updates',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      await PushNotifications.createChannel({
        id: 'yala_deliveries',
        name: 'Yala delivery offers',
        description: 'New delivery requests and trip updates',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'delivery_request',
      });
      await PushNotifications.createChannel({
        id: 'yala_delivery_updates',
        name: 'Yala delivery updates',
        description: 'Courier arrival, delivery status, and payment alerts',
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: 'delivery_request',
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
      const payload = notification?.data || notification?.notification?.data || {};
      const type = payload?.type || notification?.data?.type;

      if (type === 'delivery_new_request') {
        const title = notification?.title || notification?.notification?.title || 'New Delivery Request';
        const body =
          notification?.body ||
          notification?.notification?.body ||
          'Pickup nearby — tap to accept or decline';
        startDeliveryOfferAlertLoop({ title, body }).catch(() => {
          playDeliveryOfferAlert({ force: true }).catch(() => {});
        });
      }

      window.dispatchEvent(new CustomEvent('yala:push-received', {
        detail: notification,
      }));
    });

    // Listen for notification taps
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      stopDeliveryOfferAlert();
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
      case 'delivery_accepted':
      case 'delivery_courier_arriving':
      case 'delivery_picked_up':
      case 'delivery_delivered':
      case 'delivery_cancelled':
      case 'delivery_courier_near_pickup':
      case 'delivery_courier_near_dropoff':
      case 'delivery_chat_message':
        return '/delivery';
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

  if (appType === 'delivery') {
    switch (data.type) {
      case 'delivery_new_request':
      case 'delivery_assigned':
      case 'delivery_status_update':
      case 'delivery_cancelled':
        return '/delivery/courier';
      case 'delivery_payout':
        return '/delivery/bank';
      case 'delivery_bonus':
        return '/delivery/earnings';
      case 'delivery_chat_message':
        return '/delivery/courier';
      default:
        return '/delivery/courier';
    }
  }

  return null;
}
