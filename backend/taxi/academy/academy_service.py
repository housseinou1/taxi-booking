"""Phase 39 — YALA Academy service layer."""

from __future__ import annotations

import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.utils import timezone

from notifications.services import send_push_notification

from .models import AssessmentAttempt, Certificate, Course, Enrollment, Question

User = get_user_model()

USER_TYPE_AUDIENCE_MAP = {
    "rider": "rider",
    "driver": "driver",
    "merchant": "merchant",
}

GROUP_AUDIENCE_MAP = {
    "Support": "support",
    "Operations Manager": "operations",
    "Supervisor": "supervisor",
    "Finance": "finance",
    "Accountant": "finance",
    "HR": "operations",
    "Training Manager": "operations",
    "CEO": "executive",
    "Super Admin": "executive",
    "Board": "executive",
}


def audiences_for_user(user) -> set[str]:
    """Map a platform user to academy audience codes."""
    audiences: set[str] = set()
    user_type = getattr(user, "user_type", "")
    if user_type in USER_TYPE_AUDIENCE_MAP:
        audiences.add(USER_TYPE_AUDIENCE_MAP[user_type])

    if user_type == "driver":
        if user.groups.filter(name__icontains="courier").exists():
            audiences.add("courier")
        else:
            audiences.add("driver")

    for group_name in user.groups.values_list("name", flat=True):
        mapped = GROUP_AUDIENCE_MAP.get(group_name)
        if mapped:
            audiences.add(mapped)

    if user.is_staff and not audiences:
        audiences.add("operations")

    return audiences


def build_learning_dashboard(user) -> dict:
    today = timezone.localdate()
    soon = today + timedelta(days=30)
    enrollments = Enrollment.objects.filter(user=user).select_related("course")
    certificates = Certificate.objects.filter(enrollment__user=user).select_related("enrollment__course")

    assigned = enrollments.exclude(status="completed")
    completed = enrollments.filter(status="completed")
    avg_progress = enrollments.aggregate(avg=Avg("progress_pct"))["avg"] or 0

    upcoming_renewals = certificates.filter(
        status="active",
        expiration_date__lte=soon,
        expiration_date__gte=today,
    )
    overdue_due_dates = enrollments.filter(due_date__lt=today).exclude(status="completed")

    return {
        "generated_at": timezone.now().isoformat(),
        "assigned_courses": assigned.count(),
        "completed_courses": completed.count(),
        "average_progress_pct": round(float(avg_progress), 1),
        "certificates_earned": certificates.filter(status="active").count(),
        "enrollments": list(
            enrollments.values(
                "id",
                "course__title",
                "status",
                "progress_pct",
                "due_date",
                "completed_at",
            )
        ),
        "certificates": list(
            certificates.values(
                "id",
                "certificate_number",
                "issue_date",
                "expiration_date",
                "status",
                "enrollment__course__title",
            )
        ),
        "upcoming_renewals": list(
            upcoming_renewals.values(
                "id",
                "certificate_number",
                "expiration_date",
                "enrollment__course__title",
            )
        ),
        "overdue_assignments": overdue_due_dates.count(),
    }


def build_academy_dashboard() -> dict:
    today = timezone.localdate()
    soon = today + timedelta(days=30)
    total_enrollments = Enrollment.objects.count()
    completed = Enrollment.objects.filter(status="completed").count()

    retraining_needed = (
        Certificate.objects.filter(
            Q(status="expired")
            | Q(status="suspended")
            | Q(status="active", expiration_date__lt=today)
        ).count()
        + Enrollment.objects.filter(status="failed").count()
    )

    by_audience = {}
    for code, label in Course.AUDIENCE_CHOICES:
        audience_enrollments = Enrollment.objects.filter(course__audience=code)
        audience_completed = audience_enrollments.filter(status="completed").count()
        audience_total = audience_enrollments.count()
        by_audience[label] = {
            "enrollments": audience_total,
            "completed": audience_completed,
            "completion_pct": round(audience_completed / max(audience_total, 1) * 100, 1),
        }

    return {
        "generated_at": timezone.now().isoformat(),
        "total_courses": Course.objects.filter(status="published").count(),
        "total_enrollments": total_enrollments,
        "completed": completed,
        "completion_pct": round(completed / max(total_enrollments, 1) * 100, 1),
        "certified_drivers": Certificate.objects.filter(
            status="active", enrollment__course__audience="driver"
        ).count(),
        "certified_couriers": Certificate.objects.filter(
            status="active", enrollment__course__audience="courier"
        ).count(),
        "certified_merchants": Certificate.objects.filter(
            status="active", enrollment__course__audience="merchant"
        ).count(),
        "expiring_soon": Certificate.objects.filter(status="active", expiration_date__lte=soon).count(),
        "employees_requiring_retraining": retraining_needed,
        "enrollments_by_audience": by_audience,
    }


def build_department_progress_report() -> dict:
    departments = []
    for code, label in Course.AUDIENCE_CHOICES:
        enrollments = Enrollment.objects.filter(course__audience=code)
        total = enrollments.count()
        completed = enrollments.filter(status="completed").count()
        in_progress = enrollments.filter(status="in_progress").count()
        failed = enrollments.filter(status="failed").count()
        avg_progress = enrollments.aggregate(avg=Avg("progress_pct"))["avg"] or 0
        departments.append(
            {
                "department": label,
                "audience_code": code,
                "total_enrollments": total,
                "completed": completed,
                "in_progress": in_progress,
                "failed": failed,
                "completion_pct": round(completed / max(total, 1) * 100, 1),
                "average_progress_pct": round(float(avg_progress), 1),
                "active_certificates": Certificate.objects.filter(
                    status="active", enrollment__course__audience=code
                ).count(),
            }
        )
    return {"generated_at": timezone.now().isoformat(), "departments": departments}


def start_assessment_for_enrollment(enrollment: Enrollment) -> AssessmentAttempt:
    course = enrollment.course
    question_ids = list(course.questions.values_list("id", flat=True))
    if course.randomize_questions:
        random.shuffle(question_ids)

    expires_at = None
    if course.exam_duration_minutes:
        expires_at = timezone.now() + timedelta(minutes=course.exam_duration_minutes)

    return AssessmentAttempt.objects.create(
        enrollment=enrollment,
        question_ids=question_ids,
        expires_at=expires_at,
    )


def finalize_assessment(attempt: AssessmentAttempt) -> AssessmentAttempt:
    if attempt.completed_at:
        return attempt
    if attempt.is_expired():
        attempt.completed_at = timezone.now()
        attempt.score_pct = 0
        attempt.passed = False
        attempt.save(update_fields=["completed_at", "score_pct", "passed"])
        enrollment = attempt.enrollment
        enrollment.status = "failed"
        enrollment.save(update_fields=["status"])
        send_push_notification(
            enrollment.user_id,
            "Assessment expired",
            f"Your timed assessment for {enrollment.course.title} has expired.",
        )
        return attempt

    attempt.grade()
    attempt.completed_at = timezone.now()
    attempt.save()

    enrollment = attempt.enrollment
    if attempt.passed:
        enrollment.status = "completed"
        enrollment.completed_at = timezone.now()
        enrollment.progress_pct = 100
        enrollment.save(update_fields=["status", "completed_at", "progress_pct"])
        Certificate.objects.get_or_create(enrollment=enrollment, defaults={"status": "active"})
        send_push_notification(
            enrollment.user_id,
            "Certification earned",
            f"You passed {enrollment.course.title}.",
        )
    else:
        enrollment.status = "failed"
        enrollment.save(update_fields=["status"])
        send_push_notification(
            enrollment.user_id,
            "Assessment not passed",
            f"You scored {attempt.score_pct}% on {enrollment.course.title}. Retraining may be required.",
        )
    return attempt


def assign_course_to_user(*, user, course, assigned_by, due_date=None) -> tuple[Enrollment, bool]:
    enrollment, created = Enrollment.objects.get_or_create(
        user=user,
        course=course,
        defaults={"assigned_by": assigned_by, "due_date": due_date, "status": "not_started"},
    )
    if created:
        send_push_notification(
            user.id,
            "New training assigned",
            f"You have been assigned: {course.title}",
            extra={"type": "academy_assignment", "course_id": course.id},
        )
    return enrollment, created


def bulk_assign_by_audience(*, course, assigned_by, due_date=None) -> dict:
    audiences = {course.audience}
    if course.audience == "driver":
        audiences.add("courier")

    users = User.objects.filter(is_active=True)
    if course.audience in USER_TYPE_AUDIENCE_MAP.values():
        reverse_map = {v: k for k, v in USER_TYPE_AUDIENCE_MAP.items()}
        user_type = reverse_map.get(course.audience)
        if user_type:
            users = users.filter(user_type=user_type)

    group_names = [name for name, aud in GROUP_AUDIENCE_MAP.items() if aud == course.audience]
    if group_names:
        users = users.filter(Q(groups__name__in=group_names) | Q(pk__in=users.values("pk")))

    assigned = 0
    for user in users.distinct():
        _, created = assign_course_to_user(
            user=user, course=course, assigned_by=assigned_by, due_date=due_date
        )
        if created:
            assigned += 1
    return {"assigned_count": assigned, "audience": course.audience}


def expire_certificates() -> int:
    today = timezone.localdate()
    soon = today + timedelta(days=30)
    expired_qs = Certificate.objects.filter(status="active", expiration_date__lt=today)
    count = expired_qs.update(status="expired", updated_at=timezone.now())

    expiring_soon = Certificate.objects.filter(status="active", expiration_date__lte=soon, expiration_date__gte=today)
    for cert in expiring_soon.select_related("enrollment__user", "enrollment__course"):
        send_push_notification(
            cert.enrollment.user_id,
            "Certification expiring soon",
            f"Your certificate for {cert.enrollment.course.title} expires on {cert.expiration_date}.",
            extra={"type": "academy_renewal", "certificate_id": cert.id},
        )
    return count


def questions_for_attempt(attempt: AssessmentAttempt):
    qs = Question.objects.filter(course=attempt.enrollment.course)
    if attempt.question_ids:
        qs = qs.filter(id__in=attempt.question_ids)
        id_order = {qid: idx for idx, qid in enumerate(attempt.question_ids)}
        return sorted(qs, key=lambda q: id_order.get(q.id, 999))
    return qs
