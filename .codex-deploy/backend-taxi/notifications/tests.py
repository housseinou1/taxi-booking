from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import FCMToken, NotificationHistory
from .push import send_push_to_user


class NotificationApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email="rider@example.com",
            password="StrongPassword123",
            first_name="Test",
            last_name="Rider",
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_registers_fcm_token_for_correct_app(self):
        response = self.client.post(
            "/notifications/fcm/register/",
            {
                "token": "rider-device-token",
                "device_type": "android",
                "app_type": "rider",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        token = FCMToken.objects.get(token="rider-device-token")
        self.assertEqual(token.user, self.user)
        self.assertEqual(token.device_type, "android")
        self.assertEqual(token.app_type, "rider")
        self.assertTrue(token.is_active)

    @patch("notifications.push.send_push_notification", return_value="sent")
    def test_push_is_delivered_and_saved_with_deep_link(self, send_push):
        FCMToken.objects.create(
            user=self.user,
            token="rider-device-token",
            device_type="android",
            app_type="rider",
        )

        sent_count = send_push_to_user(
            self.user,
            "Driver Arrived",
            "Your driver is outside.",
            {
                "type": "driver_arrived",
                "ride_id": "42",
                "deep_link": "/rider-dashboard",
            },
            app_type="rider",
        )

        self.assertEqual(sent_count, 1)
        send_push.assert_called_once()
        notification = NotificationHistory.objects.get(user=self.user)
        self.assertEqual(notification.ride_id, 42)
        self.assertEqual(notification.deep_link, "/rider-dashboard")
        self.assertEqual(notification.data["type"], "driver_arrived")

    def test_history_and_mark_read(self):
        notification = NotificationHistory.objects.create(
            user=self.user,
            title="Payment Successful",
            body="Your payment was successful.",
            notification_type="payment_successful",
            deep_link="/rider-payments",
        )

        history_response = self.client.get("/notifications/history/")
        self.assertEqual(history_response.status_code, 200)
        self.assertEqual(history_response.data[0]["deep_link"], "/rider-payments")
        self.assertFalse(history_response.data[0]["is_read"])

        read_response = self.client.post(
            "/notifications/read/",
            {"ids": [notification.id]},
            format="json",
        )
        self.assertEqual(read_response.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
