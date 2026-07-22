"""Phase 39 — YALA Academy URL configuration."""

from django.urls import path

from .views import (
    CourseDetailView,
    CourseListCreateView,
    EnrollmentDetailView,
    EnrollmentListCreateView,
    ModuleDetailView,
    ModuleListCreateView,
    QuestionDetailView,
    QuestionListCreateView,
    academy_certification_report,
    academy_dashboard,
    academy_results,
    academy_training_report,
    admin_certificates,
    assign_course,
    available_courses,
    bulk_assign_course,
    complete_module,
    course_detail,
    department_progress_report,
    expired_certifications_report,
    issue_certificate,
    learning_dashboard,
    my_certificates,
    my_enrollments,
    start_assessment,
    submit_assessment,
    suspend_certificate,
)

app_name = "academy"

urlpatterns = [
    # Learner endpoints
    path("learning-dashboard/", learning_dashboard, name="learning-dashboard"),
    path("my-enrollments/", my_enrollments, name="my-enrollments"),
    path("courses/available/", available_courses, name="available-courses"),
    path("courses/<int:pk>/", course_detail, name="course-detail"),
    path("modules/<int:module_id>/complete/", complete_module, name="complete-module"),
    path("courses/<int:course_id>/start-assessment/", start_assessment, name="start-assessment"),
    path("assessments/<int:attempt_id>/submit/", submit_assessment, name="submit-assessment"),
    path("my-certificates/", my_certificates, name="my-certificates"),

    # Admin endpoints
    path("admin/courses/", CourseListCreateView.as_view(), name="admin-course-list"),
    path("admin/courses/<int:pk>/", CourseDetailView.as_view(), name="admin-course-detail"),
    path("admin/modules/", ModuleListCreateView.as_view(), name="admin-module-list"),
    path("admin/modules/<int:pk>/", ModuleDetailView.as_view(), name="admin-module-detail"),
    path("admin/questions/", QuestionListCreateView.as_view(), name="admin-question-list"),
    path("admin/questions/<int:pk>/", QuestionDetailView.as_view(), name="admin-question-detail"),
    path("admin/enrollments/", EnrollmentListCreateView.as_view(), name="admin-enrollment-list"),
    path("admin/enrollments/<int:pk>/", EnrollmentDetailView.as_view(), name="admin-enrollment-detail"),
    path("admin/assign-course/", assign_course, name="assign-course"),
    path("admin/bulk-assign/", bulk_assign_course, name="bulk-assign-course"),
    path("admin/issue-certificate/<int:enrollment_id>/", issue_certificate, name="issue-certificate"),
    path("admin/suspend-certificate/<int:cert_id>/", suspend_certificate, name="suspend-certificate"),
    path("admin/results/", academy_results, name="academy-results"),
    path("admin/certificates/", admin_certificates, name="admin-certificates"),

    # CEO / Reports endpoints
    path("dashboard/", academy_dashboard, name="academy-dashboard"),
    path("reports/training/", academy_training_report, name="academy-training-report"),
    path("reports/certifications/", academy_certification_report, name="academy-certification-report"),
    path("reports/expired-certifications/", expired_certifications_report, name="expired-certifications-report"),
    path("reports/department-progress/", department_progress_report, name="department-progress-report"),
]
