"""Phase 39 — YALA Academy service layer."""

from __future__ import annotations

import random
import secrets
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q
from django.utils import timezone

from notifications.services import send_push_notification

from .models import (
    AssessmentAttempt,
    Certificate,
    CertificatePrintOrder,
    Course,
    Enrollment,
    Question,
)

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


# Phase 3.5 — failed final-exam retakes are free but spaced: a five-hour
# server-side cooldown applies after every completed failed attempt. Course
# content stays fully accessible during the wait.
RETAKE_COOLDOWN = timedelta(hours=5)


class RetakeCooldownError(ValueError):
    """Raised when a retake is attempted before the cooldown expires."""

    def __init__(self, retry_at):
        self.retry_at = retry_at
        super().__init__("A mandatory waiting period applies before retaking the exam.")


def retake_blocked_until(enrollment: Enrollment):
    """Return the retry timestamp if the learner is inside the cooldown, else None."""
    last_failed = (
        enrollment.attempts.filter(completed_at__isnull=False, passed=False)
        .order_by("-completed_at")
        .first()
    )
    if last_failed is None:
        return None
    retry_at = last_failed.completed_at + RETAKE_COOLDOWN
    return retry_at if timezone.now() < retry_at else None


def start_assessment_for_enrollment(enrollment: Enrollment) -> AssessmentAttempt:
    blocked_until = retake_blocked_until(enrollment)
    if blocked_until is not None:
        raise RetakeCooldownError(blocked_until)
    course = enrollment.course
    # Final assessments draw only from course-level questions; module-scoped
    # questions are per-lesson quizzes, not part of the certification exam.
    question_ids = list(course.questions.filter(module__isnull=True).values_list("id", flat=True))
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


# ── Phase 3: certification gate ─────────────────────────────────────────────


def ceo_signature_url() -> str:
    """URL of the authorized CEO signature asset for certificate rendering.

    Served only when explicitly configured via ACADEMY_CEO_SIGNATURE_URL —
    the signature must live in secured, authorized storage; the frontend
    renders a signature line (never a fabricated signature) when unset.
    """
    from django.conf import settings

    return str(getattr(settings, "ACADEMY_CEO_SIGNATURE_URL", "") or "")


class AcademyIssuanceError(ValueError):
    """Raised when certificate issuance would violate the certification policy."""


def all_modules_completed(enrollment: Enrollment) -> bool:
    """True when every module of the course has a completed ModuleProgress row."""
    total = enrollment.course.modules.count()
    if total == 0:
        return True
    completed = enrollment.module_progress.filter(completed=True).count()
    return completed >= total


def has_passing_attempt(enrollment: Enrollment) -> bool:
    """True when a completed attempt meets the course's >=80% passing score."""
    return enrollment.attempts.filter(
        passed=True,
        completed_at__isnull=False,
        score_pct__gte=enrollment.course.passing_score,
    ).exists()


def can_issue_certificate(enrollment: Enrollment) -> bool:
    """Certificates require completed lessons AND a passing final assessment."""
    return (
        enrollment.status == "completed"
        and has_passing_attempt(enrollment)
        and all_modules_completed(enrollment)
    )


def issue_certificate_for_enrollment(enrollment: Enrollment, *, issued_by=None) -> Certificate:
    """Server-side gated issuance — raises AcademyIssuanceError on violation.

    NEVER call Certificate.objects.get_or_create directly for issuance; this
    is the single gate enforcing the 80% + completion policy.
    """
    if not all_modules_completed(enrollment):
        raise AcademyIssuanceError(
            "All mandatory lessons must be completed before a certificate is issued."
        )
    if not has_passing_attempt(enrollment):
        raise AcademyIssuanceError(
            f"A passing final assessment (>= {enrollment.course.passing_score}) is required."
        )
    with transaction.atomic():
        if enrollment.status != "completed":
            enrollment.status = "completed"
            enrollment.completed_at = enrollment.completed_at or timezone.now()
            enrollment.save(update_fields=["status", "completed_at"])
        # Duplicate-issuance guard: the OneToOne makes concurrent requests
        # converge on one certificate; the inner savepoint keeps a
        # certificate_number collision from poisoning the outer transaction.
        existing = Certificate.objects.filter(enrollment=enrollment).first()
        if existing:
            return existing
        for _ in range(3):
            try:
                with transaction.atomic():
                    return Certificate.objects.create(
                        enrollment=enrollment, status="active", issued_by=issued_by
                    )
            except IntegrityError:
                winner = Certificate.objects.filter(enrollment=enrollment).first()
                if winner:
                    return winner
        raise IntegrityError("could not allocate a unique certificate number")


def _maybe_complete_enrollment(enrollment: Enrollment) -> None:
    """Complete the enrollment and issue the certificate once BOTH conditions
    hold: all mandatory lessons completed and a passing final assessment."""
    if all_modules_completed(enrollment) and has_passing_attempt(enrollment):
        cert = issue_certificate_for_enrollment(enrollment)
        send_push_notification(
            enrollment.user_id,
            "Certification earned",
            f"You passed {enrollment.course.title}.",
            extra={"type": "academy_certification", "certificate_id": cert.id},
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
        # Passing the final is necessary but not sufficient: mandatory lessons
        # must also be complete before the enrollment closes and the cert issues.
        _maybe_complete_enrollment(enrollment)
        enrollment.refresh_from_db()
        if enrollment.status != "completed":
            send_push_notification(
                enrollment.user_id,
                "Assessment passed — finish your lessons",
                f"You passed the assessment for {enrollment.course.title}. "
                "Complete all mandatory lessons to receive your certificate.",
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


# ── Phase 3: print orders (physical certificates) & certificate lifecycle ────


class PrintOrderError(ValueError):
    """Raised when a print-order transition violates the workflow."""


def create_certificate_order(
    *,
    certificate: Certificate,
    ordered_by,
    payment_method: str,
    order_type: str,
) -> CertificatePrintOrder:
    """Learner purchase request — digital (250), bundle (350) or upgrade (+100).

    Pricing logic:
      - digital_pdf: 250 MRU (electronic payments only)
      - bundle: 350 MRU (digital + physical, no double charge)
      - physical_upgrade: 100 MRU (upgrade from digital, no double charge)

    Duplicate-charge prevention: pending orders and existing entitlements
    are checked before creating new orders. Re-downloads of digital PDFs
    are free after purchase (cert.digital_paid flag grants access).
    """
    if payment_method not in {code for code, _ in CertificatePrintOrder.PAYMENT_METHODS}:
        raise PrintOrderError("Unsupported payment method.")
    if order_type not in CertificatePrintOrder.PRICE_BY_TYPE or order_type == "legacy":
        raise PrintOrderError("Unsupported order type.")
    if certificate.enrollment.user_id != ordered_by.id:
        raise PrintOrderError("Only the certificate holder may purchase it.")
    if certificate.status != "active":
        raise PrintOrderError("Only an active certificate can be purchased.")

    with transaction.atomic():
        cert = Certificate.objects.select_for_update().get(pk=certificate.pk)
        
        # Prevent duplicate pending orders for the same certificate and order_type
        pending_same = CertificatePrintOrder.objects.filter(
            certificate=cert, order_type=order_type, status="pending_payment"
        ).exists()
        if pending_same:
            raise PrintOrderError("A pending payment already exists for this order.")

        # Verify upgrade path: 250 MRU digital → 100 MRU upgrade only
        if order_type == "physical_upgrade":
            if not cert.digital_paid:
                raise PrintOrderError("Purchase the digital certificate first (250 MRU).")

        # Verify bundle: 350 MRU = digital + physical (no double charge)
        elif order_type == "bundle":
            if cert.digital_paid or cert.physical_paid:
                raise PrintOrderError(
                    "Certificate already purchased — use the physical upgrade instead (100 MRU)."
                )

        # Enforce electronic payments only (no cash)
        # Payment method is validated against PAYMENT_METHODS which excludes cash
        if payment_method == "cash":
            raise PrintOrderError("Electronic payments only: bankily, masravi, or sedad.")

        return CertificatePrintOrder.objects.create(
            certificate=cert,
            ordered_by=ordered_by,
            payment_method=payment_method,
            order_type=order_type,
            price_mru=CertificatePrintOrder.PRICE_BY_TYPE[order_type],
        )


def create_print_order(*, certificate: Certificate, ordered_by, payment_method: str) -> CertificatePrintOrder:
    """Backward-compatible physical order — maps to the +100 MRU upgrade flow."""
    return create_certificate_order(
        certificate=certificate,
        ordered_by=ordered_by,
        payment_method=payment_method,
        order_type="physical_upgrade",
    )


def apply_print_payment_confirmation(*, order: CertificatePrintOrder, provider_reference: str) -> CertificatePrintOrder:
    """Mark an order paid. Called ONLY from the signature-verified provider
    webhook handler — never from a learner or admin request.

    Also grants the purchased entitlement on the certificate: a digital-only
    order is fulfilled immediately (nothing to print); physical orders move to
    `paid` and await authorized print approval.
    """
    if order.status != "pending_payment":
        return order
    if order.order_type == "digital_pdf":
        order.status = "delivered"  # digital fulfilment — no print workflow
    else:
        order.status = "paid"
    order.provider_reference = provider_reference or ""
    if not order.receipt_number:
        order.receipt_number = (
            f"RCT-ACA-{timezone.localdate():%Y}-{secrets.token_hex(4).upper()}"
        )
        order.receipt_issued_at = timezone.now()
    order.save(
        update_fields=[
            "status", "provider_reference",
            "receipt_number", "receipt_issued_at", "updated_at",
        ]
    )

    cert = order.certificate
    flags = []
    if order.order_type in CertificatePrintOrder.ENTITLES_DIGITAL and not cert.digital_paid:
        cert.digital_paid = True
        flags.append("digital_paid")
    if order.order_type in CertificatePrintOrder.ENTITLES_PHYSICAL and not cert.physical_paid:
        cert.physical_paid = True
        flags.append("physical_paid")
    if flags:
        cert.save(update_fields=flags + ["updated_at"])
    return order


def apply_print_payment_failure(*, order: CertificatePrintOrder) -> CertificatePrintOrder:
    if order.status != "pending_payment":
        return order
    order.status = "payment_failed"
    order.save(update_fields=["status", "updated_at"])
    return order


def propose_delivery_fee(*, order: CertificatePrintOrder, fee_mru, proposed_by) -> CertificatePrintOrder:
    """Staff quotes a physical-delivery fee. Kept strictly separate from the
    certificate price and not chargeable until the customer confirms it."""
    if order.order_type not in CertificatePrintOrder.ENTITLES_PHYSICAL:
        raise PrintOrderError("Delivery fees only apply to physical certificates.")
    if order.status not in {"paid", "approved_for_print", "printed"}:
        raise PrintOrderError("A delivery fee can only be quoted on a paid order.")
    fee = Decimal(str(fee_mru))
    if fee < 0:
        raise PrintOrderError("Delivery fee cannot be negative.")
    order.delivery_fee_mru = fee
    order.delivery_fee_confirmed = False  # any re-quote resets confirmation
    order.delivery_fee_confirmed_at = None
    order.save(
        update_fields=[
            "delivery_fee_mru", "delivery_fee_confirmed",
            "delivery_fee_confirmed_at", "updated_at",
        ]
    )
    return order


def confirm_delivery_fee(*, order: CertificatePrintOrder, confirmed_by) -> CertificatePrintOrder:
    """Customer explicitly confirms the quoted delivery fee. Only the order
    holder may confirm — the fee can never be applied without this step."""
    if order.certificate.enrollment.user_id != confirmed_by.id:
        raise PrintOrderError("Only the certificate holder may confirm the delivery fee.")
    if order.delivery_fee_mru <= 0:
        raise PrintOrderError("No delivery fee has been quoted for this order.")
    order.delivery_fee_confirmed = True
    order.delivery_fee_confirmed_at = timezone.now()
    order.save(update_fields=["delivery_fee_confirmed", "delivery_fee_confirmed_at", "updated_at"])
    return order


def approve_print_order(*, order: CertificatePrintOrder, approved_by) -> CertificatePrintOrder:
    if order.status != "paid":
        raise PrintOrderError("Only a paid order can be approved for printing.")
    order.status = "approved_for_print"
    order.approved_by = approved_by
    order.approved_at = timezone.now()
    order.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    return order


def reject_print_order(*, order: CertificatePrintOrder, reason: str = "") -> CertificatePrintOrder:
    if order.status not in {"pending_payment", "payment_failed", "paid"}:
        raise PrintOrderError("Only a pre-print order can be rejected.")
    order.status = "cancelled"
    order.cancelled_reason = reason or "Rejected by print approver."
    order.save(update_fields=["status", "cancelled_reason", "updated_at"])
    return order


def mark_order_printed(*, order: CertificatePrintOrder, printed_by) -> CertificatePrintOrder:
    if order.status != "approved_for_print":
        raise PrintOrderError("Order must be approved for print before printing.")
    certificate = order.certificate
    if certificate.print_orders.filter(status="printed").exists() or order.printed_at:
        certificate.reprint_count = (certificate.reprint_count or 0) + 1
        certificate.save(update_fields=["reprint_count", "updated_at"])
    order.status = "printed"
    order.printed_by = printed_by
    order.printed_at = timezone.now()
    order.save(update_fields=["status", "printed_by", "printed_at", "updated_at"])
    return order


def mark_order_delivered(*, order: CertificatePrintOrder) -> CertificatePrintOrder:
    if order.status != "printed":
        raise PrintOrderError("Only a printed order can be marked delivered.")
    order.status = "delivered"
    order.delivered_at = timezone.now()
    order.save(update_fields=["status", "delivered_at", "updated_at"])
    return order


def revoke_certificate(*, cert: Certificate) -> Certificate:
    """One-way revocation — a revoked certificate never returns to active."""
    if cert.status == "revoked":
        return cert
    cert.status = "revoked"
    cert.save(update_fields=["status", "updated_at"])
    return cert


def reinstate_certificate(*, cert: Certificate) -> Certificate:
    """Suspended → active only. Revoked and expired certs cannot be reinstated."""
    if cert.status != "suspended":
        raise AcademyIssuanceError("Only a suspended certificate can be reinstated.")
    cert.status = "active"
    cert.save(update_fields=["status", "updated_at"])
    return cert
