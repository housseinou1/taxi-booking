"""Phase 8 — CEO approvals inbox, account management and CEO audit trail.

CEO-only surface (``IsCeoStaff`` = CEO / Super Admin groups) designed for remote
control of Yala Technologies operations from outside Mauritania:

- ``GET  /operations/ceo/approvals/``      read-only inbox of items awaiting CEO
                                           authority (refunds, high-value
                                           withdrawals, account onboarding).
- ``GET  /operations/ceo/accounts/``       read-only, searchable account directory
                                           across drivers, riders, couriers,
                                           employees and staff.
- ``POST /operations/ceo/accounts/<id>/action/``  suspend / reactivate / block an
                                           account. Reason is mandatory and the
                                           action is written to the platform audit
                                           trail with the target's domain entity.
- ``GET  /operations/ceo/audit/``          read-only CEO audit trail (own actions
                                           or all high-authority actions).

BOUNDARIES (deliberate and enforced):
- **No financial mutation.** Nothing here approves, rejects or pays a payout,
  refund or withdrawal; no wallet balance is read-modify-written. Financial
  approvals remain in the (frozen) finance endpoints and are shown read-only.
- **No staff/self target.** The CEO cannot suspend/block itself or any
  staff/superuser account, so remote action can never lock the platform owner out
  or create a privilege vacuum.
- **Complete audit trail.** Every action records actor, target, previous and new
  state, reason and client IP via ``security.services.audit_service``.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from security.models import AuditLog
from security.services.audit_service import log_from_request

from .executive_permissions import IsCeoStaff
from .fleet_metrics import fleet_metrics

User = get_user_model()

# The finance role ceiling from admin_permissions_service.APPROVAL_LIMITS_BY_ROLE:
# anything above it requires CEO authority, which is what this inbox surfaces.
FINANCE_WITHDRAWAL_CEILING = Decimal("100000")
FINANCE_REFUND_CEILING = Decimal("50000")

ACCOUNT_ACTIONS = {"approve", "suspend", "deactivate", "reactivate", "block"}

# Professional lifecycle actions exposed in the CEO Command Center. `block` is kept
# as a legacy alias of `deactivate` so older clients keep working.
LIFECYCLE_ACTIONS = ("approve", "suspend", "deactivate", "reactivate")

CEO_ACCOUNT_ORDERINGS = {
    "newest": "-date_joined",
    "oldest": "date_joined",
    "last_login": "-last_login",
    "email": "email",
}


class CeoControlPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": page_size,
                "total_pages": self.page.paginator.num_pages,
                "results": data,
            }
        )


def _money(value) -> str:
    return str(value if value is not None else Decimal("0"))


def _safe_parse_date(raw):
    """parse_date that never raises (out-of-range dates would otherwise 500)."""
    from django.utils.dateparse import parse_date

    try:
        return parse_date(raw)
    except (ValueError, TypeError):
        return None


def _city_name(user) -> str:
    city = getattr(user, "city", None)
    return city.name if city else ""


def _courier_user_ids():
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.values_list("driver_id", flat=True)


def _employees_relation_ready() -> bool:
    """True when the employees table exists and is queryable.

    A single unapplied migration in the unrelated ``employees`` app must never blank the
    whole CEO directory (every KPI card and every row shares one request). When the
    relation is missing, the employee filter degrades to an empty result and the response
    carries a warning instead of raising ``OperationalError``.

    NOTE: this probes that the query *succeeds*, not whether rows exist. Returning
    ``.exists()`` directly was a bug: a freshly migrated (empty) employees table reports
    ``exists() == False``, which made the console claim "employees unavailable" forever
    even though the table was perfectly usable.
    """
    try:
        from django.db import transaction

        from employees.models import StaffEmployee

        with transaction.atomic():
            StaffEmployee.objects.exists()
        return True
    except Exception:  # pragma: no cover - defensive, surfaced as a warning
        return False


def _is_performance_review(profile) -> bool:
    """True when ``account_under_review`` means a *performance risk review*.

    ``DriverProfile.account_under_review`` is the pre-existing performance-risk flag:
    ``drivers.services.ride_performance_service`` sets it together with
    ``account_risk_flag`` / ``account_risk_reason`` when acceptance or cancellation
    performance degrades, and ``drivers.views_performance`` lists exactly those rows as
    the risk-review queue.

    A previous implementation reused the same flag as the *suspension* marker, which
    conflates the two meanings. Until a dedicated suspension state is added (design:
    ``.agents/tasks/driver-suspension-state-design.md``), a flagged profile that also
    carries risk-review data is treated as a performance review, **not** as a CEO
    suspension, so the console never reports a false suspension and reactivation never
    wipes a genuine risk flag.
    """
    if profile is None:
        return False
    if getattr(profile, "account_risk_flag", False):
        return True
    return bool((getattr(profile, "account_risk_reason", "") or "").strip())


def _domain_status(user) -> dict:
    """Domain-specific account state (driver / rider / courier / employee)."""
    profile = getattr(user, "driver_profile", None)
    if profile is not None:
        from deliveries.models import DriverDeliverySettings

        settings = DriverDeliverySettings.objects.filter(driver_id=user.id).first()
        is_courier = settings is not None
        return {
            "domain": "courier" if is_courier else "driver",
            "driver_status": profile.status,
            "courier_suspended": bool(settings and settings.is_suspended),
            "courier_online": bool(
                settings
                and settings.delivery_mode_enabled
                and user.is_active
                and profile.status == "approved"
                and not settings.is_suspended
            ),
        }

    merchant = getattr(user, "merchant_profile", None)
    if merchant is not None:
        return {"domain": "merchant", "merchant_status": merchant.status}

    # The reverse OneToOne lookups below touch their own tables. A partially migrated
    # database must not blank the whole CEO directory, so a broken relation degrades
    # to "no employee record" instead of raising.
    try:
        employee = getattr(user, "staff_employee", None)
    except Exception:
        employee = None
    if employee is not None:
        return {"domain": "employee", "employment_status": employee.employment_status}

    if user.is_staff or user.is_superuser:
        return {"domain": "staff", "is_staff": True}

    return {"domain": "rider", "rider_status": getattr(user, "rider_status", "")}


def _domain_profile(user):
    """The driver/courier profile for a user, if any (couriers share this model)."""
    return getattr(user, "driver_profile", None)


def _delivery_settings(user):
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.filter(driver_id=user.id).first()


def _lifecycle_state(user) -> dict:
    """Operational state used by the CEO Command Center action bar.

    Distinguishes *suspended* (cannot take work, keeps app access) from
    *deactivated* (cannot sign in at all) so the CEO can act with the precision of a
    modern ride-hailing operations console.
    """
    domain = _domain_status(user)["domain"]
    profile = _domain_profile(user)
    settings = _delivery_settings(user) if profile is not None else None

    operational = domain in {"driver", "courier"}
    approved = bool(profile and profile.status == "approved") if operational else True
    delivery_suspended = bool(settings and settings.is_suspended)
    driver_under_review = bool(profile and getattr(profile, "account_under_review", False))
    performance_review = operational and _is_performance_review(profile)
    # Explicit administrative suspension, now carried by its own field (B7). This is
    # independent of the performance review flag and of application approval.
    suspension_active = bool(profile and getattr(profile, "suspension_active", False))
    # Rows suspended before the dedicated field existed only carry the review flag; they
    # are still reported as suspended so no historical suspension disappears from view.
    legacy_suspension = bool(driver_under_review and not performance_review)
    driver_suspended = suspension_active or legacy_suspension
    availability = bool(profile.is_available) if profile is not None else None

    return {
        "domain": domain,
        "is_active": user.is_active,
        # Suspension is a persisted state, so a suspended partner is never confused
        # with one who is simply offline.
        "is_suspended": delivery_suspended or driver_suspended,
        "driver_suspended": driver_suspended,
        "delivery_suspended": delivery_suspended,
        # Which mechanism is holding the account back: an explicit suspension
        # (delivery or driver) or an automated performance risk review. Reported so
        # the console can label it honestly instead of showing every flag as a
        # suspension.
        "suspension_kind": (
            "delivery"
            if delivery_suspended
            else "driver"
            if driver_suspended
            else "performance_review"
            if performance_review and driver_under_review
            else None
        ),
        "performance_review": bool(performance_review and driver_under_review),
        "delivery_mode_enabled": bool(settings.delivery_mode_enabled) if settings else None,
        "availability": availability,
        "profile_status": profile.status if profile else "",
        "approved": approved,
        "operational": operational,
        "status_label": (
            "deactivated"
            if not user.is_active
            else "suspended"
            if (delivery_suspended or driver_suspended)
            else "under_review"
            if (performance_review and driver_under_review)
            else "online"
            if availability
            else "offline"
            if operational
            # Non-operational accounts (riders, merchants, employees, staff) have no
            # availability flag: calling them "offline" was misleading, so they report
            # their access state instead.
            else "active"
        ),
    }


def _lifecycle_capabilities(user) -> dict:
    """Which lifecycle actions the CEO may take on this account right now."""
    protected = bool(user.is_staff or user.is_superuser)
    state = _lifecycle_state(user)
    domain = state["domain"]
    approvable = domain in {"driver", "courier", "rider"}

    return {
        "approve": bool(
            not protected and approvable and (not state["approved"] or not user.is_active)
        ),
        "suspend": bool(
            not protected
            and user.is_active
            and not (state["operational"] and state["is_suspended"])
        ),
        "deactivate": bool(not protected and user.is_active),
        "reactivate": bool(
            not protected and (not user.is_active or (state["operational"] and state["is_suspended"]))
        ),
    }


def _lifecycle_apply(target, action: str, reason: str, actor=None):
    """Apply one lifecycle action. Returns ``(error, summary, details)``.

    Domain-aware effects (no schema change, fully reversible, no financial data
    touched):

    * **driver / courier** — ``approve`` requires the agreement signature and, for
      couriers, the vehicle-type document requirements (the same canonical gate as
      the approval screens); ``suspend`` stops availability/delivery mode while the
      account keeps app access; ``deactivate`` removes sign-in; ``reactivate``
      restores access, availability and delivery mode.
    * **rider** — ``approve`` activates the account; ``suspend``/``deactivate``
      deactivate it (a rider has no availability flag); ``reactivate`` restores it.
    """
    domain = _domain_status(target)["domain"]
    profile = _domain_profile(target)
    settings = _delivery_settings(target) if profile is not None else None
    state = _lifecycle_state(target)
    operational = domain in {"driver", "courier"}

    if action == "approve":
        if domain not in {"driver", "courier", "rider"}:
            return (
                {"error": "Only driver, courier and rider accounts can be approved here."},
                None,
                None,
            )
        if operational and state["approved"] and target.is_active:
            return ({"error": "Account is already approved and active."}, None, None)

        if operational:
            from legal.services import courier_has_complete_signature

            if domain == "courier":
                from deliveries.courier_onboarding import get_courier_approval_blockers

                blockers = get_courier_approval_blockers(profile)
                if blockers["blocked"]:
                    return (
                        {
                            "error": "Courier requirements are incomplete. Cannot approve.",
                            "reasons": blockers["reasons"],
                            "vehicle_type": blockers["vehicle_type"],
                            "missing_document_types": blockers["missing_document_types"],
                            "expired_document_types": blockers["expired_document_types"],
                            "signature_complete": blockers["signature_complete"],
                        },
                        None,
                        None,
                    )
            elif not courier_has_complete_signature(profile):
                return (
                    {"error": "Agreement signature is incomplete. Cannot approve."},
                    None,
                    None,
                )

            from taxi.drivers.driver_code import ensure_driver_code

            profile.status = "approved"
            profile.application_rejection_reason = ""
            try:
                ensure_driver_code(profile)
            except ValueError as exc:
                return ({"error": str(exc)}, None, None)
            profile.is_available = False
            profile.save(
                update_fields=[
                    "status",
                    "application_rejection_reason",
                    "driver_code",
                    "is_available",
                ]
            )

            if settings is not None:
                settings.is_suspended = False
                settings.suspension_reason = ""
                settings.delivery_mode_enabled = True
                settings.save(
                    update_fields=[
                        "is_suspended",
                        "suspension_reason",
                        "delivery_mode_enabled",
                    ]
                )

        target.is_active = True
        target.save(update_fields=["is_active"])
        return (
            None,
            f"CEO approved {'courier' if domain == 'courier' else domain}: {target.email}",
            {"action": "approve", "previous": state, "reason": reason},
        )

    if action in {"suspend", "deactivate", "block"}:
        if not target.is_active and not (operational and state["is_suspended"]):
            return ({"error": "Account is already inactive.", "is_active": False}, None, None)

        deactivating = action in {"deactivate", "block"}

        if operational:
            if profile is not None:
                profile.is_available = False
                # Dedicated suspension state (B7): blocks new ride/delivery work while the
                # partner keeps app access. The performance review flag is deliberately NOT
                # touched — it belongs to the performance module and must survive a
                # suspension (and a suspension must not look like a quality review).
                profile.suspension_active = True
                profile.suspension_reason = reason
                profile.suspension_started_at = timezone.now()
                profile.suspended_by = actor
                profile.save(
                    update_fields=[
                        "is_available",
                        "suspension_active",
                        "suspension_reason",
                        "suspension_started_at",
                        "suspended_by",
                    ]
                )
            if settings is not None:
                settings.is_suspended = True
                settings.suspension_reason = reason
                settings.delivery_mode_enabled = False
                settings.save(
                    update_fields=[
                        "is_suspended",
                        "suspension_reason",
                        "delivery_mode_enabled",
                    ]
                )

        if deactivating or not operational:
            # Riders have no availability flag: a rider suspension stops the account.
            target.is_active = False
            target.save(update_fields=["is_active"])

        verb = "deactivated" if deactivating else "suspended"
        return (
            None,
            f"CEO {verb} {domain}: {target.email}",
            {
                "action": action,
                "previous": state,
                "reason": reason,
                "delivery_suspended": bool(settings and settings.is_suspended),
                "is_active": target.is_active,
            },
        )

    # reactivate
    if target.is_active and not (operational and state["is_suspended"]):
        return ({"error": "Account is already active.", "is_active": True}, None, None)

    if profile is not None:
        # Clear only the administrative suspension (B7). The performance review flag is
        # never touched here — it is owned by the performance module — and availability is
        # NOT restored automatically: the partner chooses to go online again.
        profile.suspension_active = False
        profile.suspension_reason = ""
        profile.suspension_started_at = None
        profile.suspended_by = None
        profile.save(
            update_fields=[
                "suspension_active",
                "suspension_reason",
                "suspension_started_at",
                "suspended_by",
            ]
        )

    if operational and settings is not None:
        settings.is_suspended = False
        settings.suspension_reason = ""
        settings.delivery_mode_enabled = bool(profile and profile.status == "approved")
        settings.save(
            update_fields=["is_suspended", "suspension_reason", "delivery_mode_enabled"]
        )

    target.is_active = True
    target.save(update_fields=["is_active"])
    return (
        None,
        f"CEO reactivated {domain}: {target.email}",
        {
            "action": "reactivate",
            "previous": state,
            "reason": reason,
            "delivery_mode_enabled": bool(settings and settings.delivery_mode_enabled),
        },
    )


def _safe_count(queryset):
    """Count without letting one missing table break the whole directory.

    A partially migrated local database (or any single broken relation) must degrade
    that one figure to ``None`` rather than failing the entire CEO directory and
    blanking every KPI card in the console.
    """
    try:
        from django.db import transaction

        with transaction.atomic():
            return queryset.count()
    except Exception:  # pragma: no cover - defensive, reported as null
        return None


def _directory_warnings() -> list[str]:
    """Human-readable degradation notes for the CEO directory response."""
    warnings: list[str] = []
    if not _employees_relation_ready():
        warnings.append(
            "Employee records are unavailable on this database: the employees app "
            "migration is not applied. Employee counts and the Employees filter are "
            "reported as unavailable."
        )
    return warnings


def _audit_entity_for(user) -> tuple[str, str]:
    """Pick the audit entity type so the action lands in the right trail."""
    domain = _domain_status(user)["domain"]
    if domain == "driver":
        profile = getattr(user, "driver_profile", None)
        return "driver", str(profile.id if profile else user.id)
    if domain == "courier":
        profile = getattr(user, "driver_profile", None)
        return "courier", str(user.id if profile else user.id)
    if domain == "merchant":
        return "merchant", str(user.id)
    if domain == "employee":
        try:
            employee = getattr(user, "staff_employee", None)
        except Exception:  # pragma: no cover - defensive, partially migrated DB
            employee = None
        return "employee", employee.employee_number if employee else str(user.id)
    if domain == "rider":
        return "customer", str(user.id)
    return "system", f"user:{user.id}"


# ─── CEO approvals inbox (read-only) ─────────────────────────────────────────


def _serialize_refund(refund) -> dict:
    return {
        "type": "refund",
        "id": refund.id,
        "title": f"Refund #{refund.id}",
        "amount": _money(getattr(refund, "amount", None)),
        "status": refund.status,
        "requester_email": refund.customer.email if refund.customer else "",
        "city": _city_name(refund.customer) if refund.customer else "",
        "created_at": refund.created_at,
        "deep_link": "/admin/finance-ops",
        "authority": "ceo",
        "reason": "Amount exceeds the finance role ceiling or is awaiting CEO approval.",
    }


def _serialize_withdrawal(withdrawal) -> dict:
    return {
        "type": "withdrawal",
        "id": withdrawal.id,
        "title": f"Withdrawal #{withdrawal.id}",
        "amount": _money(withdrawal.amount),
        "status": withdrawal.status,
        "requester_email": withdrawal.driver.email if withdrawal.driver else "",
        "city": _city_name(withdrawal.driver) if withdrawal.driver else "",
        "created_at": withdrawal.created_at,
        "deep_link": "/admin/withdrawals",
        "authority": "ceo",
        "reason": "Amount exceeds the finance role ceiling (CEO authority required).",
    }


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_approvals_inbox(request):
    """Read-only inbox of everything awaiting CEO authority.

    Groups: refunds (requested / awaiting CEO), withdrawals above the finance
    ceiling, and pending account onboarding (drivers, couriers, riders,
    merchants). Nothing here performs an approval — the CEO acts in the owning
    module so each domain keeps its own guards and audit trail.

    Query params: city (name), limit (per group, default 20, max 50).
    """
    from merchants.models import Merchant
    from payments.models import RefundRequest, WithdrawalRequest
    from taxi.drivers.models import DriverProfile

    city = (request.query_params.get("city") or "").strip()
    try:
        limit = min(int(request.query_params.get("limit", 20)), 50)
    except (TypeError, ValueError):
        limit = 20

    refunds = RefundRequest.objects.select_related("customer").filter(
        Q(status="awaiting_ceo")
        | Q(status="requested", amount__gt=FINANCE_REFUND_CEILING)
    )
    withdrawals = WithdrawalRequest.objects.select_related("driver").filter(
        status__in=["pending", "approved"], amount__gt=FINANCE_WITHDRAWAL_CEILING
    )
    pending_drivers = DriverProfile.objects.select_related("user", "user__city").filter(
        status__in=["pending", "pending_review"]
    )
    pending_couriers = pending_drivers.filter(user_id__in=_courier_user_ids())
    pending_riders = User.objects.select_related("city").filter(
        user_type="rider", rider_status="pending"
    )
    pending_merchants = Merchant.objects.select_related("owner").filter(status="pending")

    if city:
        refunds = refunds.filter(customer__city__name__iexact=city)
        withdrawals = withdrawals.filter(driver__city__name__iexact=city)
        pending_drivers = pending_drivers.filter(user__city__name__iexact=city)
        pending_couriers = pending_couriers.filter(user__city__name__iexact=city)
        pending_riders = pending_riders.filter(city__name__iexact=city)
        pending_merchants = pending_merchants.filter(city__iexact=city)

    def onboarding_rows(queryset, kind, title_prefix, deep_link):
        rows = []
        for profile in queryset[:limit]:
            # Drivers/couriers/merchants are profiles with a `user`/`owner`;
            # riders are Users themselves.
            user = getattr(profile, "user", None) or getattr(profile, "owner", None)
            if user is None and isinstance(profile, User):
                user = profile

            city_value = _city_name(user) if user else ""
            if not city_value:
                raw_city = getattr(profile, "city", "")
                city_value = raw_city if isinstance(raw_city, str) else ""

            display_name = ""
            if user is not None:
                display_name = user.get_full_name() or user.email

            rows.append(
                {
                    "type": kind,
                    "id": profile.id,
                    "title": f"{title_prefix}: {display_name or profile}",
                    "amount": None,
                    "status": getattr(profile, "status", "")
                    or getattr(profile, "rider_status", ""),
                    "requester_email": user.email if user else "",
                    "city": city_value,
                    "created_at": getattr(profile, "created_at", None)
                    or getattr(profile, "date_joined", None),
                    "deep_link": deep_link,
                    "authority": "ceo",
                    "reason": "Pending account onboarding.",
                }
            )
        return rows

    refund_rows = [_serialize_refund(row) for row in refunds[:limit]]
    withdrawal_rows = [_serialize_withdrawal(row) for row in withdrawals[:limit]]
    driver_rows = onboarding_rows(pending_drivers, "driver", "Driver onboarding", "/admin/drivers")
    courier_rows = onboarding_rows(pending_couriers, "courier", "Courier onboarding", "/admin/delivery/couriers")
    rider_rows = onboarding_rows(pending_riders, "rider", "Rider onboarding", "/admin/riders")
    merchant_rows = onboarding_rows(pending_merchants, "merchant", "Merchant onboarding", "/admin/merchants")

    groups = {
        "refunds": {"count": refunds.count(), "items": refund_rows},
        "withdrawals": {"count": withdrawals.count(), "items": withdrawal_rows},
        "drivers": {"count": pending_drivers.count(), "items": driver_rows},
        "couriers": {"count": pending_couriers.count(), "items": courier_rows},
        "riders": {"count": pending_riders.count(), "items": rider_rows},
        "merchants": {"count": pending_merchants.count(), "items": merchant_rows},
    }

    return Response(
        {
            "generated_at": timezone.now(),
            "city_filter": city or "all",
            "total_pending": sum(group["count"] for group in groups.values()),
            "groups": groups,
            "financial_approvals_frozen": True,
            "financial_approvals_note": (
                "Refunds and withdrawals are listed read-only. Their state transitions "
                "remain frozen in this build; approve them in the owning finance module "
                "once the freeze is lifted."
            ),
        }
    )



# ─── Account directory (read-only) ───────────────────────────────────────────


def _serialize_account(user) -> dict:
    domain = _domain_status(user)
    return {
        "id": user.id,
        "email": user.email,
        "name": user.get_full_name() or user.email,
        "phone_number": getattr(user, "phone_number", "") or "",
        "user_type": getattr(user, "user_type", "") or "",
        "is_active": user.is_active,
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "city_name": _city_name(user),
        "date_joined": user.date_joined,
        "last_login": user.last_login,
        "domain": domain["domain"],
        "domain_status": domain,
        # Lifecycle state + available CEO actions (drives the Command Center action
        # bar): approve / suspend / deactivate / reactivate.
        "lifecycle": _lifecycle_state(user),
        "capabilities": _lifecycle_capabilities(user),
        # A staff/superuser target is never actionable from this module.
        "actionable": not (user.is_staff or user.is_superuser),
    }


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_accounts_directory(request):
    """Read-only, searchable account directory for remote CEO oversight.

    Query params: search, domain (driver|courier|rider|merchant|employee|staff),
    status (active|inactive), city, ordering, page, page_size.
    """
    queryset = User.objects.select_related("city").all()

    search = (request.query_params.get("search") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone_number__icontains=search)
        )

    status_filter = (request.query_params.get("status") or "").strip().lower()
    if status_filter == "active":
        queryset = queryset.filter(is_active=True)
    elif status_filter == "inactive":
        queryset = queryset.filter(is_active=False)

    city = (request.query_params.get("city") or "").strip()
    if city:
        queryset = queryset.filter(city__name__iexact=city)

    domain = (request.query_params.get("domain") or "").strip().lower()
    if domain == "courier":
        queryset = queryset.filter(id__in=_courier_user_ids())
    elif domain == "driver":
        queryset = queryset.filter(driver_profile__isnull=False).exclude(
            id__in=_courier_user_ids()
        )
    elif domain == "rider":
        queryset = queryset.filter(
            user_type="rider", driver_profile__isnull=True, merchant_profile__isnull=True
        )
    elif domain == "merchant":
        queryset = queryset.filter(merchant_profile__isnull=False)
    elif domain == "employee":
        # Degrade to an empty result when the employees table is missing rather than
        # failing the entire directory (see _employees_relation_ready).
        if _employees_relation_ready():
            queryset = queryset.filter(staff_employee__isnull=False)
        else:
            queryset = queryset.none()
    elif domain == "staff":
        queryset = queryset.filter(is_staff=True)

    ordering = (request.query_params.get("ordering") or "newest").strip()
    queryset = queryset.order_by(CEO_ACCOUNT_ORDERINGS.get(ordering, "-date_joined"))

    paginator = CeoControlPagination()
    page = paginator.paginate_queryset(queryset, request)
    response = paginator.get_paginated_response([_serialize_account(user) for user in page])

    agg = User.objects.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        inactive=Count("id", filter=Q(is_active=False)),
        riders=Count("id", filter=Q(user_type="rider")),
    )
    response.data["summary"] = {
        "total": agg["total"] or 0,
        "active": agg["active"] or 0,
        "inactive": agg["inactive"] or 0,
        "riders": agg["riders"] or 0,
        "drivers": _safe_count(
            User.objects.filter(driver_profile__isnull=False).exclude(
                id__in=_courier_user_ids()
            )
        ),
        "couriers": _safe_count(User.objects.filter(id__in=_courier_user_ids())),
        "merchants": _safe_count(User.objects.filter(merchant_profile__isnull=False)),
        "employees": (
            _safe_count(User.objects.filter(staff_employee__isnull=False))
            if _employees_relation_ready()
            else None
        ),
    }
    # Canonical fleet figures (single documented source of truth). Couriers are
    # DriverProfile rows too, so an unqualified "drivers" count mixes the ride and
    # delivery fleets — see operations/fleet_metrics.py for the exact definitions.
    response.data["fleet"] = fleet_metrics()
    response.data["warnings"] = _directory_warnings()
    return response



# ─── Account actions (audited, non-financial) ────────────────────────────────


@api_view(["POST"])
@permission_classes([IsCeoStaff])
def ceo_account_action(request, user_id):
    """Approve / suspend / deactivate / reactivate an account from the CEO Command
    Center. Reason mandatory; fully audited.

    Professional, domain-aware lifecycle (Uber/Lyft-style):

    - **approve** — drivers and couriers are approved (agreement signature required;
      couriers additionally require the vehicle-type document requirements), riders
      are activated.
    - **suspend** — stops taking work (availability off, delivery mode off) while the
      account keeps app access; for riders, who have no availability flag, the
      account is deactivated.
    - **deactivate** — removes sign-in entirely (``is_active=False``) and stops work.
      ``block`` is kept as a legacy alias.
    - **reactivate** — restores access, availability and delivery mode.

    Deliberately narrow so remote action can never damage the platform:

    - **No financial effect.** No wallet, payout, withdrawal, refund or ledger row
      is touched.
    - **No staff/self target.** Staff, superusers and the acting CEO itself are
      rejected, so the owner can never lock themselves (or their team) out.
    - **Reversible.** Nothing is deleted.
    - **Audited** with actor, target, previous/new state, reason and client IP,
      filed under the target's domain entity type (driver / courier / customer /
      merchant / employee) so it also appears in that domain's audit trail.
    """
    actor = request.user
    target = get_object_or_404(User, pk=user_id)
    action = (request.data.get("action") or "").strip().lower()
    reason = (request.data.get("reason") or "").strip()

    if action not in ACCOUNT_ACTIONS:
        return Response(
            {"error": "Invalid action.", "valid_actions": sorted(ACCOUNT_ACTIONS)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(reason) < 5:
        return Response(
            {"error": "A reason is required (min 5 characters)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if target.pk == actor.pk:
        return Response(
            {"error": "You cannot change your own account state."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if target.is_staff or target.is_superuser:
        return Response(
            {"error": "Staff and superuser accounts cannot be changed here."},
            status=status.HTTP_403_FORBIDDEN,
        )

    previous_state = target.is_active

    # Professional domain-aware lifecycle (approve / suspend / deactivate /
    # reactivate). All guards live in the helper so every caller enforces the same
    # rules, and no financial record is ever touched.
    error, summary, details = _lifecycle_apply(target, action, reason, actor=request.user)
    if error is not None:
        return Response(error, status=status.HTTP_400_BAD_REQUEST)

    target.refresh_from_db()

    entity_type, entity_id = _audit_entity_for(target)
    log_from_request(
        request,
        action="suspend" if action in {"suspend", "deactivate", "block"} else "reactivate",
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary,
        details={
            "operation": action,
            "reason": reason,
            "target_email": target.email,
            "target_user_id": target.id,
            "previous_state": "active" if previous_state else "inactive",
            "new_state": "active" if target.is_active else "inactive",
            "domain": _domain_status(target)["domain"],
            "lifecycle": details or {},
            "source": "ceo_control",
        },
    )

    return Response(
        {
            "message": summary,
            "user_id": target.id,
            "action": action,
            "is_active": target.is_active,
            "previous_state": "active" if previous_state else "inactive",
            "domain": _domain_status(target)["domain"],
            "lifecycle": _lifecycle_state(target),
            "capabilities": _lifecycle_capabilities(target),
        }
    )



# ─── CEO audit trail (read-only) ─────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsCeoStaff])
def ceo_audit_trail(request):
    """Read-only audit trail for remote accountability.

    ``scope=me`` (default) returns the CEO's own administrative actions — the
    evidence trail for actions taken remotely. ``scope=all`` returns every
    high-authority action (status changes, refunds, suspensions) with the actor
    identified, so the owner can audit the whole operation from abroad.

    Query params: scope (me|all), action, entity_type, date_from, date_to,
    limit (default 50, max 200).
    """
    from django.utils.dateparse import parse_date

    scope = (request.query_params.get("scope") or "me").strip().lower()
    logs = AuditLog.objects.select_related("actor").order_by("-created_at")

    if scope == "me":
        logs = logs.filter(actor=request.user)
    else:
        logs = logs.filter(
            action__in=[
                "status_change",
                "refund",
                "suspend",
                "reactivate",
                "approve",
                "reject",
            ]
        )

    action = (request.query_params.get("action") or "").strip()
    if action:
        logs = logs.filter(action=action)

    entity_type = (request.query_params.get("entity_type") or "").strip()
    if entity_type:
        logs = logs.filter(entity_type=entity_type)

    date_from_raw = request.query_params.get("date_from")
    if date_from_raw:
        date_from = _safe_parse_date(date_from_raw)
        if date_from is None:
            return Response(
                {"detail": "Invalid date_from; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logs = logs.filter(created_at__date__gte=date_from)

    date_to_raw = request.query_params.get("date_to")
    if date_to_raw:
        date_to = _safe_parse_date(date_to_raw)
        if date_to is None:
            return Response(
                {"detail": "Invalid date_to; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logs = logs.filter(created_at__date__lte=date_to)

    try:
        limit = min(int(request.query_params.get("limit", 50)), 200)
    except (TypeError, ValueError):
        limit = 50

    results = [
        {
            "id": entry.id,
            "action": entry.action,
            "entity_type": entry.entity_type,
            "entity_id": entry.entity_id,
            "summary": entry.summary,
            "operation": (entry.details or {}).get("operation", ""),
            "reason": (entry.details or {}).get("reason", ""),
            "actor_email": entry.actor.email if entry.actor else "",
            # IP is only exposed for the CEO's own actions (their own audit trail).
            "ip_address": entry.ip_address if scope == "me" else None,
            "created_at": entry.created_at,
        }
        for entry in logs[:limit]
    ]

    return Response({"scope": scope, "count": logs.count(), "results": results})

