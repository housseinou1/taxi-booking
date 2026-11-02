"""Employee Management DRF API (staff-gated; no public endpoints).

Authorization is enforced per-action with the Phase 2 permission classes:

    read / register / update        -> IsHrStaff
    change employment status        -> IsHrManager
    card issue / renew / replace     -> IsHrManager   (approval tier)
    card activate / deactivate / revoke -> IsEmployeeAdministrator

HR Staff therefore cannot perform manager-approved issuance/renewal/replacement
or administrator-only activation/revocation. Every mutating action and
sensitive record access is audited via the Phase 2 employee audit service.
"""

import io

from django.http import FileResponse
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from employees.models import EmployeeIDCard, EmploymentStatus, StaffEmployee
from employees.permissions import (
    IsEmployeeAdministrator,
    IsHrManager,
    IsHrStaff,
)
from employees.services import photo_storage, signature_storage
from employees.serializers import (
    CardActionSerializer,
    EmployeeIDCardSerializer,
    EmployeeRegistrationSerializer,
    EmploymentStatusChangeSerializer,
    StaffEmployeeSerializer,
)
from employees.services import card_service
from employees.services.audit import ENTITY_EMPLOYEE, ENTITY_ID_CARD, log_employee_event
from employees.services.number_service import create_staff_employee


def _qr_png_bytes(card, box_size: int = 8) -> bytes:
    """Render the card's verification QR as PNG bytes.

    The QR now carries a **signed, expiring verification token** (see
    `employees/services/verification_tokens.py`) instead of the bare UUID, so a
    scanned code is a verifiable credential rather than a lookup key. The card's own
    validity is still re-checked server-side at scan time.
    """
    import qrcode

    from employees.services import verification_tokens

    token = verification_tokens.issue_token(
        qr_uuid=card.qr_uuid, card_expires_at=card.expires_at
    )["token"]

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=2,
    )
    qr.add_data(token)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


class EmployeePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class StaffEmployeeViewSet(viewsets.ModelViewSet):
    """CRUD + search for employees, plus card lifecycle sub-actions.

    Base queryset is ordered by the permanent employee number. Deletion is not
    supported (records are preserved; use employment status instead).
    """

    queryset = StaffEmployee.objects.all().order_by("employee_number")
    pagination_class = EmployeePagination
    lookup_field = "employee_number"
    lookup_value_regex = r"[A-Za-z0-9]+"
    http_method_names = ["get", "post", "patch", "head", "options"]  # no DELETE

    # Search is restricted to non-sensitive, authorized fields only. DOB and
    # any sensitive data are never searchable, preventing enumeration leaks.
    SEARCHABLE_FIELDS = ("full_name", "employee_number", "department", "job_title")

    def get_serializer_class(self):
        if self.action == "create":
            return EmployeeRegistrationSerializer
        return StaffEmployeeSerializer

    def get_permissions(self):
        if self.action in {
            "list",
            "retrieve",
            "create",
            "partial_update",
            "update",
            "card_history",
            "photo",
            "signature",
            "card_qr",
            "card_pdf",
        }:
            return [IsHrStaff()]
        if self.action in {"change_status", "issue_card", "renew_card", "replace_card"}:
            return [IsHrManager()]
        if self.action in {"activate_card", "deactivate_card", "revoke_card", "audit_trail", "signature_remove"}:
            return [IsEmployeeAdministrator()]
        # Default-deny posture: any unlisted action requires the admin tier.
        return [IsEmployeeAdministrator()]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        search = (params.get("search") or "").strip()
        if search:
            # Restricted search: only across the allow-listed fields.
            from django.db.models import Q

            q = Q()
            for field in self.SEARCHABLE_FIELDS:
                q |= Q(**{f"{field}__icontains": search})
            qs = qs.filter(q)

        dept = (params.get("department") or "").strip()
        if dept:
            qs = qs.filter(department__iexact=dept)

        emp_status = (params.get("employment_status") or "").strip()
        if emp_status:
            qs = qs.filter(employment_status=emp_status)

        return qs

    # ── CRUD ────────────────────────────────────────────────────────────────
    def perform_create(self, serializer):
        data = dict(serializer.validated_data)
        data.pop("employee_number", None)  # defensive; never client-set
        employee = create_staff_employee(**data)
        serializer.instance = employee
        log_employee_event(
            self.request,
            event="employee.register",
            summary=f"Registered employee {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"department": employee.department, "job_title": employee.job_title},
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Sensitive record access is audited.
        log_employee_event(
            request,
            event="employee.record_access",
            summary=f"Accessed record {instance.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=instance.employee_number,
        )
        return Response(self.get_serializer(instance).data)

    def perform_update(self, serializer):
        employee = serializer.save()
        log_employee_event(
            self.request,
            event="employee.update",
            summary=f"Updated employee {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"fields": sorted(serializer.validated_data.keys())},
        )

    # ── Employment status (HR Manager) ───────────────────────────────────────
    @action(detail=True, methods=["post"], url_path="status")
    def change_status(self, request, employee_number=None):
        employee = self.get_object()
        ser = EmploymentStatusChangeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        new_status = ser.validated_data["employment_status"]
        old_status = employee.employment_status
        employee.employment_status = new_status
        employee.save(update_fields=["employment_status", "updated_at"])
        log_employee_event(
            request,
            event="employee.status_change",
            summary=f"{employee.employee_number}: {old_status} -> {new_status}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"from": old_status, "to": new_status},
        )
        return Response(StaffEmployeeSerializer(employee).data)

    # ── Card history (HR Staff) ──────────────────────────────────────────────
    @action(detail=True, methods=["get"], url_path="cards")
    def card_history(self, request, employee_number=None):
        employee = self.get_object()
        cards = card_service.card_history(employee)
        return Response(EmployeeIDCardSerializer(cards, many=True).data)

    # ── Card lifecycle: issue / renew / replace (HR Manager) ─────────────────
    def _card_action(self, request, service_fn, **extra):
        employee = self.get_object()
        try:
            card = service_fn(employee, request=request, **extra)
        except card_service.CardLifecycleError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(EmployeeIDCardSerializer(card).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cards/issue")
    def issue_card(self, request, employee_number=None):
        return self._card_action(request, card_service.issue_card)

    @action(detail=True, methods=["post"], url_path="cards/renew")
    def renew_card(self, request, employee_number=None):
        return self._card_action(request, card_service.renew_card)

    @action(detail=True, methods=["post"], url_path="cards/replace")
    def replace_card(self, request, employee_number=None):
        ser = CardActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return self._card_action(
            request, card_service.replace_card, reason=ser.validated_data.get("reason", "")
        )

    # ── Card lifecycle: activate / deactivate / revoke (Administrator) ───────
    def _card_by_pk(self, employee, card_pk):
        try:
            return employee.id_cards.get(pk=card_pk)
        except EmployeeIDCard.DoesNotExist:
            raise ValidationError({"detail": "Card not found for this employee."})

    @action(detail=True, methods=["post"], url_path=r"cards/(?P<card_pk>[0-9]+)/activate")
    def activate_card(self, request, employee_number=None, card_pk=None):
        employee = self.get_object()
        card = self._card_by_pk(employee, card_pk)
        try:
            card = card_service.activate_card(card, request=request)
        except card_service.CardLifecycleError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(EmployeeIDCardSerializer(card).data)

    @action(detail=True, methods=["post"], url_path=r"cards/(?P<card_pk>[0-9]+)/deactivate")
    def deactivate_card(self, request, employee_number=None, card_pk=None):
        employee = self.get_object()
        card = self._card_by_pk(employee, card_pk)
        try:
            card = card_service.deactivate_card(card, request=request)
        except card_service.CardLifecycleError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(EmployeeIDCardSerializer(card).data)

    @action(detail=True, methods=["post"], url_path=r"cards/(?P<card_pk>[0-9]+)/revoke")
    def revoke_card(self, request, employee_number=None, card_pk=None):
        employee = self.get_object()
        card = self._card_by_pk(employee, card_pk)
        ser = CardActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            card = card_service.revoke_card(card, request=request, reason=ser.validated_data.get("reason", ""))
        except card_service.CardLifecycleError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(EmployeeIDCardSerializer(card).data)

    # ── Audit trail (Administrator tier) ─────────────────────────────────────
    @action(detail=True, methods=["get"], url_path="audit")
    def audit_trail(self, request, employee_number=None):
        """Read-only audit trail for one employee (Administrator tier).

        Returns the employee's own lifecycle events (logged against the employee
        number) plus the events of that employee's ID cards (logged against the
        card number). Newest first. The audit service scrubs sensitive keys
        (DOB, QR tokens, photo keys) before writing, and this endpoint returns
        only descriptive metadata — never card tokens or HR-sensitive fields.

        Query params: limit (default 50, max 200).
        """
        from django.db.models import Q

        from security.models import AuditLog

        employee = self.get_object()
        card_numbers = list(employee.id_cards.values_list("card_number", flat=True))

        queryset = (
            AuditLog.objects.filter(
                Q(entity_type=ENTITY_EMPLOYEE, entity_id=employee.employee_number)
                | Q(entity_type=ENTITY_ID_CARD, entity_id__in=card_numbers)
            )
            .select_related("actor")
            .order_by("-created_at")
        )

        try:
            limit = min(int(request.query_params.get("limit", 50)), 200)
        except (TypeError, ValueError):
            limit = 50

        results = [
            {
                "id": entry.id,
                "action": entry.action,
                "event": (entry.details or {}).get("event", ""),
                "entity_type": entry.entity_type,
                "entity_id": entry.entity_id,
                "summary": entry.summary,
                "actor_email": entry.actor.email if entry.actor else "",
                "created_at": entry.created_at,
            }
            for entry in queryset[:limit]
        ]

        return Response({"count": queryset.count(), "results": results})

    # ── ID-card QR image (HR Staff) ──────────────────────────────────────────
    @action(
        detail=True,
        methods=["get"],
        url_path=r"cards/(?P<card_pk>[0-9]+)/qr",
    )
    def card_qr(self, request, employee_number=None, card_pk=None):
        """Authenticated PNG of an ID card's verification QR code.

        The QR encodes only the card's opaque ``qr_uuid`` (never the DB pk, never
        the employee number), so possession of the image does not disclose HR
        data. There is deliberately NO public verification endpoint yet — the
        public scan flow is a separate, security-reviewed phase.

        Uses the ``qrcode`` library that is already a platform dependency (the
        driver QR service), so no new package is introduced.

        Query params: size (pixels per module, default 8, max 20).
        """
        import io

        import qrcode

        employee = self.get_object()
        card = self._card_by_pk(employee, card_pk)

        try:
            box_size = min(max(int(request.query_params.get("size", 8)), 4), 20)
        except (TypeError, ValueError):
            box_size = 8

        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=box_size,
            border=2,
        )
        qr.add_data(str(card.qr_uuid))
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white")

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        buffer.seek(0)

        log_employee_event(
            request,
            event="employee.record_access",
            summary=f"Viewed ID card QR for {employee.employee_number}",
            entity_type=ENTITY_ID_CARD,
            entity_id=card.card_number,
            details={"employee_number": employee.employee_number},
        )

        response = FileResponse(buffer, content_type="image/png")
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    # ── Photograph: upload/replace (POST) + retrieve (GET), HR Staff ─────────
    @action(
        detail=True,
        methods=["get", "post"],
        url_path="photo",
        parser_classes=[MultiPartParser, FormParser],
    )
    def photo(self, request, employee_number=None):
        employee = self.get_object()

        if request.method == "GET":
            if not employee.photo_key:
                return Response({"detail": "No photograph on file."}, status=status.HTTP_404_NOT_FOUND)
            try:
                handle = photo_storage.open_photo(employee.photo_key)
            except FileNotFoundError:
                return Response(
                    {"detail": "Photograph file is missing."}, status=status.HTTP_404_NOT_FOUND
                )
            log_employee_event(
                request,
                event="employee.photo_access",
                summary=f"Accessed photo for {employee.employee_number}",
                entity_type=ENTITY_EMPLOYEE,
                entity_id=employee.employee_number,
            )
            # Private serving via Django FileResponse (dev). Never cached by
            # shared caches; must be revalidated.
            response = FileResponse(handle, content_type=photo_storage.photo_content_type())
            response["Cache-Control"] = "private, no-store"
            response["X-Content-Type-Options"] = "nosniff"
            return response

        # POST: upload or replace.
        upload = request.FILES.get("photo")
        if upload is None:
            raise ValidationError({"detail": "A 'photo' file is required."})

        raw = upload.read()
        try:
            if employee.photo_key:
                new_key = photo_storage.replace_photo(employee.photo_key, raw)
                event = "employee.photo_replace"
                summary = f"Replaced photo for {employee.employee_number}"
            else:
                new_key = photo_storage.save_photo(raw)
                event = "employee.photo_upload"
                summary = f"Uploaded photo for {employee.employee_number}"
        except photo_storage.PhotoValidationError as exc:
            raise ValidationError({"detail": str(exc)})

        employee.photo_key = new_key
        employee.save(update_fields=["photo_key", "updated_at"])
        log_employee_event(
            request,
            event=event,
            summary=summary,
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            # Never log bytes/metadata; only non-sensitive descriptors.
            details={"has_photo": True},
        )
        return Response({"detail": "Photograph saved.", "has_photo": True})

    # ── Electronic signature (Founder/CEO directive) ───────────────────────────
    @action(
        detail=True,
        methods=["get", "post", "delete"],
        url_path="signature",
        parser_classes=[MultiPartParser, FormParser],
    )
    def signature(self, request, employee_number=None):
        """Read, record, replace or remove the employee's electronic signature.

        GET    -> streams the stored signature (private, no-store). HR Staff tier.
        POST   -> records or replaces it (multipart ``signature`` file + consent). HR Manager.
        DELETE -> removes it (and clears the record). Employee Administrator.

        The mutating tiers are enforced inside the action rather than in
        ``get_permissions`` because the DRF router resolves by path, so one ``url_path`` can
        only map to a single action — enforcing here keeps the stronger requirement on the
        mutating verbs instead of weakening them to the read tier.

        Consent is mandatory: the signature must be provided or approved by the employee.
        Nothing in this code path can generate, synthesise or imitate a signature.
        """
        from django.utils import timezone

        employee = self.get_object()

        if request.method == "GET":
            if not employee.signature_key:
                return Response(
                    {"detail": "No signature on file."}, status=status.HTTP_404_NOT_FOUND
                )
            try:
                handle = signature_storage.open_signature(employee.signature_key)
            except FileNotFoundError:
                return Response(
                    {"detail": "Signature file is missing."}, status=status.HTTP_404_NOT_FOUND
                )
            log_employee_event(
                request,
                event="employee.signature_access",
                summary=f"Accessed signature for {employee.employee_number}",
                entity_type=ENTITY_EMPLOYEE,
                entity_id=employee.employee_number,
            )
            response = FileResponse(
                handle, content_type=signature_storage.signature_content_type()
            )
            response["Cache-Control"] = "private, no-store"
            response["X-Content-Type-Options"] = "nosniff"
            return response

        # Mutating verb requires a stronger tier than the read.
        if not IsHrManager().has_permission(request, self):
            return Response(
                {"detail": "Recording a signature requires the HR Manager tier."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # POST — record or replace the signature.
        upload = request.FILES.get("signature")
        if upload is None:
            raise ValidationError({"detail": "A 'signature' file is required."})

        consent = str(request.data.get("consent", "")).strip().lower() in {
            "1",
            "true",
            "yes",
            "on",
        }
        if not consent:
            raise ValidationError(
                {
                    "detail": (
                        "Employee consent is required: the signature must be provided or "
                        "approved by the employee before it can be recorded."
                    )
                }
            )

        source = str(request.data.get("source", "") or "").strip().lower()
        if source not in {"pad", "upload"}:
            source = "upload"

        raw = upload.read()
        try:
            if employee.signature_key:
                new_key = signature_storage.replace_signature(employee.signature_key, raw)
                event = "employee.signature_replace"
                summary = f"Replaced signature for {employee.employee_number}"
            else:
                new_key = signature_storage.save_signature(raw)
                event = (
                    "employee.signature_capture" if source == "pad" else "employee.signature_upload"
                )
                summary = f"Recorded signature for {employee.employee_number}"
        except signature_storage.SignatureValidationError as exc:
            raise ValidationError({"detail": str(exc)})

        employee.signature_key = new_key
        employee.signature_source = source
        employee.signature_consent_confirmed = True
        employee.signature_provided_at = timezone.now()
        employee.signature_provided_by = request.user
        employee.save(
            update_fields=[
                "signature_key",
                "signature_source",
                "signature_consent_confirmed",
                "signature_provided_at",
                "signature_provided_by",
                "updated_at",
            ]
        )
        log_employee_event(
            request,
            event=event,
            summary=summary,
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            # Never log bytes or the storage key; only non-sensitive descriptors.
            details={"source": source, "consent_confirmed": True},
        )
        return Response({"detail": "Signature saved.", "has_signature": True, "source": source})

    @action(detail=True, methods=["post"], url_path="signature/remove")
    def signature_remove(self, request, employee_number=None):
        """Remove an incorrect signature (Employee Administrator tier, audited).

        Removal is a POST sub-route rather than an HTTP DELETE because this ViewSet
        deliberately restricts ``http_method_names`` to exclude ``delete`` — adding it would
        also re-enable employee deletion at ``/employees/{pk}/``, which must stay 405. The
        POST sub-route matches the existing ``cards/<pk>/revoke`` convention.
        """
        employee = self.get_object()
        removed = signature_storage.delete_signature(employee.signature_key)
        employee.signature_key = ""
        employee.signature_source = ""
        employee.signature_consent_confirmed = False
        employee.signature_provided_at = None
        employee.signature_provided_by = None
        employee.save(
            update_fields=[
                "signature_key",
                "signature_source",
                "signature_consent_confirmed",
                "signature_provided_at",
                "signature_provided_by",
                "updated_at",
            ]
        )
        log_employee_event(
            request,
            event="employee.signature_remove",
            summary=f"Removed signature for {employee.employee_number}",
            entity_type=ENTITY_EMPLOYEE,
            entity_id=employee.employee_number,
            details={"file_removed": bool(removed)},
        )
        return Response(
            {
                "detail": "Signature removed.",
                "has_signature": False,
                "file_removed": bool(removed),
            }
        )

    # ── ID-card PDF (HR Staff, audited) — Phase 11 ─────────────────────────────
    @action(
        detail=True,
        methods=["get"],
        url_path=r"cards/(?P<card_pk>[0-9]+)/pdf",
    )
    def card_pdf(self, request, employee_number=None, card_pk=None):
        """Server-side PDF of one ID card (ReportLab), HR tier, audited.

        The document never contains the employee's date of birth or national ID
        number, is generated per request (no cached public artefact) and always
        states the card's real status and expiry.
        """
        from employees.services import card_pdf as card_pdf_service

        employee = self.get_object()
        card = self._card_by_pk(employee, card_pk)

        photo_bytes = None
        if getattr(employee, "photo_key", ""):
            try:
                with photo_storage.open_photo(employee.photo_key) as handle:
                    photo_bytes = handle.read()
            except Exception:
                photo_bytes = None

        # The employee's own signature, read from protected storage. When there is none the
        # card prints "Signature not provided" — the renderer never invents a signature.
        signature_bytes = None
        if getattr(employee, "signature_key", ""):
            try:
                with signature_storage.open_signature(employee.signature_key) as handle:
                    signature_bytes = handle.read()
            except Exception:
                signature_bytes = None

        pdf_bytes = card_pdf_service.build_card_pdf(
            employee=employee,
            card=card,
            qr_png=_qr_png_bytes(card),
            photo_bytes=photo_bytes,
            signature_bytes=signature_bytes,
        )

        log_employee_event(
            request,
            event="employee.record_access",
            summary=f"Downloaded ID card PDF for {employee.employee_number}",
            entity_type=ENTITY_ID_CARD,
            entity_id=card.card_number,
            details={"employee_number": employee.employee_number, "format": "pdf"},
        )

        response = FileResponse(
            io.BytesIO(pdf_bytes),
            content_type="application/pdf",
            filename=f"{card.card_number}.pdf",
        )
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
