"""Employee ID card management dashboards and official CEO signature."""

from __future__ import annotations

import io

from django.utils import timezone
from rest_framework import status
from rest_framework.parsers import FileUploadParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from employees.models import IdCardOfficialSettings
from employees.permissions import IsEmployeeAdministrator, IsHrStaff
from employees.services import ceo_signature_storage
from employees.services.audit import log_employee_event
from employees.services.id_card_dashboard import build_id_card_dashboard
from employees.services.signature_storage import SignatureValidationError


class IdCardDashboardView(APIView):
    """GET — HR identification-card KPIs (actual database aggregates)."""

    permission_classes = [IsHrStaff]

    def get(self, request):
        return Response(build_id_card_dashboard())


class CeoIdCardSignatureView(APIView):
    """GET/POST — official CEO signature asset for printed ID cards."""

    parser_classes = [MultiPartParser, FileUploadParser]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsEmployeeAdministrator()]
        return [IsHrStaff()]

    def get(self, request):
        settings_row = IdCardOfficialSettings.load()
        has = bool(settings_row.ceo_signature_key)
        payload = {
            "has_signature": has,
            "authorized_at": settings_row.authorized_at,
            "authorized_by": getattr(settings_row.authorized_by, "username", None),
        }
        if has and request.query_params.get("preview") == "1":
            try:
                with ceo_signature_storage.open_ceo_signature(settings_row.ceo_signature_key) as fh:
                    data = fh.read()
            except FileNotFoundError:
                payload["has_signature"] = False
                return Response(payload)
            from django.http import FileResponse

            return FileResponse(
                io.BytesIO(data),
                content_type="image/png",
            )
        return Response(payload)

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response(
                {"detail": "A signature image file is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw = upload.read()
        settings_row = IdCardOfficialSettings.load()
        try:
            if settings_row.ceo_signature_key:
                new_key = ceo_signature_storage.replace_ceo_signature(
                    settings_row.ceo_signature_key, raw
                )
            else:
                new_key = ceo_signature_storage.save_ceo_signature(raw)
        except SignatureValidationError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        settings_row.ceo_signature_key = new_key
        settings_row.authorized_at = timezone.now()
        settings_row.authorized_by = request.user
        settings_row.save(
            update_fields=[
                "ceo_signature_key",
                "authorized_at",
                "authorized_by",
                "updated_at",
            ]
        )
        log_employee_event(
            request,
            event="employee.ceo_signature_authorize",
            summary="Authorized official CEO signature for employee ID cards",
            entity_type="id_card_official",
            entity_id="ceo_signature",
            details={"key_prefix": new_key[:8]},
        )
        return Response(
            {
                "detail": "CEO signature saved.",
                "has_signature": True,
                "authorized_at": settings_row.authorized_at,
            }
        )
