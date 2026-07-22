"""Tests for YALA Academy (Phase 39)."""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from academy.models import AssessmentAttempt, Certificate, Course, CourseModule, Enrollment, Question

User = get_user_model()


class AcademyTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.push_patch = patch("academy.academy_service.send_push_notification")
        self.push_mock = self.push_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="HR")
        Group.objects.get_or_create(name="Training Manager")
        Group.objects.get_or_create(name="Operations Manager")

        self.hr_admin = User.objects.create_user(
            email="academy-hr@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.hr_admin.groups.add(Group.objects.get(name="HR"))

        self.ceo = User.objects.create_user(
            email="academy-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.driver = User.objects.create_user(
            email="academy-driver@test.local",
            password="Pass123!",
            user_type="driver",
        )

        self.course = Course.objects.create(
            title="Driver Safety",
            description="Safety training",
            audience="driver",
            passing_score=70,
            status="published",
            randomize_questions=False,
        )
        self.module = CourseModule.objects.create(
            course=self.course,
            title="Intro",
            content_type="text",
            content="Welcome",
            order=1,
        )
        Question.objects.create(
            course=self.course,
            question_type="tf",
            text="Always wear seatbelt?",
            options=[],
            correct_answer="true",
            points=1,
        )
        Question.objects.create(
            course=self.course,
            question_type="tf",
            text="Speed limits optional?",
            options=[],
            correct_answer="false",
            points=1,
        )

    def tearDown(self):
        self.qr_patch.stop()
        self.push_patch.stop()

    def test_dashboard_requires_report_role(self):
        self.client.force_authenticate(self.driver)
        response = self.client.get("/academy/dashboard/")
        self.assertEqual(response.status_code, 403)

    def test_ceo_can_load_dashboard(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/academy/dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "completion_pct",
            "certified_drivers",
            "employees_requiring_retraining",
            "enrollments_by_audience",
        ):
            self.assertIn(key, data)

    def test_learning_dashboard(self):
        Enrollment.objects.create(user=self.driver, course=self.course, status="in_progress")
        self.client.force_authenticate(self.driver)
        response = self.client.get("/academy/learning-dashboard/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("assigned_courses", data)
        self.assertIn("upcoming_renewals", data)

    def test_module_completion_updates_progress(self):
        enrollment = Enrollment.objects.create(user=self.driver, course=self.course, status="in_progress")
        self.client.force_authenticate(self.driver)
        response = self.client.post(f"/academy/modules/{self.module.id}/complete/")
        self.assertEqual(response.status_code, 200)
        enrollment.refresh_from_db()
        self.assertEqual(enrollment.progress_pct, 100)
        self.assertEqual(enrollment.status, "in_progress")

    def test_assessment_pass_issues_certificate(self):
        enrollment = Enrollment.objects.create(user=self.driver, course=self.course, status="in_progress")
        self.client.force_authenticate(self.driver)
        start = self.client.post(f"/academy/courses/{self.course.id}/start-assessment/")
        self.assertEqual(start.status_code, 200)
        attempt_id = start.json()["id"]
        questions = start.json()["questions"]
        answers = {str(q["id"]): q["question_type"] == "tf" and "true" if "seatbelt" in q["text"] else "false" for q in questions}
        # Fix answers based on actual questions
        answers = {}
        for q in questions:
            answers[str(q["id"])] = "true" if "seatbelt" in q["text"] else "false"

        submit = self.client.post(
            f"/academy/assessments/{attempt_id}/submit/",
            {"answers": answers},
            format="json",
        )
        self.assertEqual(submit.status_code, 200)
        self.assertTrue(submit.json()["passed"])
        self.assertTrue(Certificate.objects.filter(enrollment=enrollment).exists())

    def test_assign_course_requires_admin(self):
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            "/academy/admin/assign-course/",
            {"user_id": self.driver.id, "course_id": self.course.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_can_assign_course(self):
        self.client.force_authenticate(self.hr_admin)
        response = self.client.post(
            "/academy/admin/assign-course/",
            {"user_id": self.driver.id, "course_id": self.course.id},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.push_mock.assert_called()

    def test_timed_exam_expires(self):
        self.course.exam_duration_minutes = 30
        self.course.save(update_fields=["exam_duration_minutes"])
        enrollment = Enrollment.objects.create(user=self.driver, course=self.course)
        attempt = AssessmentAttempt.objects.create(
            enrollment=enrollment,
            question_ids=list(self.course.questions.values_list("id", flat=True)),
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.client.force_authenticate(self.driver)
        response = self.client.post(
            f"/academy/assessments/{attempt.id}/submit/",
            {"answers": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        attempt.refresh_from_db()
        self.assertFalse(attempt.passed)

    def test_department_progress_report(self):
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/academy/reports/department-progress/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("departments", response.json())

    def test_training_report_csv_export(self):
        Enrollment.objects.create(user=self.driver, course=self.course)
        self.client.force_authenticate(self.ceo)
        response = self.client.get("/academy/reports/training/?export_format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")

    def test_suspend_certificate(self):
        enrollment = Enrollment.objects.create(user=self.driver, course=self.course, status="completed")
        cert = Certificate.objects.create(enrollment=enrollment, status="active")
        self.client.force_authenticate(self.hr_admin)
        response = self.client.post(f"/academy/admin/suspend-certificate/{cert.id}/")
        self.assertEqual(response.status_code, 200)
        cert.refresh_from_db()
        self.assertEqual(cert.status, "suspended")
