"""TEMPORARY probe (deleted after the run). Runs in the throwaway test DB only.

For each admin approval path, an UNSIGNED pending driver is submitted for
approval. Each test records whether the driver ended up approved, so the run
shows which paths enforce the e-signature gate and which bypass it.
"""
from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from authapp.models import User
from taxi.drivers.models import DriverProfile
from legal.services import driver_has_complete_signature

RESULTS = {}


class ApprovalGateProbe(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            email="probe-admin@example.com", password="x-Strong-Pass-1",
            first_name="Probe", last_name="Admin", phone_number="+22233990001",
            national_id_number="9990009001",
        )
        self.admin.is_staff = True
        self.admin.is_superuser = True
        self.admin.save(update_fields=["is_staff", "is_superuser"])
        Group.objects.get_or_create(name="CEO")[0].user_set.add(self.admin)
        self.client.force_authenticate(self.admin)

    def _unsigned_driver(self, n, status="pending"):
        user = User.objects.create_user(
            email=f"probe-drv{n}@example.com", password="x-Strong-Pass-1",
            first_name="Probe", last_name=f"Driver{n}", phone_number=f"+2223399{n:04d}",
            national_id_number=f"99900{n:05d}", user_type="driver",
        )
        profile = DriverProfile.objects.create(
            user=user, status=status, phone_number=user.phone_number,
            vehicle_plate=f"PRB-{n:03d}", plate_number=f"PRB-{n:03d}",
            driver_code=f"P{n:04d}", qr_code_uuid=f"00000000-0000-4000-8000-{n:012d}",
        )
        self.assertFalse(driver_has_complete_signature(profile))
        return profile

    def _record(self, name, profile, response):
        profile.refresh_from_db()
        RESULTS[name] = (response.status_code, profile.status)
        print(f"PROBE {name}: HTTP {response.status_code} -> status={profile.status}")

    def test_1_drivers_approve_endpoint(self):
        p = self._unsigned_driver(1)
        self._record("POST /drivers/approve/<id>/", p, self.client.post(f"/drivers/approve/{p.id}/"))

    def test_2_approval_center_single(self):
        p = self._unsigned_driver(2)
        self._record("POST /admin/approvals/drivers/<uid>/approve/", p,
                     self.client.post(f"/admin/approvals/drivers/{p.user_id}/approve/", {}, format="json"))

    def test_3_approval_center_bulk(self):
        p = self._unsigned_driver(3)
        self._record("POST /admin/approvals/drivers/bulk/ approve", p,
                     self.client.post("/admin/approvals/drivers/bulk/", {"ids": [p.user_id], "action": "approve"}, format="json"))

    def test_4_approval_center_reactivate_rejected(self):
        p = self._unsigned_driver(4, status="rejected")
        self._record("POST /admin/approvals/drivers/<uid>/reactivate/ (from rejected)", p,
                     self.client.post(f"/admin/approvals/drivers/{p.user_id}/reactivate/", {}, format="json"))

    def test_5_approval_center_courier_single(self):
        p = self._unsigned_driver(5)
        self._record("POST /admin/approvals/couriers/<uid>/approve/", p,
                     self.client.post(f"/admin/approvals/couriers/{p.user_id}/approve/", {}, format="json"))

    def test_6_ceo_approve_onboarding(self):
        p = self._unsigned_driver(6)
        self._record("POST /operations/ceo-master/actions/approve-onboarding/", p,
                     self.client.post("/operations/ceo-master/actions/approve-onboarding/",
                                      {"entity_type": "driver", "entity_id": p.user_id}, format="json"))

    def test_7_drivers_reintegrate(self):
        p = self._unsigned_driver(7, status="rejected")
        self._record("POST /drivers/reintegrate/<id>/ (from rejected)", p, self.client.post(f"/drivers/reintegrate/{p.id}/"))
