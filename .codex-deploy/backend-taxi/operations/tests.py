from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from .models import VehicleMaintenanceReminder


class VehicleMaintenanceReminderTests(TestCase):
    def test_driver_can_complete_reminder(self):
        driver = get_user_model().objects.create_user(email="driver@example.com", password="test-pass")
        reminder = VehicleMaintenanceReminder.objects.create(
            driver=driver,
            reminder_type="oil_change",
            title="Change engine oil",
            due_date=date.today(),
        )

        reminder.mark_completed()

        self.assertEqual(reminder.status, "completed")
        self.assertIsNotNone(reminder.completed_at)

