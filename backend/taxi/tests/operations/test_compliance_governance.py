"""Tests for Compliance & Governance Center (Phase 36)."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from operations.models import ComplianceAudit, ComplianceRisk

User = get_user_model()


class ComplianceGovernanceTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Compliance")
        Group.objects.get_or_create(name="Operations Manager")

        self.ceo = User.objects.create_user(
            email="compliance-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.compliance_officer = User.objects.create_user(
            email="compliance-officer@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.compliance_officer.groups.add(Group.objects.get(name="Compliance"))

        self.ops_manager = User.objects.create_user(
            email="compliance-ops@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ops_manager.groups.add(Group.objects.get(name="Operations Manager"))

    def tearDown(self):
        self.qr_patch.stop()

    def test_suite_requires_compliance_or_ceo_role(self):
        self.client.force_authenticate(self.ops_manager)
        response = self.client.get("/operations/compliance-governance/")
        self.assertEqual(response.status_code, 403)

    def test_compliance_officer_can_load_suite(self):
        self.client.force_authenticate(self.compliance_officer)
        response = self.client.get("/operations/compliance-governance/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "compliance_dashboard",
            "audit_center",
            "policy_management",
            "risk_register",
            "compliance_calendar",
            "ceo_governance_dashboard",
        ):
            self.assertIn(key, data)

    def test_dashboard_includes_partner_compliance(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/operations/compliance-governance/dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("partner_compliance", data)
        self.assertIn("vehicle_maintenance_due", data)
        self.assertIn("overall_compliance_score", data)

    def test_audit_action_updates_status(self):
        audit = ComplianceAudit.objects.create(
            reference="AUD-TEST-001",
            audit_type="internal",
            title="Test internal audit",
            status="planned",
            due_date=timezone.localdate() + timedelta(days=30),
        )
        self.client.force_authenticate(self.compliance_officer)
        response = self.client.post(
            f"/operations/compliance-governance/audits/{audit.id}/action/",
            {"status": "in_progress", "note": "Started review"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        audit.refresh_from_db()
        self.assertEqual(audit.status, "in_progress")

    def test_risk_action_updates_mitigation(self):
        risk = ComplianceRisk.objects.create(
            reference="RISK-TEST-001",
            category="operational",
            title="Test operational risk",
            likelihood="medium",
            impact="high",
            status="open",
            review_date=timezone.localdate() + timedelta(days=90),
        )
        self.client.force_authenticate(self.ceo)
        response = self.client.post(
            f"/operations/compliance-governance/risks/{risk.id}/action/",
            {"status": "mitigated", "mitigation": "Added monitoring controls"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        risk.refresh_from_db()
        self.assertEqual(risk.status, "mitigated")
        self.assertEqual(risk.mitigation, "Added monitoring controls")

    def test_ceo_governance_dashboard_keys(self):
        self.client.force_authenticate(self.compliance_officer)
        response = self.client.get("/operations/compliance-governance/ceo-governance/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "compliance_score",
            "critical_risks",
            "audit_progress",
            "outstanding_approvals",
            "policy_review_status",
            "legal_action_items",
            "upcoming_deadlines",
        ):
            self.assertIn(key, data)

    def test_compliance_report_export_csv(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get(
            "/operations/compliance-governance/reports/monthly_compliance/export/?export_format=csv"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])

    def test_compliance_report_export_pdf(self):
        self.client.force_authenticate(self.compliance_officer)
        response = self.client.get(
            "/operations/compliance-governance/reports/risk_register/export/?export_format=pdf"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            "pdf" in response["Content-Type"] or "text/plain" in response["Content-Type"],
        )
