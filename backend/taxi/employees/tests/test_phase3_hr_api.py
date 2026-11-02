"""Phase 3 — HR management API tests: discipline, performance, training, recognition, policy.

Covers the HR endpoints added on top of the existing ``hr_service`` layer. These tests assert the
human-driven invariants: employees can respond but never decide, HR Staff can document but not
decide, only HR Manager (or the admin tier) decides, and nothing is automatic or monetary.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from employees.models import (
    DisciplineCase,
    PerformanceReview,
    PerformanceTask,
    PolicyAcknowledgment,
    Recognition,
    StaffEmployee,
    TrainingRecord,
)

User = get_user_model()

DISCIPLINE_URL = "/employees/hr/discipline/"
TASKS_URL = "/employees/hr/performance/tasks/"
REVIEWS_URL = "/employees/hr/performance/reviews/"
TRAINING_URL = "/employees/hr/training/"
RECOGNITION_URL = "/employees/hr/recognition/"
POLICY_URL = "/employees/hr/policy-acknowledgments/"


def _user(email, is_staff=False):
    return User.objects.create_user(email=email, password="pw", is_staff=is_staff)


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _employee(number="YAM110020LAR", user=None, **overrides):
    data = {
        "employee_number": number,
        "full_name": "HR Test Employee",
        "department": "Operations",
        "job_title": "Agent",
    }
    data.update(overrides)
    if user is not None:
        data["user"] = user
    return StaffEmployee.objects.create(**data)


class HrPhase3Base(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = _in_group(_user("p3-staff@yala.test", is_staff=True), "HR Staff")
        self.manager = _in_group(_user("p3-manager@yala.test", is_staff=True), "HR Manager")
        self.emp_user = _user("p3-emp@yala.test")
        self.employee = _employee(user=self.emp_user)

    def as_user(self, user):
        self.client.force_authenticate(user=user)
        return self.client


class HrPhase3AuthTests(HrPhase3Base):
    def test_anonymous_is_rejected_everywhere(self):
        anon = APIClient()
        for url in (
            DISCIPLINE_URL,
            TASKS_URL,
            REVIEWS_URL,
            TRAINING_URL,
            RECOGNITION_URL,
            POLICY_URL,
        ):
            with self.subTest(url=url):
                self.assertIn(anon.get(url).status_code, (401, 403))


class DisciplineApiTests(HrPhase3Base):
    def _open(self):
        return self.as_user(self.manager).post(
            DISCIPLINE_URL,
            {
                "employee_number": self.employee.employee_number,
                "violation": "repeated_lateness",
                "summary": "Three unexcused late arrivals documented",
                "evidence": "Attendance records 2026-10-20..22",
            },
            format="json",
        )

    def test_hr_manager_can_open_a_case(self):
        response = self._open()
        self.assertEqual(response.status_code, 201)
        case = DisciplineCase.objects.get()
        self.assertEqual(case.status, DisciplineCase.Status.OPEN)
        self.assertEqual(case.stage, DisciplineCase.Stage.COACHING)

    def test_hr_staff_cannot_open_a_case(self):
        """Opening a case is an HR Manager action."""
        self.as_user(self.staff)
        response = self.client.post(
            DISCIPLINE_URL,
            {
                "employee_number": self.employee.employee_number,
                "violation": "other",
                "summary": "test",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_opening_a_case_does_not_punish_anyone(self):
        """A new case is documentation only — never an automatic penalty."""
        self._open()
        case = DisciplineCase.objects.get()
        self.assertIsNone(case.decided_at)
        self.assertIsNone(case.closed_at)
        self.assertEqual(case.decision_note, "")

    def test_employee_can_respond_to_their_own_case(self):
        case_id = self._open().data["id"]
        self.as_user(self.emp_user)
        response = self.client.post(
            f"{DISCIPLINE_URL}{case_id}/respond/", {"response": "I was delayed"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            DisciplineCase.objects.get(pk=case_id).employee_response, "I was delayed"
        )

    def test_employee_cannot_decide_a_case(self):
        case_id = self._open().data["id"]
        self.as_user(self.emp_user)
        response = self.client.post(
            f"{DISCIPLINE_URL}{case_id}/decide/", {"status": "closed"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_staff_cannot_decide_a_case(self):
        case_id = self._open().data["id"]
        self.as_user(self.staff)
        response = self.client.post(
            f"{DISCIPLINE_URL}{case_id}/decide/", {"status": "action_taken"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_manager_decides_and_the_decision_is_recorded(self):
        case_id = self._open().data["id"]
        self.as_user(self.manager)
        response = self.client.post(
            f"{DISCIPLINE_URL}{case_id}/decide/",
            {"status": "closed", "stage": "verbal_warning", "note": "Discussed and agreed"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        case = DisciplineCase.objects.get(pk=case_id)
        self.assertEqual(case.status, DisciplineCase.Status.CLOSED)
        self.assertIsNotNone(case.decided_at)
        self.assertIsNotNone(case.closed_at)

    def test_deciding_without_a_status_is_rejected(self):
        case_id = self._open().data["id"]
        self.as_user(self.manager)
        response = self.client.post(
            f"{DISCIPLINE_URL}{case_id}/decide/", {"note": "no status"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_hr_can_list_cases(self):
        self._open()
        self.as_user(self.staff)
        response = self.client.get(DISCIPLINE_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["cases"]), 1)


class PerformanceApiTests(HrPhase3Base):
    def _assign(self, **overrides):
        payload = {
            "employee_number": self.employee.employee_number,
            "title": "Complete daily route checklist",
            "period": "daily",
        }
        payload.update(overrides)
        return self.as_user(self.staff).post(TASKS_URL, payload, format="json")

    def test_hr_staff_can_assign_a_daily_objective(self):
        response = self._assign()
        self.assertEqual(response.status_code, 201)
        task = PerformanceTask.objects.get()
        self.assertEqual(task.status, PerformanceTask.Status.ASSIGNED)
        self.assertIsNone(task.quality_score)

    def test_objective_title_is_required(self):
        self.assertEqual(self._assign(title="").status_code, 400)

    def test_employee_cannot_assign_their_own_objective(self):
        self.as_user(self.emp_user)
        response = self.client.post(
            TASKS_URL,
            {"employee_number": self.employee.employee_number, "title": "self-assigned"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_progress_update_is_recorded(self):
        task_id = self._assign().data["id"]
        self.as_user(self.emp_user)
        response = self.client.post(
            f"{TASKS_URL}{task_id}/update/", {"status": "in_progress", "progress": 40}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        task = PerformanceTask.objects.get(pk=task_id)
        self.assertEqual(task.progress, 40)
        self.assertEqual(task.status, PerformanceTask.Status.IN_PROGRESS)

    def test_progress_is_clamped_to_0_100(self):
        task_id = self._assign().data["id"]
        self.as_user(self.emp_user)
        self.client.post(f"{TASKS_URL}{task_id}/update/", {"progress": 500}, format="json")
        self.assertEqual(PerformanceTask.objects.get(pk=task_id).progress, 100)

    def test_only_supervisor_can_score(self):
        task_id = self._assign().data["id"]
        self.as_user(self.emp_user)
        blocked = self.client.post(
            f"{TASKS_URL}{task_id}/score/", {"quality_score": 5}, format="json"
        )
        self.assertEqual(blocked.status_code, 403)
        self.as_user(self.staff)
        allowed = self.client.post(
            f"{TASKS_URL}{task_id}/score/",
            {"quality_score": 4, "feedback": "Thorough work"},
            format="json",
        )
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(PerformanceTask.objects.get(pk=task_id).quality_score, 4)

    def test_review_requires_at_least_one_criterion(self):
        self.as_user(self.manager)
        response = self.client.post(
            REVIEWS_URL,
            {
                "employee_number": self.employee.employee_number,
                "period_start": "2026-10-01",
                "period_end": "2026-10-31",
                "scores": {},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_hr_manager_can_write_a_review_using_ceo_criteria(self):
        criterion = list(PerformanceReview.CRITERIA)[0]
        self.as_user(self.manager)
        response = self.client.post(
            REVIEWS_URL,
            {
                "employee_number": self.employee.employee_number,
                "period_start": "2026-10-01",
                "period_end": "2026-10-31",
                "scores": {criterion: 4},
                "strengths": "Reliable",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(PerformanceReview.objects.count(), 1)

    def test_review_list_exposes_the_twelve_criteria(self):
        self.as_user(self.staff)
        response = self.client.get(REVIEWS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["criteria"]), 12)

    def test_hr_staff_cannot_write_a_review(self):
        criterion = list(PerformanceReview.CRITERIA)[0]
        self.as_user(self.staff)
        response = self.client.post(
            REVIEWS_URL,
            {
                "employee_number": self.employee.employee_number,
                "period_start": "2026-10-01",
                "period_end": "2026-10-31",
                "scores": {criterion: 3},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)


class TrainingApiTests(HrPhase3Base):
    def _assign(self, **overrides):
        payload = {
            "employee_number": self.employee.employee_number,
            "title": "Customer care fundamentals",
        }
        payload.update(overrides)
        return self.as_user(self.manager).post(TRAINING_URL, payload, format="json")

    def test_hr_manager_can_assign_training(self):
        response = self._assign()
        self.assertEqual(response.status_code, 201)
        record = TrainingRecord.objects.get()
        self.assertEqual(record.status, TrainingRecord.Status.ASSIGNED)
        self.assertIsNone(record.completed_at)

    def test_training_title_is_required(self):
        self.assertEqual(self._assign(title="").status_code, 400)

    def test_hr_staff_cannot_assign_training(self):
        self.as_user(self.staff)
        response = self.client.post(
            TRAINING_URL,
            {"employee_number": self.employee.employee_number, "title": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_completion_records_score_and_feedback(self):
        record_id = self._assign().data["id"]
        self.as_user(self.staff)
        response = self.client.post(
            f"{TRAINING_URL}{record_id}/complete/",
            {"assessment_score": 88, "learning_progress": "Completed all modules"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        record = TrainingRecord.objects.get(pk=record_id)
        self.assertEqual(record.assessment_score, 88)
        self.assertIsNotNone(record.completed_at)

    def test_employee_cannot_record_their_own_completion(self):
        record_id = self._assign().data["id"]
        self.as_user(self.emp_user)
        response = self.client.post(
            f"{TRAINING_URL}{record_id}/complete/", {}, format="json"
        )
        self.assertEqual(response.status_code, 403)


class RecognitionApiTests(HrPhase3Base):
    def _award(self, **overrides):
        payload = {
            "employee_number": self.employee.employee_number,
            "category": Recognition.Category.choices[0][0],
            "title": "Outstanding customer feedback",
            "evidence": "Three named rider commendations",
        }
        payload.update(overrides)
        return self.as_user(self.manager).post(RECOGNITION_URL, payload, format="json")

    def test_hr_manager_can_award_recognition(self):
        response = self._award()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Recognition.objects.count(), 1)

    def test_recognition_carries_evidence(self):
        self._award()
        self.assertEqual(
            Recognition.objects.get().evidence, "Three named rider commendations"
        )

    def test_hr_staff_cannot_award_recognition(self):
        self.as_user(self.staff)
        response = self.client.post(
            RECOGNITION_URL,
            {
                "employee_number": self.employee.employee_number,
                "category": Recognition.Category.choices[0][0],
                "title": "x",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_can_list_recognitions(self):
        self._award()
        self.as_user(self.staff)
        response = self.client.get(RECOGNITION_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["recognitions"]), 1)


class PolicyAcknowledgmentApiTests(HrPhase3Base):
    def _ack(self, **overrides):
        payload = {"policy_key": "code-of-conduct", "policy_version": "2026.1"}
        payload.update(overrides)
        self.as_user(self.emp_user)
        return self.client.post(POLICY_URL, payload, format="json")

    def test_employee_can_acknowledge_a_policy(self):
        response = self._ack()
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["created"])
        self.assertIsNotNone(PolicyAcknowledgment.objects.get().acknowledged_at)

    def test_acknowledgment_is_idempotent_per_version(self):
        self._ack()
        second = self._ack()
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.data["created"])
        self.assertEqual(PolicyAcknowledgment.objects.count(), 1)

    def test_a_new_version_creates_a_separate_acknowledgment(self):
        self._ack()
        self._ack(policy_version="2026.2")
        self.assertEqual(PolicyAcknowledgment.objects.count(), 2)

    def test_acknowledgment_requires_an_employee_record(self):
        self.as_user(self.staff)
        response = self.client.post(
            POLICY_URL, {"policy_key": "x", "policy_version": "1"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_hr_can_list_acknowledgments(self):
        self._ack()
        self.as_user(self.staff)
        response = self.client.get(POLICY_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["acknowledgments"]), 1)


class EmployeeLinkageApiTests(HrPhase3Base):
    """The linkage probe that stops the admin UI issuing avoidable 403s (BUG-1 fix)."""

    URL = "/employees/me/linkage/"

    def test_linked_employee_is_reported(self):
        self.as_user(self.emp_user)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["linked"])
        self.assertEqual(response.data["employee_number"], self.employee.employee_number)

    def test_account_without_an_employee_profile_is_reported_as_unlinked(self):
        """An administrator without an employee profile must be told so, not 403'd."""
        self.as_user(self.staff)
        response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["linked"])
        self.assertIsNone(response.data["employee_number"])

    def test_anonymous_is_rejected(self):
        self.assertIn(APIClient().get(self.URL).status_code, (401, 403))

    def test_probe_is_read_only(self):
        before = StaffEmployee.objects.count()
        self.as_user(self.emp_user)
        self.client.get(self.URL)
        self.assertEqual(StaffEmployee.objects.count(), before)




