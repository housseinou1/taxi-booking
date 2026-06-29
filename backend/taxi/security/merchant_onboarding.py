"""Merchant verification onboarding checklist."""

from __future__ import annotations

from security.models import MerchantDocumentReview

MERCHANT_STEP_DEFINITIONS = [
    ("account", "Create merchant account", "Register your business on Yala Delivery."),
    ("phone", "Verify phone number", "Confirm your phone for order notifications."),
    ("documents", "Upload documents", "Business license and owner national ID."),
    ("branding", "Store branding", "Upload your store logo and cover photo."),
    ("address", "Business address", "Provide your store location."),
    ("approval", "Admin approval", "Our team reviews your application."),
]


def _build_step(step_id, title, description, complete, action_path="", status="pending"):
    return {
        "id": step_id,
        "title": title,
        "description": description,
        "complete": complete,
        "status": "complete" if complete else status,
        "action_path": action_path,
    }


def _documents_complete(merchant) -> dict:
    has_license = bool(merchant.business_license)
    has_owner_id = bool(merchant.national_id)
    has_logo = bool(merchant.logo)
    has_store_photo = bool(merchant.store_cover_image)
    missing = []
    if not has_license:
        missing.append("business_license")
    if not has_owner_id:
        missing.append("owner_id")
    if not has_logo:
        missing.append("logo")
    if not has_store_photo:
        missing.append("store_photo")
    return {
        "all_uploaded": len(missing) == 0,
        "missing": missing,
        "has_license": has_license,
        "has_owner_id": has_owner_id,
        "has_logo": has_logo,
        "has_store_photo": has_store_photo,
    }


def build_merchant_onboarding_state(user, merchant=None) -> dict:
    if not merchant:
        steps = [
            _build_step(sid, title, desc, False, "/merchant/register", "required")
            for sid, title, desc in MERCHANT_STEP_DEFINITIONS
        ]
        return {
            "ready": False,
            "can_operate": False,
            "message": "Register your business to get started.",
            "status": "",
            "steps": steps,
        }

    owner = merchant.owner
    phone_verified = bool(owner.is_phone_verified)
    docs = _documents_complete(merchant)
    address_complete = bool((merchant.address or "").strip())
    review, _ = MerchantDocumentReview.objects.get_or_create(merchant=merchant)
    docs_reviewed = review.all_approved()
    approved = merchant.status == "approved" and merchant.is_active

    steps = [
        _build_step("account", *MERCHANT_STEP_DEFINITIONS[0][1:], True, "/merchant"),
        _build_step(
            "phone",
            *MERCHANT_STEP_DEFINITIONS[1][1:],
            phone_verified,
            "/merchant/settings",
            "required" if not phone_verified else "complete",
        ),
        _build_step(
            "documents",
            *MERCHANT_STEP_DEFINITIONS[2][1:],
            docs["all_uploaded"],
            "/merchant/register",
            "required" if not docs["all_uploaded"] else "pending",
        ),
        _build_step(
            "branding",
            *MERCHANT_STEP_DEFINITIONS[3][1:],
            docs["has_logo"] and docs["has_store_photo"],
            "/merchant/settings",
        ),
        _build_step(
            "address",
            *MERCHANT_STEP_DEFINITIONS[4][1:],
            address_complete,
            "/merchant/settings",
        ),
        _build_step(
            "approval",
            *MERCHANT_STEP_DEFINITIONS[5][1:],
            approved,
            "",
            merchant.status if merchant.status != "approved" else "complete",
        ),
    ]

    ready = (
        phone_verified
        and docs["all_uploaded"]
        and address_complete
        and docs_reviewed
        and approved
    )

    return {
        "ready": ready,
        "can_operate": merchant.is_operational,
        "message": _status_message(merchant, phone_verified, docs, docs_reviewed),
        "status": merchant.status,
        "rejection_reason": merchant.rejection_reason,
        "document_review": {
            "business_license": review.business_license_status,
            "owner_id": review.owner_id_status,
            "logo": review.logo_status,
            "store_photo": review.store_photo_status,
            "all_approved": docs_reviewed,
        },
        "documents": docs,
        "steps": steps,
    }


def _status_message(merchant, phone_verified, docs, docs_reviewed):
    if merchant.status == "suspended":
        return "Your merchant account is suspended. Contact support."
    if merchant.status == "rejected":
        return merchant.rejection_reason or "Your application was rejected."
    if not phone_verified:
        return "Verify your phone number to continue."
    if not docs["all_uploaded"]:
        return "Upload all required documents."
    if merchant.status == "pending" and not docs_reviewed:
        return "Documents under review. We'll notify you when approved."
    if merchant.status == "approved":
        return "Your store is verified and operational."
    return "Complete onboarding to start selling."
