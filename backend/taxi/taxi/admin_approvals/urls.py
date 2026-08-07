"""URL configuration for Admin Approval Center."""
from django.urls import path
from . import views

urlpatterns = [
    path("stats/", views.approval_stats, name="approval-stats"),
    path("riders/", views.rider_queue, name="approval-rider-queue"),
    path("drivers/", views.driver_queue, name="approval-driver-queue"),
    path("couriers/", views.courier_queue, name="approval-courier-queue"),
    path("riders/<int:user_id>/<str:action>/", views.rider_action, name="approval-rider-action"),
    path("drivers/<int:user_id>/<str:action>/", views.driver_action, name="approval-driver-action"),
    path("couriers/<int:user_id>/<str:action>/", views.courier_action, name="approval-courier-action"),
    path("riders/bulk/", views.bulk_action, {"target_type": "riders"}, name="approval-rider-bulk"),
    path("drivers/bulk/", views.bulk_action, {"target_type": "drivers"}, name="approval-driver-bulk"),
    path("couriers/bulk/", views.bulk_action, {"target_type": "couriers"}, name="approval-courier-bulk"),
    path("history/", views.approval_history, name="approval-history"),
]
