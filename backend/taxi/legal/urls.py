from django.urls import path

from . import views

urlpatterns = [
    path("versions/", views.legal_versions, name="legal-versions"),
    path("status/", views.legal_status, name="legal-status"),
    path("courier/e-sign/", views.courier_e_sign, name="legal-courier-esign"),
    path("driver/e-sign/", views.driver_e_sign, name="legal-driver-esign"),
    path("merchant/e-sign/", views.merchant_e_sign, name="legal-merchant-esign"),
    path("customer/accept/", views.accept_customer_legal, name="legal-customer-accept"),
    path("rider/accept/", views.accept_rider_legal, name="legal-rider-accept"),
    path("ride/accept/", views.accept_ride_legal, name="legal-ride-accept"),
    path("admin/logs/", views.admin_compliance_logs, name="legal-admin-logs"),
    path("admin/agreements/", views.admin_signed_agreements, name="legal-admin-agreements"),
]
