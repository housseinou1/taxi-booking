"""Yala Business Accounts API views."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .corporate_permissions import IsCorporateAdmin
from .corporate_service import (
    get_company_admin_profile,
    get_employee_profile,
    invite_employee,
    register_company,
    serialize_account,
    serialize_employee,
)
from .models import CorporateAccount, CorporateEmployee

User = get_user_model()


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_corporate_account(request):
    employee = get_employee_profile(request.user)
    if not employee:
        return Response({"detail": "No corporate account linked."}, status=status.HTTP_404_NOT_FOUND)
    account = employee.account
    return Response(
        {
            "company": account.company_name,
            "company_id": account.id,
            "department": employee.department,
            "role": employee.role,
            "cost_center": employee.cost_center,
            "monthly_limit": float(employee.monthly_limit),
            "monthly_spent": float(employee.monthly_spent),
            "remaining": float(employee.monthly_limit - employee.monthly_spent),
            "discount_percent": float(account.discount_percent),
            "billing_type": account.billing_type,
            "status": account.status,
            "can_book_corporate": account.status == "approved" and employee.is_active,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def register_corporate_company(request):
    required = ["company_name", "contact_person", "contact_email", "contact_phone"]
    for field in required:
        if not (request.data.get(field) or "").strip():
            return Response({"detail": f"{field} is required."}, status=status.HTTP_400_BAD_REQUEST)

    admin_user = request.user if request.user.is_authenticated else None
    account = register_company(request.data, admin_user=admin_user)
    log_from_request(
        request,
        action="corporate_register",
        entity_type="corporate_account",
        entity_id=account.id,
        summary=f"Company registration submitted: {account.company_name}",
    )
    return Response(
        {"id": account.id, "company_name": account.company_name, "status": account.status},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsCorporateAdmin])
def company_admin_dashboard(request):
    admin = get_company_admin_profile(request.user)
    account = admin.account
    employees = [serialize_employee(row) for row in account.employees.select_related("user").all()]
    return Response({"account": serialize_account(account), "employees": employees})


@api_view(["POST"])
@permission_classes([IsCorporateAdmin])
def company_invite_employee(request):
    admin = get_company_admin_profile(request.user)
    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response({"detail": "email is required."}, status=status.HTTP_400_BAD_REQUEST)

    employee = invite_employee(admin.account, email, request.data)
    log_from_request(
        request,
        action="corporate_employee_invite",
        entity_type="corporate_employee",
        entity_id=employee.id,
        summary=f"Invited {email} to {admin.account.company_name}",
    )
    return Response(serialize_employee(employee), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsCorporateAdmin])
def company_update_employee(request, employee_id):
    admin = get_company_admin_profile(request.user)
    employee = CorporateEmployee.objects.filter(id=employee_id, account=admin.account).first()
    if not employee:
        return Response({"detail": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

    if "is_active" in request.data:
        employee.is_active = bool(request.data.get("is_active"))
    if "monthly_limit" in request.data:
        employee.monthly_limit = Decimal(str(request.data.get("monthly_limit")))
    if "ride_limit" in request.data:
        value = request.data.get("ride_limit")
        employee.ride_limit = int(value) if value not in (None, "") else None
    if "cost_center" in request.data:
        employee.cost_center = (request.data.get("cost_center") or "")[:100]
    if "department" in request.data:
        employee.department = (request.data.get("department") or "")[:100]
    if "role" in request.data and request.data.get("role") in {"admin", "employee"}:
        employee.role = request.data["role"]
    employee.save()

    log_from_request(
        request,
        action="corporate_employee_update",
        entity_type="corporate_employee",
        entity_id=employee.id,
        summary=f"Updated employee {employee.user.email}",
    )
    return Response(serialize_employee(employee))
