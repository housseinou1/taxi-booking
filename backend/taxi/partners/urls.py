from django.urls import path

from . import views

urlpatterns = [
    path("dashboard/", views.partner_portal_dashboard, name="partner-portal-dashboard"),
    path("settlements/", views.partner_portal_settlements, name="partner-portal-settlements"),
]
