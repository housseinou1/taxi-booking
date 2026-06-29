"""Courier onboarding readiness checks for Yala Delivery."""

from __future__ import annotations

from django.utils import timezone

from payments.models import DriverPayoutMethod
from taxi.drivers.models import DriverDocument, DriverProfile

from .models import DriverDeliverySettings
from .vehicle_types import normalize_delivery_vehicle_type

BICYCLE_COURIER_VEHICLE_TYPES = ("bicycle",)
MOTOR_VEHICLE_COURIER_TYPES = ("motorcycle", "car")

BICYCLE_COURIER_DOCUMENT_TYPES = [
    "national_id",
]

MOTORCYCLE_COURIER_DOCUMENT_TYPES = [
    "national_id",
    "license",
    "carte_grise",
    "insurance",
]

CAR_COURIER_DOCUMENT_TYPES = [
    "national_id",
    "license",
    "carte_grise",
    "insurance",
]

# Legacy alias — motor vehicles use motorcycle or car lists
VEHICLE_COURIER_DOCUMENT_TYPES = MOTORCYCLE_COURIER_DOCUMENT_TYPES

COURIER_STEP_DEFINITIONS = [
    ("account", "Create courier account", "Sign up as a courier with your personal details."),
    ("courier_type", "Choose courier type", "Select bicycle, motorcycle, or vehicle/car for deliveries."),
    ("profile", "Personal information", "Add your full name, phone number, city, and profile photo."),
    ("vehicle", "Vehicle information", "Add motorcycle or vehicle details when required."),
    ("documents", "Upload documents", "Submit the documents required for your courier type."),
    ("approval", "Submit for admin approval", "Send your application for review before you can go online."),
    ("phone", "Verify phone number", "Confirm your phone number so customers and support can reach you."),
    ("payout", "Withdrawal account", "Add a bank or wallet account to receive delivery earnings."),
]

PROFILE_SETUP_PATH = "/delivery/profile-setup"


def get_required_courier_document_types(delivery_vehicle_type: str) -> list[str]:
    vehicle_type = normalize_delivery_vehicle_type(delivery_vehicle_type)
    if vehicle_type in BICYCLE_COURIER_VEHICLE_TYPES:
        return list(BICYCLE_COURIER_DOCUMENT_TYPES)
    if vehicle_type == "motorcycle":
        return list(MOTORCYCLE_COURIER_DOCUMENT_TYPES)
    return list(CAR_COURIER_DOCUMENT_TYPES)


def is_bicycle_courier(delivery_vehicle_type: str) -> bool:
    return normalize_delivery_vehicle_type(delivery_vehicle_type) in BICYCLE_COURIER_VEHICLE_TYPES


def is_motor_vehicle_courier(delivery_vehicle_type: str) -> bool:
    return normalize_delivery_vehicle_type(delivery_vehicle_type) in MOTOR_VEHICLE_COURIER_TYPES


def is_light_courier_vehicle(delivery_vehicle_type: str) -> bool:
    """Bicycle couriers have the lightest document requirements."""
    return is_bicycle_courier(delivery_vehicle_type)


def _profile_fields_complete(user, delivery_vehicle_type: str = "") -> bool:
    base_complete = bool(
        (user.first_name or "").strip()
        and (user.last_name or "").strip()
        and (user.phone_number or "").strip()
        and user.city_id
    )
    if not base_complete:
        return False
    if is_bicycle_courier(delivery_vehicle_type):
        return bool(getattr(user, "profile_picture", None))
    return True


def _is_placeholder_vehicle(profile: DriverProfile) -> bool:
    make = (profile.vehicle_make or "").strip().upper()
    model = (profile.vehicle_model or "").strip().upper()
    return make == "TEMP" or model == "TEMP"


def _vehicle_info_complete(profile: DriverProfile | None, delivery_vehicle_type: str) -> bool:
    if not profile:
        return False

    vehicle_type = normalize_delivery_vehicle_type(delivery_vehicle_type)
    if vehicle_type in BICYCLE_COURIER_VEHICLE_TYPES:
        return True

    if _is_placeholder_vehicle(profile):
        return False

    make = (profile.vehicle_make or "").strip()
    model = (profile.vehicle_model or "").strip()
    color = (profile.vehicle_color or "").strip()
    if not make or not model or not color:
        return False

    plate = (profile.plate_number or profile.vehicle_plate or "").strip()
    return bool(plate)


def _courier_type_selected(settings: DriverDeliverySettings | None) -> bool:
    return bool(settings and settings.delivery_vehicle_type)


def _application_submitted(profile: DriverProfile | None) -> bool:
    if not profile:
        return False
    if profile.status == "approved":
        return True
    return bool(profile.terms_accepted and profile.status == "pending_review")


def get_courier_documents_review_state(
    profile: DriverProfile, delivery_vehicle_type: str
) -> dict:
    return _courier_documents_complete(profile, delivery_vehicle_type)


def _courier_documents_complete(profile: DriverProfile, delivery_vehicle_type: str) -> dict:
    required_types = set(get_required_courier_document_types(delivery_vehicle_type))
    today = timezone.now().date()
    uploaded = {
        document.document_type: document
        for document in DriverDocument.objects.filter(driver=profile)
    }

    missing_types: list[str] = []
    expired_types: list[str] = []

    for doc_type in required_types:
        document = uploaded.get(doc_type)
        if not document or document.status == "rejected":
            missing_types.append(doc_type)
            continue
        if document.expires_at and document.expires_at < today:
            expired_types.append(doc_type)

    if "national_id" in required_types:
        has_national_id = bool(profile.user.national_id_document) or "national_id" in uploaded
        if not has_national_id and "national_id" not in missing_types:
            missing_types.append("national_id")

    all_uploaded = len(missing_types) == 0 and len(expired_types) == 0
    under_review = all_uploaded and profile.status in {"pending", "pending_review"}

    return {
        "all_required_documents_uploaded": all_uploaded,
        "documents_under_review": under_review,
        "missing_document_types": missing_types,
        "expired_document_types": expired_types,
    }


def _has_payout_method(user) -> bool:
    return DriverPayoutMethod.objects.filter(driver=user).exists()


def _build_step(step_id, title, description, complete, action_path="", status="pending"):
    return {
        "id": step_id,
        "title": title,
        "description": description,
        "complete": complete,
        "status": "complete" if complete else status,
        "action_path": action_path,
    }


def _build_wizard_steps(steps, bicycle_courier: bool) -> list[dict]:
    """Return only the 5 wizard-relevant steps with visibility flag.

    Maps the 8-step onboarding list to the 5-step profile setup wizard:
    courier_type, profile, vehicle, documents, approval.
    Bicycle couriers have the vehicle step marked as not visible.
    """
    wizard_step_ids = {"courier_type", "profile", "vehicle", "documents", "approval"}
    wizard_steps = []
    for step in steps:
        if step["id"] not in wizard_step_ids:
            continue
        visible = True
        if step["id"] == "vehicle" and bicycle_courier:
            visible = False
        wizard_steps.append({**step, "visible": visible})
    return wizard_steps


def build_courier_onboarding_state(user, request=None) -> dict:
    """Return courier onboarding progress for the authenticated user."""
    _ = request

    if not user or not getattr(user, "is_authenticated", False):
        steps = [
            _build_step(
                step_id,
                title,
                description,
                complete=False,
                action_path="/register?next=/delivery/courier",
                status="required",
            )
            for step_id, title, description in COURIER_STEP_DEFINITIONS
        ]
        return {
            "ready": False,
            "can_deliver": False,
            "message": "Create a courier account to get started.",
            "delivery_vehicle_type": "",
            "driver_status": "",
            "steps": steps,
        }

    profile = DriverProfile.objects.filter(user=user).first()
    settings = DriverDeliverySettings.objects.filter(driver=user).first()
    delivery_vehicle_type = settings.delivery_vehicle_type if settings else ""

    is_driver_account = getattr(user, "user_type", "") == "driver"
    phone_verified = bool(user.is_phone_verified)
    profile_complete = _profile_fields_complete(user, delivery_vehicle_type)
    vehicle_complete = _vehicle_info_complete(profile, delivery_vehicle_type)
    courier_type_complete = _courier_type_selected(settings)
    if profile and courier_type_complete:
        documents_state = _courier_documents_complete(profile, delivery_vehicle_type)
    else:
        documents_state = {
            "all_required_documents_uploaded": False,
            "documents_under_review": False,
            "missing_document_types": [],
            "expired_document_types": [],
        }
    documents_complete = documents_state["all_required_documents_uploaded"]
    application_submitted = _application_submitted(profile)
    payout_complete = _has_payout_method(user)
    approved = bool(profile and profile.status == "approved")
    is_suspended = bool(settings and settings.is_suspended)
    has_expired_documents = bool(documents_state["expired_document_types"])
    profile_under_review = bool(profile and profile.status == "pending_review")
    courier_status = (
        "suspended"
        if is_suspended
        else (profile.status if profile else "pending")
    )
    bicycle_courier = is_bicycle_courier(delivery_vehicle_type)
    motorcycle_courier = normalize_delivery_vehicle_type(delivery_vehicle_type) == "motorcycle"
    if bicycle_courier:
        documents_description = "Upload your National ID."
    elif motorcycle_courier:
        documents_description = (
            "Upload National ID, driving license, motorcycle registration, and insurance."
        )
    else:
        documents_description = (
            "Upload National ID, driving license, vehicle registration, and insurance."
        )

    steps = [
        _build_step(
            "account",
            COURIER_STEP_DEFINITIONS[0][1],
            COURIER_STEP_DEFINITIONS[0][2],
            is_driver_account,
            "/register?next=/delivery/profile-setup",
            "required" if not is_driver_account else "complete",
        ),
        _build_step(
            "courier_type",
            COURIER_STEP_DEFINITIONS[1][1],
            COURIER_STEP_DEFINITIONS[1][2],
            courier_type_complete,
            PROFILE_SETUP_PATH,
        ),
        _build_step(
            "profile",
            COURIER_STEP_DEFINITIONS[2][1],
            COURIER_STEP_DEFINITIONS[2][2],
            profile_complete,
            PROFILE_SETUP_PATH,
        ),
        _build_step(
            "vehicle",
            COURIER_STEP_DEFINITIONS[3][1],
            COURIER_STEP_DEFINITIONS[3][2],
            vehicle_complete,
            PROFILE_SETUP_PATH,
            "complete" if bicycle_courier and courier_type_complete else "required",
        ),
        _build_step(
            "documents",
            COURIER_STEP_DEFINITIONS[4][1],
            documents_description,
            documents_complete,
            PROFILE_SETUP_PATH,
            "under_review"
            if documents_state["documents_under_review"]
            else "required",
        ),
        _build_step(
            "approval",
            COURIER_STEP_DEFINITIONS[5][1],
            COURIER_STEP_DEFINITIONS[5][2],
            approved,
            PROFILE_SETUP_PATH,
            "under_review"
            if application_submitted and not approved
            else "required",
        ),
        _build_step(
            "phone",
            COURIER_STEP_DEFINITIONS[6][1],
            COURIER_STEP_DEFINITIONS[6][2],
            phone_verified,
            "/delivery/settings",
        ),
        _build_step(
            "payout",
            COURIER_STEP_DEFINITIONS[7][1],
            COURIER_STEP_DEFINITIONS[7][2],
            payout_complete,
            "/delivery/bank",
        ),
    ]

    ready = all(step["complete"] for step in steps) and approved and not is_suspended
    can_deliver = ready
    if is_suspended:
        message = settings.suspension_reason or "Your courier account is suspended."
    elif has_expired_documents:
        message = "Document expired. Please update before going online."
    elif profile and profile.status == "rejected":
        message = (
            profile.application_rejection_reason
            or "Your courier application was rejected. Update your profile and resubmit."
        )
    elif profile_under_review or (application_submitted and not approved):
        message = "Your Yala Delivery profile is under review."
    elif not is_driver_account:
        message = "Create a courier account to continue."
    elif not courier_type_complete:
        message = "Choose how you will deliver: bicycle, motorcycle, or vehicle."
    elif not profile_complete:
        message = "Complete your personal information."
    elif not vehicle_complete:
        message = "Add your motorcycle or vehicle details."
    elif not documents_complete:
        message = documents_description
    elif not application_submitted:
        message = "Submit your courier application for admin approval."
    elif not phone_verified:
        message = "Verify your phone number to continue."
    elif not payout_complete:
        message = "Add a withdrawal account to receive earnings."
    else:
        message = "Your courier profile is complete. You can start delivering."

    return {
        "ready": ready,
        "can_deliver": can_deliver,
        "message": message,
        "courier_status": courier_status,
        "profile_under_review": profile_under_review,
        "has_expired_documents": has_expired_documents,
        "delivery_vehicle_type": delivery_vehicle_type,
        "bicycle_courier": bicycle_courier,
        "motor_vehicle_courier": is_motor_vehicle_courier(delivery_vehicle_type),
        "light_courier_vehicle": bicycle_courier,
        "required_document_types": get_required_courier_document_types(delivery_vehicle_type) if courier_type_complete else [],
        "driver_status": profile.status if profile else "missing",
        "terms_accepted": bool(profile and profile.terms_accepted),
        "documents_under_review": documents_state["documents_under_review"],
        "missing_document_types": documents_state["missing_document_types"],
        "expired_document_types": documents_state["expired_document_types"],
        "is_suspended": is_suspended,
        "suspension_reason": settings.suspension_reason if settings and is_suspended else "",
        "steps": steps,
        "wizard_steps": _build_wizard_steps(steps, bicycle_courier),
    }


def courier_delivery_blocked_message(user) -> str:
    """Return a user-facing error when courier actions are blocked."""
    state = build_courier_onboarding_state(user)
    if state["ready"]:
        return ""
    return state["message"]


def ensure_driver_profile_for_courier(user) -> DriverProfile:
    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "plate_number": "TEMP-PLATE",
            "vehicle_plate": "TEMP-PLATE",
            "vehicle_make": "TEMP",
            "vehicle_model": "TEMP",
            "vehicle_color": "TEMP",
        },
    )
    return profile
