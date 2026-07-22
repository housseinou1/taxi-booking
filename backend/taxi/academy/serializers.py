"""Phase 39 — YALA Academy serializers."""

from rest_framework import serializers

from .models import AssessmentAttempt, Certificate, Course, CourseModule, Enrollment, ModuleProgress, Question


class CourseModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseModule
        fields = ["id", "course", "title", "content_type", "content", "file", "url", "duration_minutes", "order"]
        read_only_fields = ["id"]


class QuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = [
            "id",
            "course",
            "question_type",
            "text",
            "options",
            "points",
            "explanation",
            "order",
        ]


class QuestionAdminSerializer(QuestionSerializer):
    class Meta(QuestionSerializer.Meta):
        fields = QuestionSerializer.Meta.fields + ["correct_answer"]


class CourseSerializer(serializers.ModelSerializer):
    modules = CourseModuleSerializer(many=True, read_only=True)
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "description",
            "audience",
            "passing_score",
            "exam_duration_minutes",
            "randomize_questions",
            "certificate_template",
            "validity_months",
            "status",
            "modules",
            "questions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CourseListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = [
            "id",
            "title",
            "description",
            "audience",
            "passing_score",
            "exam_duration_minutes",
            "status",
        ]


class EnrollmentSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="course.title", read_only=True)
    user_name = serializers.CharField(source="user.get_full_name", read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            "id",
            "user",
            "user_name",
            "course",
            "course_title",
            "status",
            "progress_pct",
            "assigned_by",
            "due_date",
            "completed_at",
            "updated_at",
        ]
        read_only_fields = ["id", "assigned_at", "completed_at", "updated_at"]


class ModuleProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModuleProgress
        fields = ["id", "enrollment", "module", "completed", "completed_at"]
        read_only_fields = ["id"]


class AssessmentAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssessmentAttempt
        fields = [
            "id",
            "enrollment",
            "started_at",
            "completed_at",
            "expires_at",
            "question_ids",
            "score_pct",
            "passed",
            "answers",
        ]
        read_only_fields = ["id", "started_at", "completed_at", "score_pct", "passed"]


class AssessmentStartSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = AssessmentAttempt
        fields = ["id", "enrollment", "started_at", "expires_at", "question_ids", "questions"]
        read_only_fields = fields


class CertificateSerializer(serializers.ModelSerializer):
    course_title = serializers.CharField(source="enrollment.course.title", read_only=True)
    user_name = serializers.CharField(source="enrollment.user.get_full_name", read_only=True)

    class Meta:
        model = Certificate
        fields = [
            "id",
            "enrollment",
            "certificate_number",
            "course_title",
            "user_name",
            "issue_date",
            "expiration_date",
            "status",
            "created_at",
        ]
        read_only_fields = ["id", "certificate_number", "issue_date"]
