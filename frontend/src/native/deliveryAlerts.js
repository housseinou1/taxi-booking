/**
 * DoorDash/Uber-style delivery offer alerts via Local Notifications.
 * Android plays channel sound even when the app is in the foreground.
 */

import { isNative, getPlatform } from "./platform";

let LocalNotifications = null;
let initialized = false;

const OFFER_NOTIFICATION_ID = 771001;

try {
  const mod = require("@capacitor/local-notifications");
  LocalNotifications = mod.LocalNotifications;
} catch {
  // Browser / missing plugin
}

export async function initDeliveryAlertNotifications() {
  if (!isNative() || !LocalNotifications || initialized) return;
  initialized = true;

  try {
    await LocalNotifications.requestPermissions();
  } catch (error) {
  }

  if (getPlatform() !== "android") return;

  try {
    // Android notification channel sound cannot be changed after first creation.
    // Recreate these app-owned channels so older installs pick up delivery_request.wav.
    if (LocalNotifications.deleteChannel) {
      await LocalNotifications.deleteChannel({ id: "yala_deliveries" }).catch(() => {});
      await LocalNotifications.deleteChannel({ id: "yala_delivery_updates" }).catch(() => {});
    }
    await LocalNotifications.createChannel({
      id: "yala_deliveries",
      name: "Yala delivery offers",
      description: "New delivery requests — plays alert sound",
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: "delivery_request.wav",
    });
    await LocalNotifications.createChannel({
      id: "yala_delivery_updates",
      name: "Yala delivery updates",
      description: "Delivery status updates",
      importance: 4,
      visibility: 1,
      vibration: true,
      sound: "delivery_request.wav",
    });
  } catch (error) {
  }
}

export async function showDeliveryOfferAlertNotification({
  title = "New Delivery Request",
  body = "Pickup nearby — open Yala Delivery to accept",
} = {}) {
  if (!isNative() || !LocalNotifications) return false;

  await initDeliveryAlertNotifications();

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: OFFER_NOTIFICATION_ID,
          title,
          body,
          channelId: "yala_deliveries",
          sound: "delivery_request.wav",
          ongoing: true,
          autoCancel: false,
        },
      ],
    });
    return true;
  } catch (error) {
    return false;
  }
}

export async function cancelDeliveryOfferAlertNotification() {
  if (!LocalNotifications) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: OFFER_NOTIFICATION_ID }] });
  } catch (error) {
    // ignore
  }
}
