from django.urls import path

from .views import (
    admin_active_trips,
    admin_incident_detail,
    admin_incidents,
    admin_response_log,
    admin_trip_replay,
    create_trip_share,
    emergency_contact_detail,
    emergency_contacts,
    incidents,
    monitoring_ping,
    monitoring_respond,
    monitoring_status,
    shared_trip,
    trigger_sos,
)


urlpatterns = [
    path("contacts/", emergency_contacts),
    path("contacts/<int:contact_id>/", emergency_contact_detail),
    path("sos/", trigger_sos),
    path("incidents/", incidents),
    path("trip-share/", create_trip_share),
    path("shared-trip/<str:token>/", shared_trip),
    path("monitoring/ping/", monitoring_ping),
    path("monitoring/status/", monitoring_status),
    path("monitoring/respond/", monitoring_respond),
    path("admin/incidents/", admin_incidents),
    path("admin/incidents/<int:incident_id>/", admin_incident_detail),
    path("admin/active-trips/", admin_active_trips),
    path("admin/trip-replay/<int:ride_id>/", admin_trip_replay),
    path("admin/response-log/", admin_response_log),
]

