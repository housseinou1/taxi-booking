"""Phase 20 — Business Operations Platform API views."""

from decimal import Decimal

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .business_ops_service import (
    build_bi_dashboard,
    build_business_hub,
    build_compliance_dashboard,
    build_compliance_export_rows,
    build_corporate_account_detail,
    build_corporate_dashboard,
    build_crm_dashboard,
    build_crm_profile_detail,
    build_finance_center,
    build_finance_export_rows,
    build_incentives_dashboard,
    build_invoice_export_rows,
    build_marketing_analytics,
    build_marketing_dashboard,
    build_partner_dashboard,
    build_partner_detail,
    create_marketing_campaign,
    generate_corporate_invoice,
    update_crm_profile,
)
from .executive_permissions import IsExecutiveStaff
from .report_export import export_csv, export_excel, export_pdf


def _city_id(request):
    raw = request.query_params.get("city") or request.query_params.get("city_id")
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _export_response(rows, export_format, filename, title="Yala Business Report"):
    if export_format == "xlsx":
        content = export_excel(rows)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename += ".xlsx"
    elif export_format == "pdf":
        content = export_pdf(rows, title=title)
        content_type = "application/pdf"
        filename += ".pdf"
    else:
        content = export_csv(rows)
        content_type = "text/csv"
        filename += ".csv"
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_hub(request):
    return Response(build_business_hub(city_id=_city_id(request)))


# ── Module 1: Finance Center ────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_finance(request):
    period = request.query_params.get("period", "daily")
    if period not in {"daily", "weekly", "monthly", "yearly"}:
        period = "daily"
    return Response(build_finance_center(period=period, city_id=_city_id(request)))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_finance_export(request):
    period = request.query_params.get("period", "daily")
    export_format = request.query_params.get("export_format", "csv")
    rows = build_finance_export_rows(period=period, city_id=_city_id(request))
    return _export_response(rows, export_format, "finance-center", title="Yala Finance Center")


# ── Module 2: CRM ───────────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_crm(request):
    return Response(
        build_crm_dashboard(
            search=request.query_params.get("search", ""),
            profile_type=request.query_params.get("profile_type", ""),
        )
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsExecutiveStaff])
def business_crm_profile(request, user_id):
    if request.method == "GET":
        detail = build_crm_profile_detail(user_id)
        if not detail:
            return Response({"detail": "Profile not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(detail)

    detail = update_crm_profile(user_id, request.data or {}, request.user)
    if not detail:
        return Response({"detail": "Profile not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=str(user_id),
        summary=f"Updated CRM profile for user {user_id}",
    )
    return Response(detail)


# ── Module 3: Marketing ─────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_marketing(request):
    return Response(build_marketing_dashboard())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_marketing_analytics(request):
    return Response(build_marketing_analytics())


@api_view(["GET", "POST"])
@permission_classes([IsExecutiveStaff])
def business_marketing_campaigns(request):
    if request.method == "GET":
        return Response(build_marketing_dashboard())

    payload = request.data or {}
    if not payload.get("name"):
        return Response({"detail": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
    campaign = create_marketing_campaign(payload, request.user)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(campaign.id),
        summary=f"Created marketing campaign: {campaign.name}",
    )
    return Response(
        {"id": campaign.id, "name": campaign.name, "status": campaign.status},
        status=status.HTTP_201_CREATED,
    )


# ── Module 4: Driver Incentives ─────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_incentives(request):
    return Response(build_incentives_dashboard())


# ── Module 5: Partner Portal ────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_partners(request):
    return Response(build_partner_dashboard(partner_type=request.query_params.get("type", "")))


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_partner_detail(request, partner_id):
    detail = build_partner_detail(partner_id)
    if not detail:
        return Response({"detail": "Partner not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(detail)


# ── Module 6: Corporate Accounts ──────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_corporate(request):
    return Response(build_corporate_dashboard())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_corporate_detail(request, account_type, account_id):
    detail = build_corporate_account_detail(account_type, account_id)
    if not detail:
        return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(detail)


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def business_corporate_invoice(request):
    payload = request.data or {}
    period_start = payload.get("period_start")
    period_end = payload.get("period_end")
    account_type = payload.get("account_type")
    account_id = payload.get("account_id")
    if not all([period_start, period_end, account_type, account_id]):
        return Response(
            {"detail": "period_start, period_end, account_type, and account_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    from datetime import date

    try:
        start = date.fromisoformat(period_start)
        end = date.fromisoformat(period_end)
    except ValueError:
        return Response({"detail": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

    invoice = generate_corporate_invoice(
        account_type,
        int(account_id),
        start,
        end,
        invoice_frequency=payload.get("invoice_frequency", "monthly"),
        tax_rate=Decimal(str(payload.get("tax_rate", 0))),
    )
    if not invoice:
        return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=invoice.invoice_number,
        summary=f"Generated invoice {invoice.invoice_number}",
    )
    return Response(
        {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": str(invoice.amount),
            "status": invoice.status,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_corporate_invoices(request):
    from .models import CorporateInvoice

    invoices = CorporateInvoice.objects.order_by("-created_at")[:200]
    return Response(
        list(
            invoices.values(
                "id",
                "invoice_number",
                "company_name",
                "amount",
                "subtotal",
                "tax_amount",
                "status",
                "invoice_frequency",
                "period_start",
                "period_end",
            )
        )
    )


@api_view(["GET", "PATCH"])
@permission_classes([IsExecutiveStaff])
def business_corporate_invoice_detail(request, invoice_id):
    from .models import CorporateInvoice

    invoice = CorporateInvoice.objects.filter(id=invoice_id).first()
    if not invoice:
        return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        new_status = (request.data.get("status") or "").strip()
        if new_status in dict(CorporateInvoice.STATUS_CHOICES):
            invoice.status = new_status
            if new_status == "sent" and not invoice.sent_at:
                invoice.sent_at = timezone.now()
            if new_status == "paid" and not invoice.paid_at:
                invoice.paid_at = timezone.now()
            invoice.save()
            log_from_request(
                request,
                action="admin_action",
                entity_type="corporate_invoice",
                entity_id=invoice.id,
                summary=f"Invoice {invoice.invoice_number} → {new_status}",
            )
        return Response({"id": invoice.id, "status": invoice.status})

    return Response(
        {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "company_name": invoice.company_name,
            "amount": str(invoice.amount),
            "subtotal": str(invoice.subtotal),
            "tax_amount": str(invoice.tax_amount),
            "tax_rate": str(invoice.tax_rate),
            "status": invoice.status,
            "invoice_frequency": invoice.invoice_frequency,
            "period_start": str(invoice.period_start),
            "period_end": str(invoice.period_end),
            "ride_count": invoice.ride_count,
            "delivery_count": invoice.delivery_count,
        }
    )


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_corporate_invoice_export(request, invoice_id):
    from .models import CorporateInvoice

    invoice = CorporateInvoice.objects.filter(id=invoice_id).first()
    if not invoice:
        return Response({"detail": "Invoice not found."}, status=status.HTTP_404_NOT_FOUND)
    export_format = request.query_params.get("export_format", "csv")
    rows = build_invoice_export_rows(invoice)
    return _export_response(
        rows,
        export_format,
        f"invoice-{invoice.invoice_number}",
        title=f"Invoice {invoice.invoice_number}",
    )


@api_view(["POST"])
@permission_classes([IsExecutiveStaff])
def business_corporate_account_action(request, account_type, account_id):
    from features.corporate_service import approve_company, suspend_company
    from features.models import CorporateAccount

    if account_type != "ride_corporate":
        return Response({"detail": "Only ride corporate accounts supported."}, status=status.HTTP_400_BAD_REQUEST)

    account = CorporateAccount.objects.filter(id=account_id).first()
    if not account:
        return Response({"detail": "Account not found."}, status=status.HTTP_404_NOT_FOUND)

    action = (request.data.get("action") or "").strip().lower()
    if action == "approve":
        approve_company(account)
    elif action == "suspend":
        suspend_company(account)
    else:
        return Response({"detail": "action must be approve or suspend."}, status=status.HTTP_400_BAD_REQUEST)

    if "credit_limit" in request.data:
        account.credit_limit = Decimal(str(request.data.get("credit_limit")))
        account.save(update_fields=["credit_limit"])
    if "discount_percent" in request.data:
        account.discount_percent = Decimal(str(request.data.get("discount_percent")))
        account.save(update_fields=["discount_percent"])

    log_from_request(
        request,
        action="admin_action",
        entity_type="corporate_account",
        entity_id=account.id,
        summary=f"Corporate account {action}: {account.company_name}",
    )
    return Response({"id": account.id, "status": account.status, "is_active": account.is_active})


# ── Module 7: Compliance ────────────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_compliance(request):
    return Response(build_compliance_dashboard())


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_compliance_export(request):
    export_format = request.query_params.get("export_format", "csv")
    rows = build_compliance_export_rows()
    return _export_response(rows, export_format, "compliance-report", title="Yala Compliance Report")


# ── Module 8: Business Intelligence ─────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsExecutiveStaff])
def business_bi(request):
    return Response(build_bi_dashboard(city_id=_city_id(request)))
