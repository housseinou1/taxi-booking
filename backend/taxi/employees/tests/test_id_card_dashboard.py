"""ID card HR dashboard aggregates."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from django.contrib.auth.models import Group

from employees.models import EmploymentStatus
from employees.services.number_service import create_staff_employee

User = get_user_model()
URL = "/employees/id-cards/dashboard/"


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


class IdCardDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hr = _in_group(User.objects.create_user("hr@test.local", password="x", is_staff=True), "HR Staff")
        create_staff_employee(full_name="Dashboard One", employment_status=EmploymentStatus.ACTIVE)

    def test_requires_hr_staff(self):
        self.assertIn(self.client.get(URL).status_code, (401, 403))
        self.client.force_authenticate(self.hr)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data["total_employees"], 1)
