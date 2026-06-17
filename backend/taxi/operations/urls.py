from django.urls import path

from .views import complete_maintenance, maintenance_reminders

urlpatterns = [
    path("maintenance/", maintenance_reminders),
    path("maintenance/<int:reminder_id>/complete/", complete_maintenance),
]

