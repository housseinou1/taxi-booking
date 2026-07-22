"""Phase 39 — YALA Academy training and certification models."""

from __future__ import annotations

import secrets
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Course(models.Model):
    AUDIENCE_CHOICES = [
        ("rider", "Rider"),
        ("driver", "Driver"),
        ("courier", "Courier"),
        ("merchant", "Merchant"),
        ("support", "Customer Support"),
        ("operations", "Operations"),
        ("finance", "Finance"),
        ("supervisor", "Supervisor"),
        ("collector", "Collector"),
        ("landlord", "Landlord"),
        ("maintenance", "Maintenance Staff"),
        ("executive", "Executive"),
    ]
    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("published", "Published"),
        ("archived", "Archived"),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    passing_score = models.PositiveIntegerField(default=70, help_text="Passing percentage")
    exam_duration_minutes = models.PositiveIntegerField(
        default=0,
        help_text="Timed exam duration in minutes. 0 = untimed.",
    )
    randomize_questions = models.BooleanField(default=True)
    certificate_template = models.TextField(blank=True, default="")
    validity_months = models.PositiveIntegerField(default=12)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="draft", db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_courses",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.get_audience_display()})"


class CourseModule(models.Model):
    CONTENT_TYPE_CHOICES = [
        ("video", "Video"),
        ("pdf", "PDF"),
        ("slides", "Slides"),
        ("text", "Text"),
        ("quiz", "Quiz"),
    ]

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="modules")
    title = models.CharField(max_length=200)
    content_type = models.CharField(max_length=15, choices=CONTENT_TYPE_CHOICES)
    content = models.TextField(blank=True, default="")
    file = models.FileField(upload_to="academy/modules/", null=True, blank=True)
    url = models.URLField(blank=True, default="")
    duration_minutes = models.PositiveIntegerField(default=0)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["course", "order", "id"]

    def __str__(self):
        return f"{self.course.title} — {self.title}"


class Question(models.Model):
    QUESTION_TYPE_CHOICES = [
        ("mc", "Multiple Choice"),
        ("tf", "True/False"),
        ("scenario", "Scenario-based"),
    ]

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="questions")
    question_type = models.CharField(max_length=15, choices=QUESTION_TYPE_CHOICES)
    text = models.TextField()
    options = models.JSONField(default=list, blank=True)
    correct_answer = models.CharField(max_length=255)
    points = models.PositiveIntegerField(default=1)
    explanation = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.course.title} — Q{self.id}"


class Enrollment(models.Model):
    STATUS_CHOICES = [
        ("not_started", "Not Started"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="academy_enrollments",
    )
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="enrollments")
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="not_started", db_index=True)
    progress_pct = models.PositiveIntegerField(default=0)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_enrollments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [["user", "course"]]
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.user} — {self.course.title}"

    def update_progress(self):
        total_modules = self.course.modules.count()
        if total_modules == 0:
            self.progress_pct = 0
        else:
            completed = self.module_progress.filter(completed=True).count()
            self.progress_pct = min(100, round(completed / total_modules * 100))
        if self.progress_pct > 0 and self.status == "not_started":
            self.status = "in_progress"
        self.save(update_fields=["progress_pct", "status"])


class ModuleProgress(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="module_progress")
    module = models.ForeignKey(CourseModule, on_delete=models.CASCADE, related_name="user_progress")
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [["enrollment", "module"]]


class AssessmentAttempt(models.Model):
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="attempts")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    question_ids = models.JSONField(default=list, blank=True)
    score_pct = models.PositiveIntegerField(null=True, blank=True)
    passed = models.BooleanField(default=False)
    answers = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def is_expired(self) -> bool:
        return bool(self.expires_at and timezone.now() > self.expires_at and not self.completed_at)

    def grade(self):
        if not self.answers:
            return
        questions = self.enrollment.course.questions.all()
        if self.question_ids:
            questions = questions.filter(id__in=self.question_ids)
        total_points = 0
        earned = 0
        for q in questions:
            total_points += q.points
            ans = self.answers.get(str(q.id), "")
            if str(ans).strip().lower() == str(q.correct_answer).strip().lower():
                earned += q.points
        self.score_pct = round(earned / max(total_points, 1) * 100)
        self.passed = self.score_pct >= self.enrollment.course.passing_score


class Certificate(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("expired", "Expired"),
        ("suspended", "Suspended"),
    ]

    enrollment = models.OneToOneField(
        Enrollment,
        on_delete=models.CASCADE,
        related_name="certificate",
    )
    certificate_number = models.CharField(max_length=64, unique=True, db_index=True)
    issue_date = models.DateField(auto_now_add=True)
    expiration_date = models.DateField()
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default="active", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.certificate_number

    def save(self, *args, **kwargs):
        if not self.certificate_number:
            self.certificate_number = secrets.token_hex(16).upper()
        if not self.expiration_date:
            months = self.enrollment.course.validity_months or 12
            self.expiration_date = timezone.localdate() + timedelta(days=30 * months)
        super().save(*args, **kwargs)
