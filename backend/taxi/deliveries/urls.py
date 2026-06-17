from django.urls import path

from .views import (
    accept_delivery,
    admin_analytics,
    admin_disputes,
    available_deliveries,
    business_account_detail,
    business_accounts_list,
    cancel_delivery,
    confirm_delivery,
    confirm_stop,
    create_dispute,
    delivery_detail,
    delivery_tracking,
    driver_delivery_mode,
    my_deliveries,
    pickup_delivery,
    request_delivery,
    resolve_dispute,
    service_categories,
    start_delivery,
)


urlpatterns = [
    # Rider endpoints
    path("request/", request_delivery, name="delivery-request"),
    path("mine/", my_deliveries, name="delivery-mine"),
    path("categories/", service_categories, name="delivery-categories"),
    path("<int:delivery_id>/", delivery_detail, name="delivery-detail"),
    path("<int:delivery_id>/tracking/", delivery_tracking, name="delivery-tracking"),
    path("<int:delivery_id>/cancel/", cancel_delivery, name="delivery-cancel"),
    path("<int:delivery_id>/dispute/", create_dispute, name="delivery-dispute"),

    # Driver endpoints
    path("available/", available_deliveries, name="delivery-available"),
    path("<int:delivery_id>/accept/", accept_delivery, name="delivery-accept"),
    path("<int:delivery_id>/pickup/", pickup_delivery, name="delivery-pickup"),
    path("<int:delivery_id>/start/", start_delivery, name="delivery-start"),
    path("<int:delivery_id>/confirm/", confirm_delivery, name="delivery-confirm"),
    path(
        "<int:delivery_id>/stops/<int:stop_id>/confirm/",
        confirm_stop,
        name="delivery-stop-confirm",
    ),
    path("driver/mode/", driver_delivery_mode, name="delivery-driver-mode"),

    # Admin endpoints
    path("admin/analytics/", admin_analytics, name="delivery-admin-analytics"),
    path("admin/disputes/", admin_disputes, name="delivery-admin-disputes"),
    path(
        "admin/disputes/<int:dispute_id>/resolve/",
        resolve_dispute,
        name="delivery-admin-dispute-resolve",
    ),
    path("admin/business-accounts/", business_accounts_list, name="delivery-business-accounts"),
    path(
        "admin/business-accounts/<int:account_id>/",
        business_account_detail,
        name="delivery-business-account-detail",
    ),
]
