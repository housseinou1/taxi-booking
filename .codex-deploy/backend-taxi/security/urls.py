from django.urls import path

from . import views

urlpatterns = [
    # Customer verification
    path("customer/verification/", views.customer_verification, name="security-customer-verification"),
    path("customer/profile-photo/", views.customer_profile_photo, name="security-customer-photo"),
    path("customer/addresses/", views.saved_addresses, name="security-saved-addresses"),
    path(
        "customer/addresses/<int:address_id>/",
        views.saved_address_detail,
        name="security-saved-address-detail",
    ),
    path(
        "customer/delivery-defaults/",
        views.delivery_instruction_defaults,
        name="security-delivery-defaults",
    ),
    # Courier / merchant status
    path("courier/verification/", views.courier_verification, name="security-courier-verification"),
    path("merchant/verification/", views.merchant_verification, name="security-merchant-verification"),
    # Admin
    path("admin/audit-logs/", views.admin_audit_logs, name="security-admin-audit-logs"),
    path("admin/fraud-flags/", views.admin_fraud_flags, name="security-admin-fraud-flags"),
    path(
        "admin/fraud-flags/<int:flag_id>/review/",
        views.admin_fraud_flag_review,
        name="security-admin-fraud-review",
    ),
    path("admin/couriers/", views.admin_pending_couriers, name="security-admin-couriers"),
    path(
        "admin/couriers/<int:driver_id>/action/",
        views.admin_courier_action,
        name="security-admin-courier-action",
    ),
    path("admin/merchants/", views.admin_pending_merchants, name="security-admin-merchants"),
    path(
        "admin/merchants/<int:merchant_id>/documents/",
        views.admin_merchant_document_review,
        name="security-admin-merchant-doc-review",
    ),
    path(
        "admin/merchants/<int:merchant_id>/action/",
        views.admin_merchant_action,
        name="security-admin-merchant-action",
    ),
    path(
        "admin/users/<int:user_id>/fraud-scan/",
        views.admin_run_fraud_scan,
        name="security-admin-fraud-scan",
    ),
]
