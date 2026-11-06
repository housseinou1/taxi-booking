"""DRF serializers for Employee Management.

employee_number is always read-only and server-generated; clients can never set
or modify it. employment_status transitions go through a dedicated action, not
the generic update serializer, so status changes are audited explicitly.
"""

from rest_framework import serializers

from employees.models import (
    CardStatus,
    EmployeeIDCard,
    EmploymentStatus,
    StaffEmployee,
)
from employees.permissions import can_view_employee_dob


class EmployeeIDCardSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_valid = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeIDCard
        fields = [
            "id",
            "card_number",
            "status",
            "status_display",
            "is_valid",
            "issued_at",
            "expires_at",
            "renewed_at",
            "renewal_count",
            "previous_card",
            "replaced_by",
            "created_at",
        ]
        read_only_fields = fields  # cards are managed only via lifecycle actions

    def get_is_valid(self, obj) -> bool:
        return obj.is_valid()


class StaffEmployeeSerializer(serializers.ModelSerializer):
    """Read + create/update of employee records.

    - employee_number: read-only (server-generated, permanent).
    - employment_status: read-only here; changed via the status action.
    - photo_key is not exposed for write in Phase 3 (metadata only).
    """

    employment_status_display = serializers.CharField(
        source="get_employment_status_display", read_only=True
    )
    active_card = serializers.SerializerMethodField()

    # DOB is sensitive. It is WRITE-ONLY by default so registration/updates keep
    # working, but it is never serialized OUT unless the requesting user holds
    # the employees.view_dob capability (see to_representation). This closes the
    # Phase 5 gap where DOB was returned to any HR reader.
    date_of_birth = serializers.DateField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = StaffEmployee
        fields = [
            "id",
            "employee_number",
            "full_name",
            "date_of_birth",
            "department",
            "job_title",
            "employment_start_date",
            "employment_status",
            "employment_status_display",
            "user",
            "active_card",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "employee_number",
            "employment_status",  # changed only via the status action
            "created_at",
            "updated_at",
        ]

    def _request_user(self):
        request = self.context.get("request")
        return getattr(request, "user", None) if request else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Only authorized users (administrator tier) ever see DOB in output.
        # Because date_of_birth is write_only it is absent from `data` here;
        # we add it back explicitly for authorized readers only.
        if can_view_employee_dob(self._request_user()):
            dob = instance.date_of_birth
            data["date_of_birth"] = dob.isoformat() if dob else None
        return data

    def get_active_card(self, obj):
        card = obj.id_cards.filter(status=CardStatus.VALID).order_by("-created_at").first()
        if not card:
            return None
        return EmployeeIDCardSerializer(card).data

    def validate_full_name(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Full name is required.")
        return value


class EmployeeRegistrationSerializer(StaffEmployeeSerializer):
    """Registration payload. full_name is required; employee_number is never
    accepted from the client."""

    class Meta(StaffEmployeeSerializer.Meta):
        pass

    def validate(self, attrs):
        # Defensive: strip any attempt to inject an employee_number.
        attrs.pop("employee_number", None)
        return attrs


class EmploymentStatusChangeSerializer(serializers.Serializer):
    employment_status = serializers.ChoiceField(choices=EmploymentStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)


class CardActionSerializer(serializers.Serializer):
    """Optional reason/note for lifecycle actions (replace/revoke)."""

    reason = serializers.CharField(required=False, allow_blank=True, max_length=120)
