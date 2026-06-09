from django.urls import path

from .views import (
    admin_incident_detail,
    admin_incidents,
    create_trip_share,
    emergency_contact_detail,
    emergency_contacts,
    incidents,
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
    path("admin/incidents/", admin_incidents),
    path("admin/incidents/<int:incident_id>/", admin_incident_detail),
]

