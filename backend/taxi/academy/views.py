"""Phase 39 — YALA Academy views."""

from django.contrib.auth import get_user_model
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from operations.report_export import export_csv
from notifications.services import send_push_notification
from security.services.audit_service import log_from_request

from .academy_service import (
    assign_course_to_user,
    audiences_for_user,
    build_academy_dashboard,
    build_department_progress_report,
    build_learning_dashboard,
    bulk_assign_by_audience,
    finalize_assessment,
    questions_for_attempt,
    start_assessment_for_enrollment,
)
from .models import AssessmentAttempt, Certificate, Course, CourseModule, Enrollment, ModuleProgress, Question
from .permissions import IsAcademyAdmin, IsCEOrAdmin
from .serializers import (
    AssessmentAttemptSerializer,
    AssessmentStartSerializer,
    CertificateSerializer,
    CourseListSerializer,
    CourseModuleSerializer,
    CourseSerializer,
    EnrollmentSerializer,
    QuestionAdminSerializer,
    QuestionSerializer,
)

User = get_user_model()


def _audit_admin(request, *, entity_type, entity_id, summary, details=None):
    log_from_request(
        request,
        action="admin_action",
        entity_type=entity_type,
        entity_id=str(entity_id),
        summary=summary,
        details=details or {},
    )


# ─── Learner views ────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def learning_dashboard(request):
    return Response(build_learning_dashboard(request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_enrollments(request):
    enrollments = Enrollment.objects.filter(user=request.user).select_related("course")
    return Response(EnrollmentSerializer(enrollments, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_courses(request):
    audiences = audiences_for_user(request.user)
    courses = Course.objects.filter(status="published")
    if audiences:
        courses = courses.filter(audience__in=audiences)
    return Response(CourseListSerializer(courses, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def course_detail(request, pk):
    course = get_object_or_404(Course, pk=pk, status="published")
    return Response(CourseSerializer(course).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_module(request, module_id):
    module = get_object_or_404(CourseModule, pk=module_id)
    enrollment, _ = Enrollment.objects.get_or_create(
        user=request.user,
        course=module.course,
        defaults={"status": "in_progress"},
    )
    progress, _ = ModuleProgress.objects.get_or_create(enrollment=enrollment, module=module)
    progress.completed = True
    progress.completed_at = timezone.now()
    progress.save()
    enrollment.update_progress()
    log_from_request(
        request,
        action="module_complete",
        entity_type="enrollment",
        entity_id=str(enrollment.id),
        summary=f"Completed module {module.title}",
        details={"module_id": module.id},
    )
    return Response({"enrollment_id": enrollment.id, "progress_pct": enrollment.progress_pct})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_assessment(request, course_id):
    course = get_object_or_404(Course, pk=course_id, status="published")
    enrollment = get_object_or_404(Enrollment, user=request.user, course=course)
    attempt = start_assessment_for_enrollment(enrollment)
    data = AssessmentStartSerializer(attempt).data
    data["questions"] = QuestionSerializer(questions_for_attempt(attempt), many=True).data
    return Response(data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_assessment(request, attempt_id):
    attempt = get_object_or_404(AssessmentAttempt, pk=attempt_id, enrollment__user=request.user)
    if attempt.completed_at:
        return Response({"detail": "Assessment already submitted."}, status=status.HTTP_400_BAD_REQUEST)
    if attempt.is_expired():
        finalize_assessment(attempt)
        return Response(
            {"detail": "Assessment time expired.", "attempt": AssessmentAttemptSerializer(attempt).data},
            status=status.HTTP_400_BAD_REQUEST,
        )
    attempt.answers = request.data.get("answers", {})
    attempt.save(update_fields=["answers"])
    finalize_assessment(attempt)
    log_from_request(
        request,
        action="assessment_submit",
        entity_type="assessment_attempt",
        entity_id=str(attempt.id),
        summary=f"Submitted assessment for {attempt.enrollment.course.title}",
        details={"score_pct": attempt.score_pct, "passed": attempt.passed},
    )
    return Response(AssessmentAttemptSerializer(attempt).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_certificates(request):
    certs = Certificate.objects.filter(enrollment__user=request.user).select_related("enrollment__course")
    return Response(CertificateSerializer(certs, many=True).data)


# ─── Admin views ──────────────────────────────────────────────


class CourseListCreateView(generics.ListCreateAPIView):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAcademyAdmin]

    def perform_create(self, serializer):
        course = serializer.save(created_by=self.request.user)
        _audit_admin(
            self.request,
            entity_type="course",
            entity_id=course.id,
            summary=f"Created course {course.title}",
        )


class CourseDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Course.objects.all()
    serializer_class = CourseSerializer
    permission_classes = [IsAcademyAdmin]

    def perform_update(self, serializer):
        course = serializer.save()
        _audit_admin(
            self.request,
            entity_type="course",
            entity_id=course.id,
            summary=f"Updated course {course.title}",
        )

    def perform_destroy(self, instance):
        course_id = instance.id
        title = instance.title
        instance.delete()
        _audit_admin(
            self.request,
            entity_type="course",
            entity_id=course_id,
            summary=f"Deleted course {title}",
        )


class ModuleListCreateView(generics.ListCreateAPIView):
    queryset = CourseModule.objects.all()
    serializer_class = CourseModuleSerializer
    permission_classes = [IsAcademyAdmin]

    def perform_create(self, serializer):
        module = serializer.save()
        _audit_admin(
            self.request,
            entity_type="course_module",
            entity_id=module.id,
            summary=f"Created module {module.title}",
        )


class ModuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CourseModule.objects.all()
    serializer_class = CourseModuleSerializer
    permission_classes = [IsAcademyAdmin]


class QuestionListCreateView(generics.ListCreateAPIView):
    queryset = Question.objects.all()
    permission_classes = [IsAcademyAdmin]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return QuestionAdminSerializer
        return QuestionSerializer

    def perform_create(self, serializer):
        question = serializer.save()
        _audit_admin(
            self.request,
            entity_type="question",
            entity_id=question.id,
            summary=f"Created question for course {question.course_id}",
        )


class QuestionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Question.objects.all()
    serializer_class = QuestionAdminSerializer
    permission_classes = [IsAcademyAdmin]


class EnrollmentListCreateView(generics.ListCreateAPIView):
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAcademyAdmin]

    def perform_create(self, serializer):
        enrollment = serializer.save(assigned_by=self.request.user)
        _audit_admin(
            self.request,
            entity_type="enrollment",
            entity_id=enrollment.id,
            summary=f"Created enrollment for user {enrollment.user_id}",
        )


class EnrollmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Enrollment.objects.all()
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAcademyAdmin]


@api_view(["POST"])
@permission_classes([IsAcademyAdmin])
def assign_course(request):
    user_id = request.data.get("user_id")
    course_id = request.data.get("course_id")
    due_date = request.data.get("due_date")
    user = get_object_or_404(User, pk=user_id)
    course = get_object_or_404(Course, pk=course_id)
    enrollment, created = assign_course_to_user(
        user=user,
        course=course,
        assigned_by=request.user,
        due_date=due_date,
    )
    _audit_admin(
        request,
        entity_type="enrollment",
        entity_id=enrollment.id,
        summary=f"Assigned course {course.title} to {user.email}",
        details={"created": created},
    )
    return Response(EnrollmentSerializer(enrollment).data)


@api_view(["POST"])
@permission_classes([IsAcademyAdmin])
def bulk_assign_course(request):
    course_id = request.data.get("course_id")
    due_date = request.data.get("due_date")
    course = get_object_or_404(Course, pk=course_id)
    result = bulk_assign_by_audience(course=course, assigned_by=request.user, due_date=due_date)
    _audit_admin(
        request,
        entity_type="course",
        entity_id=course.id,
        summary=f"Bulk assigned course {course.title}",
        details=result,
    )
    return Response(result)


@api_view(["POST"])
@permission_classes([IsAcademyAdmin])
def issue_certificate(request, enrollment_id):
    enrollment = get_object_or_404(Enrollment, pk=enrollment_id)
    cert, created = Certificate.objects.get_or_create(
        enrollment=enrollment,
        defaults={"status": "active"},
    )
    _audit_admin(
        request,
        entity_type="certificate",
        entity_id=cert.id,
        summary=f"Issued certificate for enrollment {enrollment_id}",
        details={"created": created},
    )
    return Response(CertificateSerializer(cert).data)


@api_view(["POST"])
@permission_classes([IsAcademyAdmin])
def suspend_certificate(request, cert_id):
    cert = get_object_or_404(Certificate, pk=cert_id)
    cert.status = "suspended"
    cert.save(update_fields=["status", "updated_at"])
    send_push_notification(
        cert.enrollment.user_id,
        "Certification suspended",
        f"Your certificate for {cert.enrollment.course.title} has been suspended.",
    )
    _audit_admin(
        request,
        entity_type="certificate",
        entity_id=cert.id,
        summary=f"Suspended certificate {cert.certificate_number}",
    )
    return Response(CertificateSerializer(cert).data)


@api_view(["GET"])
@permission_classes([IsAcademyAdmin])
def academy_results(request):
    attempts = AssessmentAttempt.objects.select_related("enrollment__user", "enrollment__course")
    return Response(AssessmentAttemptSerializer(attempts, many=True).data)


@api_view(["GET"])
@permission_classes([IsAcademyAdmin])
def admin_certificates(request):
    certs = Certificate.objects.select_related("enrollment__user", "enrollment__course")
    return Response(CertificateSerializer(certs, many=True).data)


# ─── Reports & CEO dashboard ──────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCEOrAdmin])
def academy_dashboard(request):
    return Response(build_academy_dashboard())


@api_view(["GET"])
@permission_classes([IsCEOrAdmin])
def academy_training_report(request):
    enrollments = Enrollment.objects.select_related("user", "course")
    payload = {
        "total": enrollments.count(),
        "by_status": {
            status_code: Enrollment.objects.filter(status=status_code).count()
            for status_code, _ in Enrollment.STATUS_CHOICES
        },
        "details": EnrollmentSerializer(enrollments, many=True).data,
    }
    export_format = request.query_params.get("export_format")
    if export_format == "csv":
        rows = [
            {
                "user": e.user.email,
                "course": e.course.title,
                "status": e.status,
                "progress_pct": e.progress_pct,
                "due_date": e.due_date,
                "completed_at": e.completed_at,
            }
            for e in enrollments
        ]
        _audit_admin(
            request,
            entity_type="report",
            entity_id="training",
            summary="Exported academy training report (csv)",
        )
        return HttpResponse(export_csv(rows), content_type="text/csv", headers={
            "Content-Disposition": 'attachment; filename="academy-training-report.csv"',
        })
    return Response(payload)


@api_view(["GET"])
@permission_classes([IsCEOrAdmin])
def academy_certification_report(request):
    certs = Certificate.objects.select_related("enrollment__user", "enrollment__course")
    return Response(
        {
            "total": certs.count(),
            "active": certs.filter(status="active").count(),
            "expired": certs.filter(status="expired").count(),
            "suspended": certs.filter(status="suspended").count(),
            "certificates": CertificateSerializer(certs, many=True).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsCEOrAdmin])
def expired_certifications_report(request):
    today = timezone.localdate()
    expired = Certificate.objects.filter(expiration_date__lt=today)
    return Response(
        {
            "count": expired.count(),
            "certificates": CertificateSerializer(expired, many=True).data,
        }
    )


@api_view(["GET"])
@permission_classes([IsCEOrAdmin])
def department_progress_report(request):
    return Response(build_department_progress_report())
